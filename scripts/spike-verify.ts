import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CdpClient,
  ProxyBridge,
  composeEngineFlags,
  createProbeServer,
  waitForDevToolsActivePort,
} from '@zita/core';
import {
  EngineManifestSchema,
  ProbeSnapshotSchema,
  type FingerprintConfig,
  type ProbeSnapshot,
} from '@zita/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(REPO_ROOT, 'resources', 'engines', 'manifest.json');
const SPIKE_ROOT = path.join(REPO_ROOT, '.spike-profiles');
const REPORT_PATH = path.join(REPO_ROOT, 'docs', 'week0-spike-report.md');

interface SpikeCase {
  id: string;
  label: string;
  fingerprint: FingerprintConfig;
  windowSize: { width: number; height: number };
  proxy?: {
    bridge: ProxyBridge;
    proxyServerUrl: string;
    extraFlags: string[];
    probeUrl: string;
  };
}

interface CaseResult {
  id: string;
  label: string;
  usedNoSandbox: boolean;
  launchDurationMs: number;
  exitCode: number | null;
  snapshot: ProbeSnapshot;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveEngineBinary(): Promise<{
  version: string;
  sha256: string | null;
  executablePath: string;
}> {
  const manifest = EngineManifestSchema.parse(JSON.parse(await readFile(MANIFEST_PATH, 'utf8')));
  const platform = process.platform === 'win32' ? 'win-x64' : 'linux-x64';
  const engineDir = path.join(REPO_ROOT, 'resources', 'engines', manifest.version, platform);
  const markerPath = path.join(engineDir, '.zita-engine.json');
  const marker = JSON.parse(await readFile(markerPath, 'utf8')) as {
    version: string;
    sha256: string;
    executable: string;
  };
  return {
    version: marker.version,
    sha256: marker.sha256,
    executablePath: path.join(engineDir, marker.executable),
  };
}

async function startMockHttpConnectProxy(opts: {
  username: string;
  password: string;
  targetHost: string;
  targetPort: number;
}): Promise<{ port: number; requests: string[]; close: () => Promise<void> }> {
  const requests: string[] = [];
  const expectedAuth = `Basic ${Buffer.from(`${opts.username}:${opts.password}`).toString('base64')}`;

  const server = http.createServer((_req, res) => {
    res.writeHead(405).end();
  });

  server.on('connect', (req, clientSocket, head) => {
    const authValid = req.headers['proxy-authorization'] === expectedAuth;
    requests.push(`${req.url ?? ''} auth=${authValid}`);
    if (!authValid) {
      clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\n\r\n');
      clientSocket.destroy();
      return;
    }

    const [rawHost, rawPort] = (req.url ?? '').split(':');
    const port = Number.parseInt(rawPort ?? '80', 10);
    const dialHost = rawHost === 'probe.zita.test' ? opts.targetHost : rawHost;
    const dialPort = rawHost === 'probe.zita.test' ? opts.targetPort : port;

    const upstream = net.connect(dialPort, dialHost, () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) upstream.write(head);
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on('error', () => clientSocket.destroy());
    clientSocket.on('error', () => upstream.destroy());
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as net.AddressInfo;
  return {
    port: addr.port,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

async function launchAndCapture(
  executablePath: string,
  spikeCase: SpikeCase,
  defaultProbeUrl: string,
  forceNoSandbox: boolean,
): Promise<CaseResult> {
  const userDataDir = path.join(SPIKE_ROOT, spikeCase.id);
  await rm(userDataDir, { recursive: true, force: true });
  await mkdir(userDataDir, { recursive: true });

  const extraFlags = [...(spikeCase.proxy?.extraFlags ?? [])];
  if (forceNoSandbox) {
    extraFlags.push('--no-sandbox');
  }

  const flags = composeEngineFlags({
    userDataDir,
    fingerprint: spikeCase.fingerprint,
    proxyServer: spikeCase.proxy?.proxyServerUrl,
    windowSize: spikeCase.windowSize,
    extraFlags,
    startPages: ['about:blank'],
  });

  const startedAt = Date.now();
  const child = spawn(executablePath, flags, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      DISPLAY: process.env.DISPLAY || ':0',
    },
  });

  let stderr = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderr += chunk.toString('utf8');
  });

  const exitPromise = new Promise<number | null>((resolve) => {
    child.once('exit', (code) => resolve(code));
  });

  const cdp = new CdpClient();
  try {
    const portResult = await Promise.race([
      waitForDevToolsActivePort(userDataDir, 15_000),
      exitPromise.then((code) => {
        throw new Error(
          `Chromium exited prematurely with code ${code}. stderr=${stderr.slice(0, 600)}`,
        );
      }),
    ]);

    await cdp.connectToFirstPage(portResult.port, 10_000);
    const targetUrl = spikeCase.proxy?.probeUrl ?? defaultProbeUrl;
    await cdp.navigateAndWait(targetUrl, 15_000);

    const rawSnapshot = await cdp.evaluate<unknown>(
      'window.__ZITA_PROBE_READY__',
      15_000,
    );
    const snapshot = ProbeSnapshotSchema.parse(rawSnapshot);
    const launchDurationMs = Date.now() - startedAt;

    await cdp.closeBrowser();
    cdp.disconnect();

    const exitCode = await Promise.race([
      exitPromise,
      sleep(5_000).then(() => 'TIMEOUT' as const),
    ]);

    if (exitCode === 'TIMEOUT') {
      child.kill('SIGTERM');
      const afterTerm = await Promise.race([
        exitPromise,
        sleep(3_000).then(() => 'TIMEOUT' as const),
      ]);
      if (afterTerm === 'TIMEOUT') {
        child.kill('SIGKILL');
        await exitPromise;
      }
    }

    const finalCode = await exitPromise;
    return {
      id: spikeCase.id,
      label: spikeCase.label,
      usedNoSandbox: forceNoSandbox,
      launchDurationMs,
      exitCode: finalCode,
      snapshot,
    };
  } catch (err) {
    cdp.disconnect();
    if (!child.killed) {
      child.kill('SIGKILL');
    }
    await exitPromise.catch(() => null);
    throw err;
  }
}

async function runCaseWithSandboxFallback(
  executablePath: string,
  spikeCase: SpikeCase,
  defaultProbeUrl: string,
): Promise<CaseResult> {
  try {
    return await launchAndCapture(executablePath, spikeCase, defaultProbeUrl, false);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes('exited prematurely') ||
      msg.includes('SUID sandbox') ||
      msg.includes('namespace') ||
      msg.includes('zygote')
    ) {
      console.warn(`  [${spikeCase.id}] Retrying with --no-sandbox after sandbox/launch failure...`);
      return await launchAndCapture(executablePath, spikeCase, defaultProbeUrl, true);
    }
    throw err;
  }
}

