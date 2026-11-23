import http from 'node:http';
import type net from 'node:net';
import { ProbeSnapshotSchema, type ProbeSnapshot } from '@zita/shared';

export interface ProbeServer {
  port: number;
  url: string;
  waitForSnapshot: (timeoutMs?: number) => Promise<ProbeSnapshot>;
  close: () => Promise<void>;
}

const PROBE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Zed IT Anti Browser — Fingerprint Probe</title>
  <style>
    body { font-family: sans-serif; margin: 16px; background: #08080a; color: #f4f4f5; }
    .rects { position: absolute; left: -9999px; top: -9999px; font-size: 16px; line-height: 1.3; }
  </style>
</head>
<body>
  <pre id="out">Running probe...</pre>
  <div class="rects" id="rect-box">
    <span style="font-family: Arial, sans-serif;">Zed IT Anti Browser — 0123456789 mMwW@#</span>
    <span style="font-family: Georgia, serif;">Coherence verification test string</span>
    <span style="font-family: monospace;">1287349192</span>
  </div>
  <script>
    function fnv1a(str) {
      let h = 0x811c9dc5;
      for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
      }
      return (h >>> 0).toString(16).padStart(8, '0');
    }

    function hashBytes(bytes) {
      let h = 0x811c9dc5;
      for (let i = 0; i < bytes.length; i++) {
        h ^= bytes[i];
        h = Math.imul(h, 0x01000193);
      }
      return (h >>> 0).toString(16).padStart(8, '0');
    }

    function collectCanvas() {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 280;
        canvas.height = 60;
        const ctx = canvas.getContext('2d');
        if (!ctx) return { hash: null };
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('ZedIT-FP-Probe 123!', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('ZedIT-FP-Probe 123!', 4, 17);
        return { hash: fnv1a(canvas.toDataURL()) };
      } catch {
        return { hash: null };
      }
    }

    function collectWebgl() {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) {
          return { vendor: null, renderer: null, unmaskedVendor: null, unmaskedRenderer: null, imageHash: null };
        }
        const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
        const vendor = gl.getParameter(gl.VENDOR);
        const renderer = gl.getParameter(gl.RENDERER);
        const unmaskedVendor = debugExt ? gl.getParameter(debugExt.UNMASKED_VENDOR_WEBGL) : null;
        const unmaskedRenderer = debugExt ? gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL) : null;

        gl.clearColor(0.2, 0.4, 0.6, 1.0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const pixels = new Uint8Array(64 * 64 * 4);
        gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        return {
          vendor: vendor ? String(vendor) : null,
          renderer: renderer ? String(renderer) : null,
          unmaskedVendor: unmaskedVendor ? String(unmaskedVendor) : null,
          unmaskedRenderer: unmaskedRenderer ? String(unmaskedRenderer) : null,
          imageHash: hashBytes(pixels),
        };
      } catch {
        return { vendor: null, renderer: null, unmaskedVendor: null, unmaskedRenderer: null, imageHash: null };
      }
    }

    async function collectAudio() {
      try {
        const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!Ctx) return { hash: null, error: 'OfflineAudioContext unavailable' };
        const ctx = new Ctx(1, 5000, 44100);
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(10000, ctx.currentTime);
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-50, ctx.currentTime);
        comp.knee.setValueAtTime(40, ctx.currentTime);
        comp.ratio.setValueAtTime(12, ctx.currentTime);
        comp.attack.setValueAtTime(0, ctx.currentTime);
        comp.release.setValueAtTime(0.25, ctx.currentTime);
        osc.connect(comp);
        comp.connect(ctx.destination);
        osc.start(0);
        const rendered = await ctx.startRendering();
        const data = rendered.getChannelData(0);
        let acc = '';
        for (let i = 4500; i < 5000; i++) {
          acc += data[i].toFixed(6) + ',';
        }
        return { hash: fnv1a(acc), error: null };
      } catch (err) {
        return { hash: null, error: String(err) };
      }
    }

    function collectClientRects() {
      const spans = Array.from(document.querySelectorAll('#rect-box span'));
      const sample = spans.map((el) => {
        const r = el.getBoundingClientRect();
        return { width: Number(r.width.toFixed(6)), height: Number(r.height.toFixed(6)) };
      });
      return { hash: fnv1a(JSON.stringify(sample)), sample };
    }

    function collectFonts() {
      const baseFonts = ['monospace', 'sans-serif', 'serif'];
      const testFonts = ['Arial', 'Verdana', 'Times New Roman', 'Courier New', 'Georgia', 'Roboto', 'Segoe UI', 'Menlo'];
      const span = document.createElement('span');
      span.style.position = 'absolute';
      span.style.left = '-9999px';
      span.style.fontSize = '72px';
      span.textContent = 'mmmmmmmmmmlli';
      document.body.appendChild(span);

      const measuredWidths = {};
      for (const f of [...baseFonts, ...testFonts]) {
        span.style.fontFamily = '"' + f + '", monospace';
        measuredWidths[f] = span.offsetWidth;
      }
      span.remove();
      return { hash: fnv1a(JSON.stringify(measuredWidths)), measuredWidths };
    }

    async function collectUserAgentData() {
      const uad = navigator.userAgentData;
      if (!uad) return null;
      let highEntropy = null;
      try {
        highEntropy = await uad.getHighEntropyValues([
          'platform',
          'platformVersion',
          'architecture',
          'bitness',
          'model',
          'uaFullVersion',
          'fullVersionList',
        ]);
      } catch {
        highEntropy = null;
      }
      return {
        brands: Array.from(uad.brands || []).map((b) => ({ brand: String(b.brand), version: String(b.version) })),
        mobile: Boolean(uad.mobile),
        platform: String(uad.platform || ''),
        highEntropy,
      };
    }

    async function collectMediaDevices() {
      if (!navigator.mediaDevices || typeof navigator.mediaDevices.enumerateDevices !== 'function') {
        return { available: false, count: null, kinds: null };
      }
      try {
        const list = await navigator.mediaDevices.enumerateDevices();
        const kinds = {};
        for (const d of list) {
          kinds[d.kind] = (kinds[d.kind] || 0) + 1;
        }
        return { available: true, count: list.length, kinds };
      } catch {
        return { available: false, count: null, kinds: null };
      }
    }

    async function collectWebrtc() {
      if (typeof RTCPeerConnection !== 'function') {
        return { candidates: [], hostIps: [], srflxIps: [], error: 'RTCPeerConnection unavailable' };
      }
      return await new Promise((resolve) => {
        const candidates = [];
        const hostIps = new Set();
        const srflxIps = new Set();
        let finished = false;
        let pc = null;

        const done = () => {
          if (finished) return;
          finished = true;
          try { pc && pc.close(); } catch {}
          resolve({
            candidates,
            hostIps: Array.from(hostIps),
            srflxIps: Array.from(srflxIps),
            error: null,
          });
        };

        try {
          pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
          pc.createDataChannel('zita-probe');
          pc.onicecandidate = (ev) => {
            if (!ev.candidate) {
              done();
              return;
            }
            const c = ev.candidate.candidate || '';
            candidates.push(c);
            const parts = c.split(' ');
            const ip = parts[4];
            const typIdx = parts.indexOf('typ');
            const typ = typIdx !== -1 ? parts[typIdx + 1] : '';
            if (ip) {
              if (typ === 'host') hostIps.add(ip);
              if (typ === 'srflx') srflxIps.add(ip);
            }
          };
          pc.createOffer()
            .then((offer) => pc.setLocalDescription(offer))
            .catch((err) => {
              finished = true;
              resolve({ candidates, hostIps: [], srflxIps: [], error: String(err) });
            });
          setTimeout(done, 1500);
        } catch (err) {
          resolve({ candidates: [], hostIps: [], srflxIps: [], error: String(err) });
        }
      });
    }

    window.__ZITA_PROBE_READY__ = (async () => {
      const intlOpts = Intl.DateTimeFormat().resolvedOptions();
      const [userAgentData, audio, mediaDevices, webrtc] = await Promise.all([
        collectUserAgentData(),
        collectAudio(),
        collectMediaDevices(),
        collectWebrtc(),
      ]);

      const snapshot = {
        capturedAt: new Date().toISOString(),
        origin: location.origin,
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        webdriver: Boolean(navigator.webdriver),
        hardwareConcurrency: typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null,
        deviceMemory: typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : null,
        language: navigator.language,
        languages: Array.from(navigator.languages || []),
        plugins: Array.from(navigator.plugins || []).map((p) => p.name),
        userAgentData,
        timezone: intlOpts.timeZone,
        intlLocale: intlOpts.locale,
        timezoneOffset: new Date().getTimezoneOffset(),
        screen: {
          width: screen.width,
          height: screen.height,
          availWidth: screen.availWidth,
          availHeight: screen.availHeight,
          colorDepth: screen.colorDepth,
          devicePixelRatio: window.devicePixelRatio,
          innerWidth: window.innerWidth,
          innerHeight: window.innerHeight,
        },
        webgl: collectWebgl(),
        canvas: collectCanvas(),
        audio,
        clientRects: collectClientRects(),
        fonts: collectFonts(),
        mediaDevices,
        webrtc,
      };

      window.__ZITA_PROBE__ = snapshot;
      document.getElementById('out').textContent = JSON.stringify(snapshot, null, 2);
      fetch('/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(snapshot),
      }).catch(() => {});
      return snapshot;
    })();
  </script>
