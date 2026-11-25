import {
  StartLinkRunInputSchema,
  type LinkRunItemState,
  type LinkRunState,
  type StartLinkRunInput,
} from '@zita/shared';
import { CdpClient } from './cdp.js';

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

export interface CdpEndpoint {
  cdpPort: number;
  cdpWsPath: string | null;
}

export interface LinkTabDriver {
  openTab(endpoint: CdpEndpoint, signal: AbortSignal): Promise<LinkTabSession>;
  releaseBrowser?(cdpPort: number): void;
}

export interface LinkRunnerServiceDeps {
  getCdpInfo: (profileId: string) => CdpEndpoint | null;
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

/**
 * Default CDP-backed tab driver that opens isolated tabs via flattened CDP sessions
 * (`Target.attachToTarget({ targetId, flatten: true })`) over a single reused browser
 * WebSocket connection per port. This avoids per-tab `/json/list` HTTP polling and
 * loopback socket churn that degrade on Windows.
 */
export class CdpLinkTabDriver implements LinkTabDriver {
  private readonly browserClients = new Map<number, CdpClient>();

  private async getBrowserClient(endpoint: CdpEndpoint): Promise<CdpClient> {
    const cached = this.browserClients.get(endpoint.cdpPort);
    if (cached?.isOpen()) return cached;
    cached?.disconnect();
    const client = new CdpClient();
    await client.connectToBrowser(endpoint.cdpPort, 15_000, { wsPath: endpoint.cdpWsPath });
    this.browserClients.set(endpoint.cdpPort, client);
    return client;
  }

  releaseBrowser(cdpPort: number): void {
    const client = this.browserClients.get(cdpPort);
    if (client) {
      client.disconnect();
      this.browserClients.delete(cdpPort);
    }
  }

  async openTab(endpoint: CdpEndpoint, signal: AbortSignal): Promise<LinkTabSession> {
    if (signal.aborted) {
      throw new Error('Link run aborted');
    }

    const browserCdp = await this.getBrowserClient(endpoint);
    const cdpPort = endpoint.cdpPort;

    let targetId: string | null = null;
    let sessionId: string | null = null;

    try {
      const created = await browserCdp.send<{ targetId: string }>(
        'Target.createTarget',
        { url: 'about:blank' },
        15_000,
      );
      targetId = created.targetId;

      if (signal.aborted) {
        throw new Error('Link run aborted');
      }

      const attached = await browserCdp.send<{ sessionId: string }>(
        'Target.attachToTarget',
        { targetId, flatten: true },
        15_000,
      );
      sessionId = attached.sessionId;

      await browserCdp.send('Page.enable', {}, 15_000, sessionId);
      await browserCdp.send('Inspector.enable', {}, 5_000, sessionId).catch(() => {
        // Some Chromium builds emit Inspector.targetCrashed even if Inspector.enable is a no-op
      });
    } catch (err) {
      if (targetId) {
        await this.safeCloseTarget(browserCdp, cdpPort, targetId, sessionId);
      }
      // Drop the cached browser socket on setup failure so the next link reconnects cleanly
      this.releaseBrowser(cdpPort);
      throw err;
    }

    const activeTargetId = targetId;
    const activeSessionId = sessionId;
    let closed = false;
    const safeClose = async () => {
      if (closed) return;
      closed = true;
      await this.safeCloseTarget(browserCdp, cdpPort, activeTargetId, activeSessionId);
    };

    return {
      navigateAndMonitor: (url, options) =>
        this.monitorTab(browserCdp, activeTargetId, activeSessionId, url, options),
      close: safeClose,
    };
  }

  private async safeCloseTarget(
    browserCdp: CdpClient | null,
    cdpPort: number,
    targetId: string,
    sessionId: string | null,
  ): Promise<void> {
    if (browserCdp && !browserCdp.isOpen()) {
      browserCdp = null;
    }
    if (browserCdp) {
      try {
        if (sessionId) {
          await browserCdp.send('Target.detachFromTarget', { sessionId }, 3_000).catch(() => undefined);
        }
        const res = await browserCdp
          .send<{ targetInfos?: Array<{ type: string; targetId: string }> }>('Target.getTargets', {}, 3_000)
          .catch(() => ({ targetInfos: [] }));
        const pageTargets = (res.targetInfos ?? []).filter((t) => t.type === 'page');
        // Never close the last remaining tab in the window or Chromium will exit the profile.
        if (pageTargets.length <= 1) {
          await browserCdp.send('Target.createTarget', { url: 'about:blank' }, 3_000).catch(() => undefined);
        }
        await browserCdp.send('Target.closeTarget', { targetId }, 4_000);
        return;
      } catch {
        // Fall through to the HTTP endpoint fallback below.
      }
    }
    try {
      await fetch(`http://127.0.0.1:${cdpPort}/json/close/${encodeURIComponent(targetId)}`, {
        headers: { Connection: 'close' },
        signal: AbortSignal.timeout(3_000),
      });
    } catch {
      // Target or browser may already be closed
    }
  }

  private monitorTab(
    browserCdp: CdpClient,
    targetId: string,
    sessionId: string,
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
        browserCdp.onSession(sessionId, 'Inspector.targetCrashed', () => {
          finish({ outcome: 'crashed', reason: 'Tab crashed ("Aw, Snap!")' });
        }),
      );

      cleanups.push(
        browserCdp.onSession(sessionId, 'Page.loadEventFired', () => {
          finish({ outcome: 'loaded' });
        }),
      );

      cleanups.push(
        browserCdp.on('Target.detachedFromTarget', (params) => {
          if (params.sessionId === sessionId || params.targetId === targetId) {
            finish({ outcome: 'crashed', reason: 'Tab closed or renderer disconnected unexpectedly' });
          }
        }),
      );

      cleanups.push(
        browserCdp.on('Target.targetDestroyed', (params) => {
          if (params.targetId === targetId) {
            finish({ outcome: 'crashed', reason: 'Tab closed or renderer disconnected unexpectedly' });
          }
        }),
      );

      cleanups.push(
        browserCdp.onClose(() => {
          finish({ outcome: 'crashed', reason: 'Browser CDP connection closed unexpectedly' });
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
          browserCdp
            .evaluate<{ readyState: string; href: string }>(
              '({ readyState: document.readyState, href: location.href })',
              options.hangTimeoutMs,
              { sessionId, awaitPromise: false },
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

      browserCdp
        .send<{ frameId: string; errorText?: string }>(
          'Page.navigate',
          { url },
          options.loadTimeoutMs,
          sessionId,
        )
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
              outcome: 'timeout',
              reason: `Did not finish loading within ${Math.round(options.loadTimeoutMs / 1000)}s`,
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

    const cdpInfo = this.deps.getCdpInfo(input.profileId);
    if (!cdpInfo) {
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
    let endpoint: CdpEndpoint | null = null;
    try {
      while (!signal.aborted) {
        for (let i = 0; i < state.items.length; i++) {
          if (signal.aborted) break;

          endpoint = this.deps.getCdpInfo(state.profileId);
          if (!endpoint) {
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
            session = await this.driver.openTab(endpoint, signal);
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
    } finally {
      if (endpoint) {
        this.driver.releaseBrowser?.(endpoint.cdpPort);
      }
    }
  }
}
