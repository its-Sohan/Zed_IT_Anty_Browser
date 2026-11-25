import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { eq, isNull } from 'drizzle-orm';
import type {
  FingerprintConfig,
  LabCheckResult,
  ProbeSnapshot,
  ProfileLifecycleState,
  ProfileStatusEvent,
} from '@zita/shared';
import { seedCookiesViaCdp } from '../cookies/cdp-seeder.js';
import { createId, profiles, profileSessions, type ZitaDatabase } from '../db/index.js';
import { compareExpectedVsObserved, generateFingerprint } from '../fingerprint/generator.js';
import { createProbeServer } from '../fingerprint/probe.js';
import type { ProfilesService } from '../profiles/service.js';
import { ProxyBridge } from '../proxy/bridge.js';
import type { ProxyService } from '../proxy/service.js';
import { CdpClient, waitForDevToolsActivePort } from './cdp.js';
import { composeEngineFlags } from './flags.js';

export interface ProfileLauncherDeps {
  database: ZitaDatabase;
  profilesService: ProfilesService;
  proxyService: ProxyService;
  resolveExecutable: (engineVersion: string) => string | null;
  canLaunch?: () => { allowed: boolean; reason?: string };
  onStatusChange?: (event: ProfileStatusEvent) => void;
}

interface RunningHandle {
  profileId: string;
  sessionId: string;
  child: ChildProcess;
  bridge: ProxyBridge | null;
  cdpPort: number;
  cdpWsPath: string | null;
  proxyId: string | null;
  userDataDir: string;
  state: ProfileLifecycleState;
  startedAt: string;
}

export interface CdpEndpointInfo {
  cdpPort: number;
  cdpWsPath: string | null;
}

