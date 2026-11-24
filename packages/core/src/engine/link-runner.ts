import {
  StartLinkRunInputSchema,
  type LinkRunItemState,
  type LinkRunState,
  type StartLinkRunInput,
} from '@zita/shared';
import { CdpClient, listCdpTargets } from './cdp.js';

export type LinkTabOutcome =
  | { outcome: 'loaded' }
  | { outcome: 'crashed'; reason: string }
  | { outcome: 'stuttered'; reason: string }
  | { outcome: 'timeout'; reason: string }
  | { outcome: 'error'; reason: string }
  | { outcome: 'aborted' };

export interface LinkTabMonitorOptions {
  loadTimeoutMs: number;
  hangTimeoutMs: number;
  signal: AbortSignal;
}

export interface LinkTabSession {
  navigateAndMonitor(url: string, options: LinkTabMonitorOptions): Promise<LinkTabOutcome>;
  close(): Promise<void>;
}

export interface LinkTabDriver {
  openTab(cdpPort: number, signal: AbortSignal): Promise<LinkTabSession>;
}

export interface LinkRunnerServiceDeps {
  getCdpPort: (profileId: string) => number | null;
  onStateChange?: (state: LinkRunState) => void;
  driver?: LinkTabDriver;
}

function sleepAbortable(ms: number, signal: AbortSignal): Promise<boolean> {
  if (ms <= 0) return Promise.resolve(!signal.aborted);
  if (signal.aborted) return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function waitForTargetWsUrl(
  port: number,
  targetId: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (signal.aborted) {
      throw new Error('Link run aborted');
    }
    try {
      const targets = await listCdpTargets(port);
      const match = targets.find((t) => t.id === targetId && t.webSocketDebuggerUrl);
      if (match?.webSocketDebuggerUrl) {
        return match.webSocketDebuggerUrl;
      }
    } catch {
      // Target list may briefly lag right after Target.createTarget
    }
    await sleepAbortable(60, signal);
  }
  throw new Error(`Timed out waiting for CDP target ${targetId} on 127.0.0.1:${port}`);
}

/**
 * Default CDP-backed tab driver that opens isolated tabs, monitors load/crash/stutter signals,
 * and closes each tab cleanly without closing the browser window.
 */
export class CdpLinkTabDriver implements LinkTabDriver {
  async openTab(cdpPort: number, signal: AbortSignal): Promise<LinkTabSession> {
    const browserCdp = new CdpClient();
    await browserCdp.connectToBrowser(cdpPort, 8_000);

    let targetId: string | null = null;
    const pageCdp = new CdpClient();

    try {
      const created = await browserCdp.send<{ targetId: string }>(
        'Target.createTarget',
        { url: 'about:blank' },
        8_000,
      );
      targetId = created.targetId;

      const wsUrl = await waitForTargetWsUrl(cdpPort, targetId, 8_000, signal);
      await pageCdp.connect(wsUrl, 8_000);
      await pageCdp.send('Page.enable', {}, 5_000);
      await pageCdp.send('Inspector.enable', {}, 5_000).catch(() => {
        // Some Chromium builds emit Inspector.targetCrashed even if Inspector.enable is a no-op
      });
    } catch (err) {
      pageCdp.disconnect();
      if (targetId) {
        await this.safeCloseTarget(browserCdp, cdpPort, targetId);
      }
      browserCdp.disconnect();
      throw err;
    }

    let closed = false;
    const safeClose = async () => {
      if (closed) return;
      closed = true;
      pageCdp.disconnect();
      if (targetId) {
        await this.safeCloseTarget(browserCdp, cdpPort, targetId);
      }
      browserCdp.disconnect();
    };

    return {
      navigateAndMonitor: (url, options) => this.monitorTab(pageCdp, url, options),
      close: safeClose,
    };
  }

  private async safeCloseTarget(browserCdp: CdpClient, cdpPort: number, targetId: string): Promise<void> {
    try {
      const targets = await listCdpTargets(cdpPort).catch(() => []);
      const pageTargets = targets.filter((t) => t.type === 'page');
      // Never close the last remaining tab in the window or Chromium will exit the profile.
      if (pageTargets.length <= 1) {
        await browserCdp.send('Target.createTarget', { url: 'about:blank' }, 3_000).catch(() => undefined);
      }
      await browserCdp.send('Target.closeTarget', { targetId }, 4_000);
    } catch {
      try {
        await fetch(`http://127.0.0.1:${cdpPort}/json/close/${encodeURIComponent(targetId)}`);
      } catch {
        // Target or browser may already be closed
      }
    }
  }