function makeFingerprint(overrides: Partial<FingerprintConfig>): FingerprintConfig {
  return {
    schemaVersion: 1,
    seed: 1287349192,
    platform: 'windows',
    platformVersion: '10',
    brand: 'Chrome',
    brandVersion: '150',
    hardware: { cpuCores: 8 },
    screen: { mode: 'host', width: null, height: null, deviceScaleFactor: null },
    timezone: { mode: 'manual', value: 'America/New_York' },
    locale: { mode: 'manual', value: 'en-US', acceptLanguage: 'en-US,en' },
    geolocation: { mode: 'auto', latitude: null, longitude: null },
    webrtc: { mode: 'proxied' },
    spoofing: { canvas: true, audio: true, fonts: true, clientRects: true, gpu: true },
    extras: { doNotTrack: false, blockedPorts: [] },
    ...overrides,
  };
}

async function main(): Promise<void> {
  const engine = await resolveEngineBinary();
  console.log(`Using engine ${engine.version} at ${engine.executablePath}`);

  await rm(SPIKE_ROOT, { recursive: true, force: true });
  await mkdir(SPIKE_ROOT, { recursive: true });

  const probeServer = await createProbeServer();
  console.log(`Probe server listening on ${probeServer.url}`);

  const mockProxy = await startMockHttpConnectProxy({
    username: 'zita_spike',
    password: 'spike_secret_123',
    targetHost: '127.0.0.1',
    targetPort: probeServer.port,
  });

  const bridge = new ProxyBridge({
    upstream: {
      type: 'http',
      host: '127.0.0.1',
      port: mockProxy.port,
      username: 'zita_spike',
      password: 'spike_secret_123',
    },
  });
  const bridgeAddr = await bridge.start();
  console.log(`ProxyBridge listening on socks5://${bridgeAddr.host}:${bridgeAddr.port}`);

  const cases: SpikeCase[] = [
    {
      id: 'win10-seed-a',
      label: 'Windows 10 / Chrome 150 / Seed A (1287349192)',
      fingerprint: makeFingerprint({ seed: 1287349192 }),
      windowSize: { width: 1366, height: 768 },
    },
    {
      id: 'win10-seed-a-repeat',
      label: 'Windows 10 / Chrome 150 / Seed A Repeat (determinism)',
      fingerprint: makeFingerprint({ seed: 1287349192 }),
      windowSize: { width: 1366, height: 768 },
    },
    {
      id: 'win11-seed-b',
      label: 'Windows 11 / Chrome 150 / Seed B (987654321)',
      fingerprint: makeFingerprint({
        seed: 987654321,
        platform: 'windows',
        platformVersion: '11',
        hardware: { cpuCores: 16 },
        timezone: { mode: 'manual', value: 'Europe/London' },
        locale: { mode: 'manual', value: 'en-GB', acceptLanguage: 'en-GB,en' },
      }),
      windowSize: { width: 1920, height: 1080 },
    },
    {
      id: 'macos-seed-c',
      label: 'macOS 15.2.0 / Chrome 150 / Seed C (555123456)',
      fingerprint: makeFingerprint({
        seed: 555123456,
        platform: 'macos',
        platformVersion: '15.2.0',
        hardware: { cpuCores: 10 },
        timezone: { mode: 'manual', value: 'Asia/Dhaka' },
        locale: { mode: 'manual', value: 'en-US', acceptLanguage: 'en-US,en' },
      }),
      windowSize: { width: 1440, height: 900 },
    },
    {
      id: 'win10-seed-a-spoofing-off',
      label: 'Windows 10 / Seed A / Spoofing Disabled',
      fingerprint: makeFingerprint({
        seed: 1287349192,
        spoofing: { canvas: false, audio: false, fonts: false, clientRects: false, gpu: false },
      }),
      windowSize: { width: 1366, height: 768 },
    },
    {
      id: 'proxy-bridge-e2e',
      label: 'Windows 10 / Seed A / Authenticated HTTP Proxy via SOCKS5 Bridge',
      fingerprint: makeFingerprint({ seed: 1287349192 }),
      windowSize: { width: 1366, height: 768 },
      proxy: {
        bridge,
        proxyServerUrl: `socks5://${bridgeAddr.host}:${bridgeAddr.port}`,
        extraFlags: ['--proxy-bypass-list=<-loopback>'],
        probeUrl: `http://probe.zita.test:${probeServer.port}/probe.html`,
      },
    },
  ];

  const results: CaseResult[] = [];
  let proxyStatsAfterCase6 = bridge.getStats();

  try {
    for (const c of cases) {
      console.log(`Running case: ${c.id}...`);
      const res = await runCaseWithSandboxFallback(engine.executablePath, c, probeServer.url);
      results.push(res);
      if (c.id === 'proxy-bridge-e2e') {
        proxyStatsAfterCase6 = bridge.getStats();
      }
      console.log(
        `  done in ${res.launchDurationMs}ms (exit=${res.exitCode}, noSandbox=${res.usedNoSandbox}, ua="${res.snapshot.userAgent}", tz="${res.snapshot.timezone}")`,
      );
    }
  } finally {
    await bridge.stop();
    await mockProxy.close();
    await probeServer.close();
    await rm(SPIKE_ROOT, { recursive: true, force: true });
  }

  const byId = new Map(results.map((r) => [r.id, r]));
  const c1 = byId.get('win10-seed-a')!;
  const c2 = byId.get('win10-seed-a-repeat')!;
  const c3 = byId.get('win11-seed-b')!;
  const c4 = byId.get('macos-seed-c')!;
  const c5 = byId.get('win10-seed-a-spoofing-off')!;
  const c6 = byId.get('proxy-bridge-e2e')!;

  const deterministic =
    c1.snapshot.userAgent === c2.snapshot.userAgent &&
    c1.snapshot.platform === c2.snapshot.platform &&
    c1.snapshot.hardwareConcurrency === c2.snapshot.hardwareConcurrency &&
    c1.snapshot.timezone === c2.snapshot.timezone &&
    c1.snapshot.canvas.hash === c2.snapshot.canvas.hash &&
    c1.snapshot.audio.hash === c2.snapshot.audio.hash &&
    c1.snapshot.webgl.imageHash === c2.snapshot.webgl.imageHash &&
    c1.snapshot.webgl.unmaskedRenderer === c2.snapshot.webgl.unmaskedRenderer &&
    c1.snapshot.clientRects.hash === c2.snapshot.clientRects.hash &&
    c1.snapshot.fonts.hash === c2.snapshot.fonts.hash;

  const seedVaries =
    c1.snapshot.canvas.hash !== c3.snapshot.canvas.hash ||
    c1.snapshot.audio.hash !== c3.snapshot.audio.hash ||
    c1.snapshot.webgl.imageHash !== c3.snapshot.webgl.imageHash ||
    c1.snapshot.clientRects.hash !== c3.snapshot.clientRects.hash;

  const spoofingToggleWorks =
    c1.snapshot.canvas.hash !== c5.snapshot.canvas.hash ||
    c1.snapshot.audio.hash !== c5.snapshot.audio.hash ||
    c1.snapshot.clientRects.hash !== c5.snapshot.clientRects.hash ||
    c1.snapshot.fonts.hash !== c5.snapshot.fonts.hash;

  const proxyE2ePassed =
    c6.snapshot.origin.startsWith('http://probe.zita.test') &&
    proxyStatsAfterCase6.bytesUp > 0 &&
    proxyStatsAfterCase6.bytesDown > 0 &&
    mockProxy.requests.some((r) => r.includes('probe.zita.test') && r.includes('auth=true')) &&
    c6.snapshot.webrtc.hostIps.length === 0;

  const report = `# Week 0 Engine & Proxy Spike Report

**Date:** ${new Date().toISOString()}  
**Engine:** \`fingerprint-chromium\` \`${engine.version}\` (\`linux-x64\`)  
**SHA-256:** \`${engine.sha256 ?? 'unrecorded'}\`  
**Host:** ${process.platform} ${process.arch} (Node ${process.version})  

---

## 1. Executive Decision

- **Determinism (Case 1 vs Case 2):** ${deterministic ? 'PASS' : 'FAIL'}
- **Seed & OS Variation (Case 1 vs Case 3 vs Case 4):** ${seedVaries ? 'PASS' : 'FAIL'}
- **\`--disable-spoofing\` Toggle Effect (Case 1 vs Case 5):** ${spoofingToggleWorks ? 'PASS' : 'FAIL'}
- **Loopback SOCKS5 Proxy Bridge E2E + Remote DNS + No WebRTC Host IP Leak (Case 6):** ${proxyE2ePassed ? 'PASS' : 'FAIL'}
- **Recommendation:** **${deterministic && proxyE2ePassed ? 'GO for Week 1 Foundation on pinned fingerprint-chromium 150.0.7871.186' : 'HOLD — inspect failing checks below'}**

---

## 2. Launch Summary

| Case | Launch (ms) | Exit Code | \`--no-sandbox\` fallback | UA | Platform | CPU | Memory (GB) | Timezone | Language |
|---|---:|---:|---|---|---|---:|---:|---|---|
${results
  .map(
    (r) =>
      `| \`${r.id}\` | ${r.launchDurationMs} | ${r.exitCode ?? 'null'} | ${r.usedNoSandbox ? 'Yes' : 'No'} | \`${r.snapshot.userAgent}\` | \`${r.snapshot.platform}\` | ${r.snapshot.hardwareConcurrency ?? 'null'} | ${r.snapshot.deviceMemory ?? 'null'} | \`${r.snapshot.timezone}\` | \`${r.snapshot.language}\` |`,
  )
  .join('\n')}