export class ProxyCheckFailedError extends Error {
  readonly code = 'PROXY_CHECK_FAILED';
  constructor(
    message: string,
    public readonly proxyLabel: string,
    public readonly details: string,
  ) {
    super(message);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killChild(child: ChildProcess, force: boolean): void {
  if (child.killed || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    child.kill();
    return;
  }
  child.kill(force ? 'SIGKILL' : 'SIGTERM');
}

function writeChromiumBookmarks(userDataDir: string, startPages: string[]): void {
  if (startPages.length === 0) return;
  const defaultDir = path.join(userDataDir, 'Default');
  mkdirSync(defaultDir, { recursive: true });
  const bookmarksPath = path.join(defaultDir, 'Bookmarks');
  const children = startPages.map((url, idx) => ({
    date_added: '13350000000000000',
    guid: `00000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`,
    id: String(idx + 10),
    name: url,
    type: 'url',
    url,
  }));
  const payload = {
    checksum: '',
    roots: {
      bookmark_bar: { children, date_added: '13350000000000000', id: '1', name: 'Bookmarks bar', type: 'folder' },
      other: { children: [], date_added: '13350000000000000', id: '2', name: 'Other bookmarks', type: 'folder' },
      synced: { children: [], date_added: '13350000000000000', id: '3', name: 'Mobile bookmarks', type: 'folder' },
    },
    version: 1,
  };
  writeFileSync(bookmarksPath, JSON.stringify(payload, null, 2), 'utf8');
}

/**
 * Manages Chromium browser processes, local SOCKS5 proxy bridges, CDP seeding, and session reconciliation.
 */
export class ProfileLauncher {
  private readonly running = new Map<string, RunningHandle>();
  private readonly launching = new Set<string>();

  constructor(private readonly deps: ProfileLauncherDeps) {}

  getRunningIds(): Set<string> {
    return new Set(this.running.keys());
  }

  isRunning(profileId: string): boolean {
    return this.running.has(profileId);
  }

  getCdpPort(profileId: string): number | null {
    return this.running.get(profileId)?.cdpPort ?? null;
  }

  /**
   * Returns the loopback CDP endpoint for a running profile, including the authoritative
   * WebSocket path from the engine's DevToolsActivePort file. HTTP discovery endpoints
   * (`/json/*`) are unreliable on recent Windows Chromium builds.
   */
  getCdpInfo(profileId: string): CdpEndpointInfo | null {
    const handle = this.running.get(profileId);
    if (!handle) return null;
    return { cdpPort: handle.cdpPort, cdpWsPath: handle.cdpWsPath };
  }

  private emit(profileId: string, state: ProfileLifecycleState, error?: string): void {
    this.deps.onStatusChange?.({ profileId, state, error });
  }

  /**
   * Cleans up stale DB sessions whose Chromium PIDs are no longer alive after a crash/restart.
   */
  reconcileStaleSessions(): number {
    const openSessions = this.deps.database.db
      .select()
      .from(profileSessions)
      .where(isNull(profileSessions.endedAt))
      .all();

    let reconciled = 0;
    const now = new Date().toISOString();
    for (const s of openSessions) {
      if (!s.pid || !isPidAlive(s.pid)) {
        this.deps.database.db
          .update(profileSessions)
          .set({ endedAt: now, exitCode: -1, errorMessage: 'Reconciled stale session on startup' })
          .where(eq(profileSessions.id, s.id))
          .run();
        reconciled += 1;
      }
    }
    return reconciled;
  }

  private async spawnEngineWithFallback(
    executablePath: string,
    fingerprint: FingerprintConfig,
    userDataDir: string,
    proxyServer: string | undefined,
    extraFlags: string[],
    startPages: string[],
  ): Promise<{ child: ChildProcess; cdpPort: number; cdpWsPath: string | null }> {
    const attemptSpawn = async (
      useNoSandbox: boolean,
    ): Promise<{ child: ChildProcess; cdpPort: number; cdpWsPath: string | null }> => {
      const mergedExtra = useNoSandbox && !extraFlags.includes('--no-sandbox')
        ? [...extraFlags, '--no-sandbox']
        : extraFlags;

      const flags = composeEngineFlags({
        userDataDir,
        fingerprint,
        proxyServer,
        windowSize:
          fingerprint.screen.width && fingerprint.screen.height
            ? { width: fingerprint.screen.width, height: fingerprint.screen.height }
            : undefined,
        extraFlags: mergedExtra,
        startPages,
      });

      const childEnv: NodeJS.ProcessEnv = {
        ...process.env,
        ...(process.platform === 'linux' ? { DISPLAY: process.env.DISPLAY || ':0' } : {}),
      };
      delete childEnv.ELECTRON_RUN_AS_NODE;
      delete childEnv.ELECTRON_NO_ASAR;

      const activePortFile = path.join(userDataDir, 'DevToolsActivePort');
      rmSync(activePortFile, { force: true });

      const child = spawn(executablePath, flags, {
        stdio: ['ignore', 'ignore', 'pipe'],
        env: childEnv,
      });

      let stderr = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        if (stderr.length < 4096) stderr += chunk.toString('utf8');
      });

      const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
        child.once('exit', (code, signal) => resolve({ code, signal }));
      });