  private monitorTab(
    pageCdp: CdpClient,
    url: string,
    options: LinkTabMonitorOptions,
  ): Promise<LinkTabOutcome> {
    return new Promise<LinkTabOutcome>((resolve) => {
      let settled = false;
      let loadTimer: NodeJS.Timeout | null = null;
      let heartbeatTimer: NodeJS.Timeout | null = null;
      let heartbeatInFlight = false;

      const cleanups: Array<() => void> = [];

      const finish = (result: LinkTabOutcome) => {
        if (settled) return;
        settled = true;
        if (loadTimer) clearTimeout(loadTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        for (const fn of cleanups) {
          try {
            fn();
          } catch {
            // ignore
          }
        }
        resolve(result);
      };

      if (options.signal.aborted) {
        finish({ outcome: 'aborted' });
        return;
      }

      const onAbort = () => finish({ outcome: 'aborted' });
      options.signal.addEventListener('abort', onAbort, { once: true });
      cleanups.push(() => options.signal.removeEventListener('abort', onAbort));

      cleanups.push(
        pageCdp.on('Inspector.targetCrashed', () => {
          finish({ outcome: 'crashed', reason: 'Tab crashed ("Aw, Snap!")' });
        }),
      );

      cleanups.push(
        pageCdp.on('Page.loadEventFired', () => {
          finish({ outcome: 'loaded' });
        }),
      );

      cleanups.push(
        pageCdp.onClose(() => {
          finish({ outcome: 'crashed', reason: 'Tab closed or renderer disconnected unexpectedly' });
        }),
      );

      loadTimer = setTimeout(() => {
        finish({
          outcome: 'timeout',
          reason: `Did not finish loading within ${Math.round(options.loadTimeoutMs / 1000)}s`,
        });
      }, options.loadTimeoutMs);

      const heartbeatIntervalMs = Math.min(1_500, Math.max(400, Math.floor(options.hangTimeoutMs / 3)));

      const startHeartbeat = () => {
        heartbeatTimer = setInterval(() => {
          if (settled || heartbeatInFlight) return;
          heartbeatInFlight = true;
          pageCdp
            .evaluate<{ readyState: string; href: string }>(
              '({ readyState: document.readyState, href: location.href })',
              options.hangTimeoutMs,
            )
            .then((info) => {
              heartbeatInFlight = false;
              if (settled) return;
              if (info && info.readyState === 'complete' && info.href && info.href !== 'about:blank') {
                finish({ outcome: 'loaded' });
              }
            })
            .catch((err: unknown) => {
              heartbeatInFlight = false;
              if (settled) return;
              const message = err instanceof Error ? err.message : String(err);
              if (message.includes('timed out')) {
                finish({
                  outcome: 'stuttered',
                  reason: `Tab became unresponsive for ${Math.round(options.hangTimeoutMs / 1000)}s`,
                });
              }
              // Other transient errors (e.g. execution context destroyed during navigation) are ignored
            });
        }, heartbeatIntervalMs);
      };

      pageCdp
        .send<{ frameId: string; errorText?: string }>('Page.navigate', { url }, Math.min(options.loadTimeoutMs, 15_000))
        .then((navRes) => {
          if (settled) return;
          if (navRes.errorText) {
            finish({ outcome: 'error', reason: navRes.errorText });
            return;
          }
          startHeartbeat();
        })
        .catch((err: unknown) => {
          if (settled) return;
          const message = err instanceof Error ? err.message : 'Navigation failed';
          if (message.includes('timed out')) {
            finish({
              outcome: 'stuttered',
              reason: `Navigation stalled or renderer froze (${message})`,
            });
          } else {
            finish({ outcome: 'error', reason: message });
          }
        });
    });
  }
}

interface ActiveRun {
  controller: AbortController;
  promise: Promise<void>;
}

/**
 * Manages per-profile sequential link queues over CDP, automatically closing each tab
 * once loaded or immediately if it crashes ("Aw, Snap!"), stutters, or times out.
 */
export class LinkRunnerService {
  private readonly states = new Map<string, LinkRunState>();
  private readonly active = new Map<string, ActiveRun>();
  private readonly driver: LinkTabDriver;

  constructor(private readonly deps: LinkRunnerServiceDeps) {
    this.driver = deps.driver ?? new CdpLinkTabDriver();
  }

  isRunning(profileId: string): boolean {
    return this.active.has(profileId);
  }

  getStatus(profileId: string): LinkRunState {
    const existing = this.states.get(profileId);
    if (existing) {
      return structuredClone(existing);
    }
    return {
      profileId,
      status: 'idle',
      currentIndex: -1,
      cycleCount: 0,
      startedAt: null,
      finishedAt: null,
      config: {
        loadTimeoutMs: 25_000,
        hangTimeoutMs: 8_000,
        dwellAfterLoadMs: 1_000,
        loop: false,
      },
      items: [],
    };
  }

  private publish(state: LinkRunState): void {
    const snapshot = structuredClone(state);
    this.states.set(state.profileId, snapshot);
    this.deps.onStateChange?.(structuredClone(snapshot));
  }