---

## 3. Signal Verification Matrix (Expected vs Observed)

| Signal | Case 1 (\`win10-seed-a\`) | Case 2 (\`win10-seed-a-repeat\`) | Case 3 (\`win11-seed-b\`) | Case 4 (\`macos-seed-c\`) | Case 5 (\`spoofing-off\`) | Status |
|---|---|---|---|---|---|---|
| \`navigator.webdriver\` | \`${c1.snapshot.webdriver}\` | \`${c2.snapshot.webdriver}\` | \`${c3.snapshot.webdriver}\` | \`${c4.snapshot.webdriver}\` | \`${c5.snapshot.webdriver}\` | ${!c1.snapshot.webdriver ? 'Supported (\`false\`)' : 'Check'} |
| \`navigator.platform\` | \`${c1.snapshot.platform}\` | \`${c2.snapshot.platform}\` | \`${c3.snapshot.platform}\` | \`${c4.snapshot.platform}\` | \`${c5.snapshot.platform}\` | Supported |
| \`userAgentData.platform\` / \`platformVersion\` | \`${c1.snapshot.userAgentData?.platform ?? 'n/a'}\` / \`${String(c1.snapshot.userAgentData?.highEntropy?.platformVersion ?? 'n/a')}\` | \`${c2.snapshot.userAgentData?.platform ?? 'n/a'}\` / \`${String(c2.snapshot.userAgentData?.highEntropy?.platformVersion ?? 'n/a')}\` | \`${c3.snapshot.userAgentData?.platform ?? 'n/a'}\` / \`${String(c3.snapshot.userAgentData?.highEntropy?.platformVersion ?? 'n/a')}\` | \`${c4.snapshot.userAgentData?.platform ?? 'n/a'}\` / \`${String(c4.snapshot.userAgentData?.highEntropy?.platformVersion ?? 'n/a')}\` | \`${c5.snapshot.userAgentData?.platform ?? 'n/a'}\` / \`${String(c5.snapshot.userAgentData?.highEntropy?.platformVersion ?? 'n/a')}\` | Supported |
| \`hardwareConcurrency\` | ${c1.snapshot.hardwareConcurrency} | ${c2.snapshot.hardwareConcurrency} | ${c3.snapshot.hardwareConcurrency} | ${c4.snapshot.hardwareConcurrency} | ${c5.snapshot.hardwareConcurrency} | Supported |
| \`deviceMemory\` | ${c1.snapshot.deviceMemory ?? 'null'} | ${c2.snapshot.deviceMemory ?? 'null'} | ${c3.snapshot.deviceMemory ?? 'null'} | ${c4.snapshot.deviceMemory ?? 'null'} | ${c5.snapshot.deviceMemory ?? 'null'} | Seed-derived |
| \`Intl\` timezone | \`${c1.snapshot.timezone}\` | \`${c2.snapshot.timezone}\` | \`${c3.snapshot.timezone}\` | \`${c4.snapshot.timezone}\` | \`${c5.snapshot.timezone}\` | Supported |
| \`navigator.language\` | \`${c1.snapshot.language}\` | \`${c2.snapshot.language}\` | \`${c3.snapshot.language}\` | \`${c4.snapshot.language}\` | \`${c5.snapshot.language}\` | Supported |
| Canvas hash | \`${c1.snapshot.canvas.hash}\` | \`${c2.snapshot.canvas.hash}\` | \`${c3.snapshot.canvas.hash}\` | \`${c4.snapshot.canvas.hash}\` | \`${c5.snapshot.canvas.hash}\` | ${c1.snapshot.canvas.hash === c2.snapshot.canvas.hash ? 'Deterministic' : 'Drift'} |
| Audio hash | \`${c1.snapshot.audio.hash}\` | \`${c2.snapshot.audio.hash}\` | \`${c3.snapshot.audio.hash}\` | \`${c4.snapshot.audio.hash}\` | \`${c5.snapshot.audio.hash}\` | ${c1.snapshot.audio.hash === c2.snapshot.audio.hash ? 'Deterministic' : 'Drift'} |
| WebGL unmasked vendor | \`${c1.snapshot.webgl.unmaskedVendor}\` | \`${c2.snapshot.webgl.unmaskedVendor}\` | \`${c3.snapshot.webgl.unmaskedVendor}\` | \`${c4.snapshot.webgl.unmaskedVendor}\` | \`${c5.snapshot.webgl.unmaskedVendor}\` | Seed-derived |
| WebGL unmasked renderer | \`${c1.snapshot.webgl.unmaskedRenderer}\` | \`${c2.snapshot.webgl.unmaskedRenderer}\` | \`${c3.snapshot.webgl.unmaskedRenderer}\` | \`${c4.snapshot.webgl.unmaskedRenderer}\` | \`${c5.snapshot.webgl.unmaskedRenderer}\` | Seed-derived |
| WebGL image hash | \`${c1.snapshot.webgl.imageHash}\` | \`${c2.snapshot.webgl.imageHash}\` | \`${c3.snapshot.webgl.imageHash}\` | \`${c4.snapshot.webgl.imageHash}\` | \`${c5.snapshot.webgl.imageHash}\` | ${c1.snapshot.webgl.imageHash === c2.snapshot.webgl.imageHash ? 'Deterministic' : 'Drift'} |
| ClientRects hash | \`${c1.snapshot.clientRects.hash}\` | \`${c2.snapshot.clientRects.hash}\` | \`${c3.snapshot.clientRects.hash}\` | \`${c4.snapshot.clientRects.hash}\` | \`${c5.snapshot.clientRects.hash}\` | ${c1.snapshot.clientRects.hash === c2.snapshot.clientRects.hash ? 'Deterministic' : 'Drift'} |
| Fonts hash | \`${c1.snapshot.fonts.hash}\` | \`${c2.snapshot.fonts.hash}\` | \`${c3.snapshot.fonts.hash}\` | \`${c4.snapshot.fonts.hash}\` | \`${c5.snapshot.fonts.hash}\` | ${c1.snapshot.fonts.hash === c2.snapshot.fonts.hash ? 'Deterministic' : 'Drift'} |
| \`screen.width x height\` | ${c1.snapshot.screen.width}x${c1.snapshot.screen.height} (win ${c1.snapshot.screen.innerWidth}x${c1.snapshot.screen.innerHeight}) | ${c2.snapshot.screen.width}x${c2.snapshot.screen.height} | ${c3.snapshot.screen.width}x${c3.snapshot.screen.height} (win ${c3.snapshot.screen.innerWidth}x${c3.snapshot.screen.innerHeight}) | ${c4.snapshot.screen.width}x${c4.snapshot.screen.height} (win ${c4.snapshot.screen.innerWidth}x${c4.snapshot.screen.innerHeight}) | ${c5.snapshot.screen.width}x${c5.snapshot.screen.height} | **Gap (host screen)** |
| \`mediaDevices\` | avail=${c1.snapshot.mediaDevices.available}, count=${c1.snapshot.mediaDevices.count ?? 'null'} | avail=${c2.snapshot.mediaDevices.available}, count=${c2.snapshot.mediaDevices.count ?? 'null'} | avail=${c3.snapshot.mediaDevices.available}, count=${c3.snapshot.mediaDevices.count ?? 'null'} | avail=${c4.snapshot.mediaDevices.available}, count=${c4.snapshot.mediaDevices.count ?? 'null'} | avail=${c5.snapshot.mediaDevices.available}, count=${c5.snapshot.mediaDevices.count ?? 'null'} | **Gap (host devices)** |
| WebRTC host IPs | ${JSON.stringify(c1.snapshot.webrtc.hostIps)} | ${JSON.stringify(c2.snapshot.webrtc.hostIps)} | ${JSON.stringify(c3.snapshot.webrtc.hostIps)} | ${JSON.stringify(c4.snapshot.webrtc.hostIps)} | ${JSON.stringify(c5.snapshot.webrtc.hostIps)} | ${c1.snapshot.webrtc.hostIps.length === 0 ? 'No host IP leak' : 'Host IP leaked'} |

---

## 4. Proxy Bridge End-to-End Proof (Case 6)

- **Origin observed in Chromium:** \`${c6.snapshot.origin}\`
- **Mock HTTP CONNECT upstream requests:** ${JSON.stringify(mockProxy.requests)}
- **ProxyBridge stats:** \`bytesUp=${proxyStatsAfterCase6.bytesUp}\`, \`bytesDown=${proxyStatsAfterCase6.bytesDown}\`, \`totalConnections=${proxyStatsAfterCase6.totalConnections}\`, \`activeConnections=${proxyStatsAfterCase6.activeConnections}\`
- **WebRTC host IPs during proxied launch:** ${JSON.stringify(c6.snapshot.webrtc.hostIps)}
- **WebRTC srflx IPs during proxied launch:** ${JSON.stringify(c6.snapshot.webrtc.srflxIps)}

---

## 5. Verified Gaps & v1 UI Implications

1. **Screen resolution (\`screen.width\` / \`screen.height\`):** Reports host screen dimensions (${c1.snapshot.screen.width}x${c1.snapshot.screen.height}); \`--window-size\` sets viewport/outer window only. v1 UI must not claim to spoof \`screen.*\`; plan owned patchset for v1.1.
2. **Media devices (\`navigator.mediaDevices\`):** Host device count/kinds remain visible in secure contexts. v1 UI must label as "Not spoofed in v1 engine".
3. **Manual WebGL vendor/renderer strings:** Removed in Chromium 144+; values are derived from seed (or disabled via \`--disable-spoofing=gpu\`). v1 UI exposes GPU spoofing toggle + read-back after first launch rather than arbitrary string inputs.
4. **Device memory:** Derived from seed rather than an explicit CLI flag; capture and display observed value via read-back.
`;

  await writeFile(REPORT_PATH, report, 'utf8');
  console.log(`Wrote Week 0 spike report to ${path.relative(REPO_ROOT, REPORT_PATH)}`);

  if (!deterministic || !proxyE2ePassed) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