      try {
        const portInfo = await Promise.race([
          waitForDevToolsActivePort(userDataDir, 15_000),
          exitPromise.then(({ code, signal }) => {
            throw new Error(
              `Engine exited with code ${code} (${signal ?? 'no signal'}): ${stderr.slice(0, 400)}`,
            );
          }),
        ]);
        return { child, cdpPort: portInfo.port, cdpWsPath: portInfo.wsPath };
      } catch (err) {
        killChild(child, true);
        await exitPromise.catch(() => null);
        rmSync(activePortFile, { force: true });
        throw err;
      }
    };

    try {
      return await attemptSpawn(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        process.platform === 'linux' &&
        (msg.includes('Engine exited') || msg.includes('sandbox') || msg.includes('zygote'))
      ) {
        return await attemptSpawn(true);
      }
      throw err;
    }
  }

  async launch(
    profileId: string,
    opts: { skipProxyCheck?: boolean; allowWithoutProxy?: boolean; captureReadback?: boolean } = {},
  ): Promise<{ sessionId: string; cdpPort: number; bridgePort: number | null }> {
    if (this.running.has(profileId) || this.launching.has(profileId)) {
      throw new Error(`Profile ${profileId} is already starting or running`);
    }

    if (this.deps.canLaunch) {
      const check = this.deps.canLaunch();
      if (!check.allowed) {
        throw new Error(check.reason ?? 'Active license does not permit launching profiles');
      }
    }

    const detail = this.deps.profilesService.getById(profileId);
    if (!detail) throw new Error(`Profile ${profileId} not found`);

    const executablePath = this.deps.resolveExecutable(detail.engineVersion);
    if (!executablePath) {
      throw new Error(`Engine ${detail.engineVersion} is not installed. Run pnpm engine:fetch or install in Settings.`);
    }

    this.launching.add(profileId);
    this.emit(profileId, 'starting');

    let bridge: ProxyBridge | null = null;
    let bridgePort: number | null = null;
    let spawnedChild: ChildProcess | null = null;
    let resolvedFp: FingerprintConfig = structuredClone(detail.fingerprint);

    try {
      if (detail.proxyId && !opts.allowWithoutProxy) {
        const proxySummary = this.deps.proxyService.getById(detail.proxyId);
        const proxyConfig = this.deps.proxyService.getDecrypted(detail.proxyId);
        if (!proxySummary || !proxyConfig) {
          throw new Error('Assigned proxy no longer exists');
        }

        if (!opts.skipProxyCheck) {
          const checkRes = await this.deps.proxyService.test(detail.proxyId, { timeoutMs: 8_000 });
          if (!checkRes.ok) {
            throw new ProxyCheckFailedError(
              `Proxy "${proxySummary.label}" failed health check`,
              proxySummary.label,
              checkRes.error ?? 'Connection failed',
            );
          }
          if (resolvedFp.timezone.mode === 'auto' && checkRes.timezone) {
            resolvedFp.timezone.value = checkRes.timezone;
          }
        } else if (resolvedFp.timezone.mode === 'auto' && proxySummary.timezone) {
          resolvedFp.timezone.value = proxySummary.timezone;
        }

        bridge = new ProxyBridge({
          upstream: {
            type: proxyConfig.protocol,
            host: proxyConfig.host,
            port: proxyConfig.port,
            username: proxyConfig.username,
            password: proxyConfig.password,
          },
        });
        const addr = await bridge.start();
        bridgePort = addr.port;
      }

      mkdirSync(detail.userDataDir, { recursive: true });
      writeChromiumBookmarks(detail.userDataDir, detail.startPages);

      const extraFlags = [...detail.extraFlags];
      if (bridgePort !== null && !extraFlags.some((f) => f.startsWith('--proxy-bypass-list'))) {
        extraFlags.push('--proxy-bypass-list=<-loopback>');
      }

      const pendingCookies = this.deps.profilesService.getPendingCookies(detail.userDataDir);
      const shouldCapture = Boolean(opts.captureReadback);
      const needsPostLaunchCdp = pendingCookies.length > 0 || shouldCapture;
      const initialPages = needsPostLaunchCdp
        ? ['about:blank']
        : detail.startPages.length > 0
          ? detail.startPages
          : ['about:blank'];

      const { child, cdpPort, cdpWsPath } = await this.spawnEngineWithFallback(
        executablePath,
        resolvedFp,
        detail.userDataDir,
        bridgePort !== null ? `socks5://127.0.0.1:${bridgePort}` : undefined,
        extraFlags,
        initialPages,
      );
      spawnedChild = child;

      if (needsPostLaunchCdp) {
        const cdp = new CdpClient();
        try {
          await cdp.connectToFirstPage(cdpPort, 10_000);
          if (pendingCookies.length > 0) {
            await seedCookiesViaCdp(cdp, pendingCookies);
            this.deps.profilesService.clearPendingCookies(detail.userDataDir);
          }
          let navigatedToProbe = false;
          if (shouldCapture) {
            const probeServer = await createProbeServer();
            try {
              await cdp.navigateAndWait(probeServer.url, 15_000);
              navigatedToProbe = true;
              const snapshot = await probeServer.waitForSnapshot(10_000);
              this.deps.profilesService.saveObservedFingerprint(profileId, snapshot);
            } catch {
              // Non-fatal: do not block interactive browser launch if probe readback times out or crashes
            } finally {
              await probeServer.close();
            }
          }
          const targetStart = detail.startPages[0] ?? 'about:blank';
          if (targetStart !== 'about:blank' || navigatedToProbe) {
            await cdp.navigateAndWait(targetStart, 10_000).catch(() => undefined);
          }
        } catch {
          // Non-fatal: keep the launched browser registered and usable even if post-launch CDP fails
        } finally {
          cdp.disconnect();
        }
      }

      const sessionId = createId('ses');
      const now = new Date().toISOString();
      this.deps.database.db
        .insert(profileSessions)
        .values({
          id: sessionId,
          profileId,
          pid: child.pid ?? null,
          cdpPort,
          bridgePort,
          startedAt: now,
        })
        .run();

      this.deps.database.db
        .update(profiles)
        .set({
          lastStartedAt: now,
          launchCount: detail.launchCount + 1,
          updatedAt: now,
        })
        .where(eq(profiles.id, profileId))
        .run();

      this.deps.profilesService.logActivity('profile.launched', profileId, {
        sessionId,
        cdpPort,
        bridgePort,
      });

      const handle: RunningHandle = {
        profileId,
        sessionId,
        child,
        bridge,
        cdpPort,
        cdpWsPath,
        proxyId: bridgePort !== null ? detail.proxyId : null,
        userDataDir: detail.userDataDir,
        state: 'running',
        startedAt: now,
      };
      this.running.set(profileId, handle);
      this.emit(profileId, 'running');

      child.once('exit', (exitCode) => {
        void this.handleProcessExit(handle, exitCode);
      });

      return { sessionId, cdpPort, bridgePort };
    } catch (err) {
      if (spawnedChild) {
        killChild(spawnedChild, true);
      }
      rmSync(path.join(detail.userDataDir, 'DevToolsActivePort'), { force: true });
      if (bridge) {
        await bridge.stop();
      }
      const message = err instanceof Error ? err.message : 'Failed to launch profile';
      this.emit(profileId, 'error', message);
      throw err;
    } finally {
      this.launching.delete(profileId);
    }
  }

  private async handleProcessExit(handle: RunningHandle, exitCode: number | null): Promise<void> {
    this.running.delete(handle.profileId);
    rmSync(path.join(handle.userDataDir, 'DevToolsActivePort'), { force: true });
    let bytesUp = 0;
    let bytesDown = 0;
    if (handle.bridge) {
      const stats = handle.bridge.getStats();
      bytesUp = stats.bytesUp;
      bytesDown = stats.bytesDown;
      await handle.bridge.stop();
      if (handle.proxyId && (bytesUp > 0 || bytesDown > 0)) {
        this.deps.proxyService.recordTraffic(handle.proxyId, bytesUp, bytesDown);
      }
    }

    const now = new Date().toISOString();
    this.deps.database.db
      .update(profileSessions)
      .set({ endedAt: now, exitCode: exitCode ?? 0, bytesUp, bytesDown })
      .where(eq(profileSessions.id, handle.sessionId))
      .run();

    this.deps.database.db
      .update(profiles)
      .set({ lastStoppedAt: now, updatedAt: now })
      .where(eq(profiles.id, handle.profileId))
      .run();

    this.deps.profilesService.logActivity('profile.stopped', handle.profileId, {
      exitCode,
      bytesUp,
      bytesDown,
    });

    this.emit(handle.profileId, 'stopped');
  }

  async stop(profileId: string): Promise<void> {
    const handle = this.running.get(profileId);
    if (!handle) return;

    handle.state = 'stopping';
    this.emit(profileId, 'stopping');

    const cdp = new CdpClient();
    try {
      await cdp.connectToBrowser(handle.cdpPort, 3_000, { wsPath: handle.cdpWsPath });
      await cdp.closeBrowser();
    } catch {
      // Fallback to signal termination below
    } finally {
      cdp.disconnect();
    }

    const exited = await Promise.race([
      new Promise<boolean>((resolve) => {
        if (handle.child.exitCode !== null) return resolve(true);
        handle.child.once('exit', () => resolve(true));
      }),
      sleep(3_500).then(() => false),
    ]);

    if (!exited && !handle.child.killed) {
      killChild(handle.child, false);
      const exitedTerm = await Promise.race([
        new Promise<boolean>((resolve) => handle.child.once('exit', () => resolve(true))),
        sleep(2_000).then(() => false),
      ]);
      if (!exitedTerm) {
        killChild(handle.child, true);
      }
    }
  }

  async stopAll(): Promise<void> {
    const ids = Array.from(this.running.keys());
    await Promise.all(ids.map((id) => this.stop(id)));
  }

  /**
   * Launches an isolated temporary Lab check against the local probe server and returns Expected vs Observed diff.
   */
  async runLabCheck(input: {
    profileId?: string;
    fingerprint?: FingerprintConfig;
    proxyId?: string | null;
    engineVersion?: string;
  }): Promise<LabCheckResult> {
    let fp = input.fingerprint;
    let proxyId = input.proxyId ?? null;
    let engineVersion = input.engineVersion ?? '150.0.7871.186';

    if (input.profileId) {
      const detail = this.deps.profilesService.getById(input.profileId);
      if (!detail) throw new Error(`Profile ${input.profileId} not found`);
      fp = fp ?? detail.fingerprint;
      proxyId = input.proxyId !== undefined ? input.proxyId : detail.proxyId;
      engineVersion = detail.engineVersion;
    }

    if (!fp) {
      fp = generateFingerprint({ os: 'windows' });
    }

    const executablePath = this.deps.resolveExecutable(engineVersion);
    if (!executablePath) {
      throw new Error(`Engine ${engineVersion} is not installed`);
    }

    const labDir = path.join(this.deps.profilesService.getProfilesRootDir(), `.lab-${Date.now()}`);
    mkdirSync(labDir, { recursive: true });

    let bridge: ProxyBridge | null = null;
    let proxyTimezone: string | null = null;
    let child: ChildProcess | null = null;
    const probeServer = await createProbeServer();
    const startedAt = Date.now();

    try {
      let proxyServerUrl: string | undefined;
      if (proxyId) {
        const proxyConfig = this.deps.proxyService.getDecrypted(proxyId);
        const proxySummary = this.deps.proxyService.getById(proxyId);
        if (proxyConfig) {
          proxyTimezone = proxySummary?.timezone ?? null;
          bridge = new ProxyBridge({
            upstream: {
              type: proxyConfig.protocol,
              host: proxyConfig.host,
              port: proxyConfig.port,
              username: proxyConfig.username,
              password: proxyConfig.password,
            },
          });
          const addr = await bridge.start();
          proxyServerUrl = `socks5://${addr.host}:${addr.port}`;
        }
      }

      const launched = await this.spawnEngineWithFallback(
        executablePath,
        fp,
        labDir,
        proxyServerUrl,
        ['--headless=new', '--mute-audio'],
        [probeServer.url],
      );
      child = launched.child;

      const exitPromise = new Promise<never>((_, reject) => {
        child!.once('exit', (code) => {
          reject(new Error(`Lab browser exited prematurely with code ${code}`));
        });
      });

      const observed = await Promise.race([
        probeServer.waitForSnapshot(15_000),
        exitPromise,
      ]);

      const cdp = new CdpClient();
      try {
        await cdp.connectToFirstPage(launched.cdpPort, 3_000);
        await cdp.closeBrowser();
      } catch {
        // Fallback to SIGTERM/SIGKILL in finally
      } finally {
        cdp.disconnect();
      }

      if (input.profileId) {
        this.deps.profilesService.saveObservedFingerprint(input.profileId, observed);
      }

      const diff = compareExpectedVsObserved(fp, observed, { proxyTimezone });
      return {
        expected: fp,
        observed,
        diff,
        capturedAt: observed.capturedAt,
        launchDurationMs: Date.now() - startedAt,
      };
    } finally {
      if (child && child.exitCode === null) {
        killChild(child, true);
      }
      if (bridge) {
        await bridge.stop();
      }
      await probeServer.close();
      rmSync(labDir, { recursive: true, force: true });
    }
  }
}