  async start(rawInput: Partial<Omit<StartLinkRunInput, 'profileId' | 'urls'>> & Pick<StartLinkRunInput, 'profileId' | 'urls'>): Promise<LinkRunState> {
    const input = StartLinkRunInputSchema.parse(rawInput);

    const cdpPort = this.deps.getCdpPort(input.profileId);
    if (!cdpPort) {
      throw new Error('Profile browser is not running. Start the profile first before running links.');
    }

    if (this.active.has(input.profileId)) {
      await this.stop(input.profileId);
    }

    const items: LinkRunItemState[] = input.urls.map((url, index) => ({
      index,
      url,
      status: 'pending',
      durationMs: null,
    }));

    const state: LinkRunState = {
      profileId: input.profileId,
      status: 'running',
      currentIndex: 0,
      cycleCount: 1,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      config: {
        loadTimeoutMs: input.loadTimeoutMs,
        hangTimeoutMs: input.hangTimeoutMs,
        dwellAfterLoadMs: input.dwellAfterLoadMs,
        loop: input.loop,
      },
      items,
    };

    const controller = new AbortController();
    this.publish(state);

    const promise = this.runLoop(state, controller.signal).finally(() => {
      if (this.active.get(input.profileId)?.controller === controller) {
        this.active.delete(input.profileId);
      }
    });

    this.active.set(input.profileId, { controller, promise });
    return structuredClone(state);
  }

  async stop(profileId: string): Promise<LinkRunState> {
    const run = this.active.get(profileId);
    if (run) {
      run.controller.abort();
      await run.promise.catch(() => undefined);
    }
    return this.getStatus(profileId);
  }

  async stopAll(): Promise<void> {
    const ids = Array.from(this.active.keys());
    await Promise.all(ids.map((id) => this.stop(id)));
  }

  private async runLoop(state: LinkRunState, signal: AbortSignal): Promise<void> {
    try {
      while (!signal.aborted) {
        for (let i = 0; i < state.items.length; i++) {
          if (signal.aborted) break;

          const cdpPort = this.deps.getCdpPort(state.profileId);
          if (!cdpPort) {
            state.status = 'stopped';
            state.error = 'Browser profile stopped while link runner was active';
            state.finishedAt = new Date().toISOString();
            this.publish(state);
            return;
          }

          const item = state.items[i]!;
          state.currentIndex = i;
          item.status = 'loading';
          item.durationMs = null;
          item.reason = undefined;
          this.publish(state);

          const itemStarted = Date.now();
          let session: LinkTabSession | null = null;

          try {
            session = await this.driver.openTab(cdpPort, signal);
            const result = await session.navigateAndMonitor(item.url, {
              loadTimeoutMs: state.config.loadTimeoutMs,
              hangTimeoutMs: state.config.hangTimeoutMs,
              signal,
            });

            if (result.outcome === 'aborted' || signal.aborted) {
              item.status = 'skipped';
              item.durationMs = Date.now() - itemStarted;
              item.reason = 'Stopped by user';
              this.publish(state);
              break;
            }

            if (result.outcome === 'loaded') {
              item.status = 'loaded';
              item.durationMs = Date.now() - itemStarted;
              this.publish(state);

              if (state.config.dwellAfterLoadMs > 0) {
                await sleepAbortable(state.config.dwellAfterLoadMs, signal);
              }
            } else {
              item.status = result.outcome;
              item.durationMs = Date.now() - itemStarted;
              item.reason = result.reason;
              this.publish(state);
            }
          } catch (err) {
            if (signal.aborted) {
              item.status = 'skipped';
              item.durationMs = Date.now() - itemStarted;
              item.reason = 'Stopped by user';
              this.publish(state);
              break;
            }
            item.status = 'error';
            item.durationMs = Date.now() - itemStarted;
            item.reason = err instanceof Error ? err.message : 'Failed to open tab';
            this.publish(state);
          } finally {
            // Always close the opened tab once done loading, snapped, stuttered, timed out, or stopped.
            if (session) {
              await session.close().catch(() => undefined);
            }
          }
        }

        if (signal.aborted) {
          break;
        }

        if (!state.config.loop) {
          state.status = 'completed';
          state.currentIndex = -1;
          state.finishedAt = new Date().toISOString();
          this.publish(state);
          return;
        }

        state.cycleCount += 1;
        for (const item of state.items) {
          item.status = 'pending';
          item.durationMs = null;
          item.reason = undefined;
        }
        this.publish(state);
      }

      if (state.status === 'running') {
        state.status = 'stopped';
        state.currentIndex = -1;
        state.finishedAt = new Date().toISOString();
        this.publish(state);
      }
    } catch (err) {
      state.status = 'error';
      state.currentIndex = -1;
      state.error = err instanceof Error ? err.message : 'Link runner failed';
      state.finishedAt = new Date().toISOString();
      this.publish(state);
    }
  }
}
