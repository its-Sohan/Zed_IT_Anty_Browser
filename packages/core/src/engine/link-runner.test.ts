import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LinkRunState } from '@zita/shared';
import { listCdpTargets, waitForDevToolsActivePort } from './cdp.js';
import {
  LinkRunnerService,
  type LinkTabDriver,
  type LinkTabOutcome,
  type LinkTabSession,
} from './link-runner.js';

function resolveLocalEngineExecutable(): string | null {
  const platformKey = process.platform === 'win32' ? 'win-x64' : 'linux-x64';
  const candidates = [
    path.resolve(process.cwd(), 'resources', 'engines', '150.0.7871.186', platformKey),
    path.resolve(__dirname, '..', '..', '..', '..', 'resources', 'engines', '150.0.7871.186', platformKey),
  ];
  for (const root of candidates) {
    const markerPath = path.join(root, '.zita-engine.json');
    if (!existsSync(markerPath)) continue;
    try {
      const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as { executable?: string };
      if (marker.executable) {
        const resolved = path.resolve(root, marker.executable);
        if (existsSync(resolved)) return resolved;
      }
    } catch {
      // continue
    }
  }
  return null;
}

function waitForRunDone(service: LinkRunnerService, profileId: string, timeoutMs = 2_000): Promise<LinkRunState> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const tick = () => {
      const st = service.getStatus(profileId);
      if (st.status !== 'running') {
        resolve(st);
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error('Timed out waiting for link run to finish'));
        return;
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe('LinkRunnerService', () => {
  it('opens each link sequentially, auto-closes tabs on load, crash, stutter, and timeout, then completes', async () => {
    const events: string[] = [];
    const outcomesByUrl: Record<string, LinkTabOutcome> = {
      'https://example.com/ok': { outcome: 'loaded' },
      'https://example.com/snap': { outcome: 'crashed', reason: 'Tab crashed ("Aw, Snap!")' },
      'https://example.com/stutter': { outcome: 'stuttered', reason: 'Tab became unresponsive for 8s' },
      'https://example.com/slow': { outcome: 'timeout', reason: 'Did not finish loading within 25s' },
    };

    let tabCounter = 0;
    const driver: LinkTabDriver = {
      async openTab() {
        const id = ++tabCounter;
        events.push(`open:${id}`);
        const session: LinkTabSession = {
          async navigateAndMonitor(url) {
            events.push(`nav:${id}:${url}`);
            return outcomesByUrl[url] ?? { outcome: 'loaded' };
          },
          async close() {
            events.push(`close:${id}`);
          },
        };
        return session;
      },
    };

    const transitions: LinkRunState[] = [];
    const service = new LinkRunnerService({
      getCdpInfo: (id) => (id === 'prof_1' ? { cdpPort: 9222, cdpWsPath: null } : null),
      onStateChange: (s) => transitions.push(s),
      driver,
    });

    await service.start({
      profileId: 'prof_1',
      urls: [
        'https://example.com/ok',
        'https://example.com/snap',
        'https://example.com/stutter',
        'https://example.com/slow',
      ],
      dwellAfterLoadMs: 0,
    });

    const finalState = await waitForRunDone(service, 'prof_1');
    expect(finalState.status).toBe('completed');
    expect(finalState.items.map((i) => i.status)).toEqual([
      'loaded',
      'crashed',
      'stuttered',
      'timeout',
    ]);
    expect(events).toEqual([
      'open:1',
      'nav:1:https://example.com/ok',
      'close:1',
      'open:2',
      'nav:2:https://example.com/snap',
      'close:2',
      'open:3',
      'nav:3:https://example.com/stutter',
      'close:3',
      'open:4',
      'nav:4:https://example.com/slow',
      'close:4',
    ]);
    expect(transitions.length).toBeGreaterThanOrEqual(5);
  });

  it('closes the active tab and transitions to stopped when stop() is called mid-run', async () => {
    let closedCount = 0;
    const driver: LinkTabDriver = {
      async openTab() {
        return {
          navigateAndMonitor(_url, { signal }) {
            return new Promise<LinkTabOutcome>((resolve) => {
              if (signal.aborted) {
                resolve({ outcome: 'aborted' });
                return;
              }
              signal.addEventListener('abort', () => resolve({ outcome: 'aborted' }), { once: true });
            });
          },
          async close() {
            closedCount += 1;
          },
        };
      },
    };

    const service = new LinkRunnerService({
      getCdpInfo: () => ({ cdpPort: 9222, cdpWsPath: null }),
      driver,
    });

    await service.start({
      profileId: 'prof_2',
      urls: ['https://example.com/1', 'https://example.com/2'],
      dwellAfterLoadMs: 0,
    });

    await new Promise((r) => setTimeout(r, 20));
    const stopped = await service.stop('prof_2');
    expect(stopped.status).toBe('stopped');
    expect(closedCount).toBe(1);
    expect(stopped.items[0]?.status).toBe('skipped');
    expect(stopped.items[1]?.status).toBe('pending');
  });

  it('rejects starting a run when the profile browser is not running', async () => {
    const service = new LinkRunnerService({
      getCdpInfo: () => null,
    });

    await expect(
      service.start({
        profileId: 'prof_offline',
        urls: ['https://example.com'],
      }),
    ).rejects.toThrow(/not running/i);
  });

  const engineExe = resolveLocalEngineExecutable();

  it.skipIf(!engineExe)(
    'runs links end-to-end against real Chromium via flattened CDP sessions and handles load + timeout',
    async () => {
      const server = http.createServer((req, res) => {
        if (req.url === '/slow') {
          // Intentionally never finish so loadTimeoutMs triggers
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.write('<html><body>loading...');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body><h1>Page ${req.url}</h1></body></html>`);
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const httpPort = (server.address() as { port: number }).port;

      const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'zita-link-runner-e2e-'));
      const child = spawn(
        engineExe!,
        [
          `--user-data-dir=${userDataDir}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--remote-debugging-port=0',
          '--remote-debugging-address=127.0.0.1',
          '--headless=new',
          '--mute-audio',
          ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
          'about:blank',
        ],
        { stdio: ['ignore', 'ignore', 'pipe'] },
      );

      try {
        const portInfo = await waitForDevToolsActivePort(userDataDir, 15_000);

        const service = new LinkRunnerService({
          getCdpInfo: () => ({ cdpPort: portInfo.port, cdpWsPath: portInfo.wsPath }),
        });

        await service.start({
          profileId: 'prof_e2e',
          urls: [
            `http://127.0.0.1:${httpPort}/ok-1`,
            `http://127.0.0.1:${httpPort}/slow`,
            `http://127.0.0.1:${httpPort}/ok-2`,
          ],
          loadTimeoutMs: 3_000,
          hangTimeoutMs: 2_000,
          dwellAfterLoadMs: 0,
        });

        const finalState = await waitForRunDone(service, 'prof_e2e', 25_000);
        expect(finalState.status).toBe('completed');
        expect(finalState.items.map((i) => i.status)).toEqual(['loaded', 'timeout', 'loaded']);

        // Browser should still be alive with its initial blank tab intact
        const remainingPages = (await listCdpTargets(portInfo.port)).filter((t) => t.type === 'page');
        expect(remainingPages.length).toBeGreaterThanOrEqual(1);
      } finally {
        child.kill(process.platform === 'win32' ? undefined : 'SIGKILL');
        server.closeAllConnections?.();
        server.close();
        rmSync(userDataDir, { recursive: true, force: true });
      }
    },
    35_000,
  );
});