</body>
</html>`;

/**
 * Starts a local loopback HTTP server serving the deterministic fingerprint diagnostic probe.
 */
export async function createProbeServer(): Promise<ProbeServer> {
  let latestSnapshot: ProbeSnapshot | null = null;
  const waiters = new Set<(snap: ProbeSnapshot) => void>();

  const server = http.createServer((req, res) => {
    const reqPath = (req.url ?? '/').split('?')[0];
    if (req.method === 'POST' && reqPath === '/report') {
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (chunk) => {
        if (body.length < 1_000_000) body += chunk;
      });
      req.on('end', () => {
        try {
          const parsed = ProbeSnapshotSchema.parse(JSON.parse(body));
          latestSnapshot = parsed;
          for (const resolve of waiters) {
            resolve(parsed);
          }
          waiters.clear();
          res.writeHead(200, { 'content-type': 'application/json', connection: 'close' });
          res.end('{"ok":true}');
        } catch {
          res.writeHead(400, { 'content-type': 'application/json', connection: 'close' });
          res.end('{"ok":false}');
        }
      });
      return;
    }

    if (reqPath === '/ip') {
      res.writeHead(200, { 'content-type': 'application/json', connection: 'close' });
      res.end(
        JSON.stringify({
          ip: req.socket.remoteAddress ?? '127.0.0.1',
          host: req.headers.host ?? null,
        }),
      );
      return;
    }

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', connection: 'close' });
    res.end(PROBE_HTML);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as net.AddressInfo;

  return {
    port: addr.port,
    url: `http://127.0.0.1:${addr.port}/probe.html`,
    waitForSnapshot: (timeoutMs = 15_000) => {
      if (latestSnapshot) {
        return Promise.resolve(latestSnapshot);
      }
      return new Promise<ProbeSnapshot>((resolve, reject) => {
        const timer = setTimeout(() => {
          waiters.delete(onSnap);
          reject(new Error(`Timed out waiting for probe snapshot POST after ${timeoutMs}ms`));
        }, timeoutMs);
        const onSnap = (snap: ProbeSnapshot) => {
          clearTimeout(timer);
          resolve(snap);
        };
        waiters.add(onSnap);
      });
    },
    close: () => {
      server.closeAllConnections();
      return new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
