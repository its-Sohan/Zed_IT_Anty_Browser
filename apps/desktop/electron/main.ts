import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, safeStorage } from 'electron';
import {
  deriveFallbackKey,
  LicenseService,
  LinkRunnerService,
  openDatabase,
  ProfileLauncher,
  ProfilesService,
  ProxyService,
  SecretBox,
  type ZitaDatabase,
} from '@zita/core';
import { IPC_CHANNELS } from '@zita/shared';
import { registerIpcHandlers, resolveEngineStatus } from './ipc/index.js';
import { createMainWindow } from './window.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isSmokeTest = !app.isPackaged && process.argv.includes('--smoke-test');

const TRANSIENT_SOCKET_ERRORS = new Set([
  'ECONNRESET',
  'EPIPE',
  'ECONNABORTED',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ERR_STREAM_PREMATURE_CLOSE',
]);

process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err && typeof err.code === 'string' && TRANSIENT_SOCKET_ERRORS.has(err.code)) {
    console.warn(`[main] Ignored transient socket error (${err.code}): ${err.message}`);
    return;
  }
  console.error('[main] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[main] Unhandled rejection:', reason);
});

// License stub is kept for IPC compatibility (site: licensing removed, app unlocked).
const DEFAULT_LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEz2nF1p9F2a3Q8rP0bF7n0mJ9lR5K
1yP8mT2xL4xG8k2cB0vH7a1pD9jE5nQ3uC6vV8xN4pR2zB1wK9sY2Q==
-----END PUBLIC KEY-----`;

let mainWindow: BrowserWindow | null = null;
let database: ZitaDatabase | null = null;
let launcher: ProfileLauncher | null = null;
let linkRunner: LinkRunnerService | null = null;
let smokeTempDir: string | null = null;

function resolveRepoRoot(): string {
  return path.resolve(__dirname, '..', '..', '..', '..');
}

function resolveStorageRoot(): string {
  if (isSmokeTest) {
    smokeTempDir = mkdtempSync(path.join(os.tmpdir(), 'zita-desktop-smoke-'));
    return smokeTempDir;
  }
  return path.join(app.getPath('appData'), 'ZedIT', 'AntiBrowser');
}

function createMasterSecretBox(storageRoot: string): SecretBox {
  const safePath = path.join(storageRoot, 'data', '.master.safe');
  const fallbackPath = path.join(storageRoot, 'data', '.master.key');

  if (!isSmokeTest && safeStorage.isEncryptionAvailable()) {
    try {
      if (existsSync(safePath)) {
        const encrypted = readFileSync(safePath);
        const secretHex = safeStorage.decryptString(encrypted);
        if (/^[0-9a-f]{64}$/i.test(secretHex)) {
          return new SecretBox(Buffer.from(secretHex, 'hex'));
        }
      } else {
        const rawKey = deriveFallbackKey(fallbackPath);
        const encrypted = safeStorage.encryptString(rawKey.toString('hex'));
        writeFileSync(safePath, encrypted, { mode: 0o600 });
        rmSync(fallbackPath, { force: true });
        return new SecretBox(rawKey);
      }
    } catch {
      // Fall back to machine-local key file if OS keyring is locked/unavailable
    }
  }

  const keyBytes = createHash('sha256').update(deriveFallbackKey(fallbackPath)).digest();
  return new SecretBox(keyBytes);
}

async function runSmokeProbe(win: BrowserWindow): Promise<void> {
  const consoleErrors: string[] = [];
  win.webContents.on('console-message', (details) => {
    if (details.level === 'error') {
      consoleErrors.push(details.message);
    }
  });

  if (win.webContents.isLoadingMainFrame()) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Smoke test timed out waiting for did-finish-load')), 15_000);
      win.webContents.once('did-finish-load', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  const probe = (await win.webContents.executeJavaScript(`
    (async () => {
      const deadline = Date.now() + 8000;
      while (!document.querySelector('[data-testid="app-shell"]') && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      const hasBridge = typeof window.zita === 'object' && window.zita !== null;
      const shellMounted = Boolean(document.querySelector('[data-testid="app-shell"]'));
      if (!hasBridge) return { hasBridge, shellMounted };

      const appInfo = await window.zita.app.getInfo();
      const trial = await window.zita.license.getState();
      const folder = await window.zita.org.createFolder({ name: 'Smoke Clients' });
      const tag = await window.zita.org.createTag({ name: 'smoke-tag' });
      const proxy = await window.zita.proxies.create({
        label: 'Smoke Proxy',
        protocol: 'socks5',
        host: '127.0.0.1',
        port: 1080,
      });

      const created = await window.zita.profiles.create({
        name: 'Smoke Profile 01',
        os: 'windows',
        osVersion: '10',
        seed: 1287349192,
        folderId: folder.ok ? folder.data.id : null,
        tagIds: tag.ok ? [tag.data.id] : [],
      });

      const copied = created.ok
        ? await window.zita.profiles.copy({ id: created.data.id, randomizeSeed: true })
        : null;

      const csvRes = await window.zita.profiles.csvImport({
        csvText: 'name,os\\nCSV Smoke,macos\\n,windows',
      });

      const cookiesRes = created.ok
        ? await window.zita.profiles.importCookies({
            profileId: created.data.id,
            rawText: '.example.com\\tTRUE\\t/\\tTRUE\\t1893456000\\tsid\\tabc',
          })
        : null;

      const labRes = created.ok
        ? await window.zita.lab.runCheck({ profileId: created.data.id })
        : null;

      if (copied && copied.ok) {
        await window.zita.profiles.softDelete(copied.data.id);
        await window.zita.profiles.restore(copied.data.id);
        await window.zita.profiles.permanentDelete(copied.data.id);
      }

      const overview = await window.zita.profiles.overview({ view: 'all' });
      return {
        hasBridge,
        shellMounted,
        appInfo,
        trial,
        proxy,
        createdSeed: created.ok ? created.data.seed : null,
        copiedSeed: copied && copied.ok ? copied.data.seed : null,
        csvRes,
        cookiesRes,
        labOk: Boolean(labRes && labRes.ok),
        labError: labRes && !labRes.ok ? labRes.error : null,
        labCpuMatch: labRes && labRes.ok ? labRes.data.observed.hardwareConcurrency : null,
        labScreenStatus: labRes && labRes.ok ? labRes.data.diff.find((d) => d.signal.includes('Screen'))?.status : null,
        overviewCount: overview.ok ? overview.data.counts.all : 0,
      };
    })()
  `)) as {
    hasBridge: boolean;
    shellMounted: boolean;
    appInfo?: { ok: boolean; data?: { engineInstalled: boolean } };
    trial?: { ok: boolean; data?: { status: string } }; // license state (unlocked)
    proxy?: { ok: boolean };
    createdSeed?: number | null;
    copiedSeed?: number | null;
    csvRes?: { ok: boolean; data?: { importedCount: number; errors: unknown[] } };
    cookiesRes?: { ok: boolean; data?: { validCount: number } };
    labOk?: boolean;
    labCpuMatch?: number | null;
    labScreenStatus?: string | null;
    overviewCount?: number;
  };

  const passed =
    probe.hasBridge &&
    probe.shellMounted &&
    Boolean(probe.appInfo?.ok && probe.appInfo.data?.engineInstalled) &&
    probe.trial?.ok === true &&
    probe.trial.data?.status === 'active' &&
    probe.proxy?.ok === true &&
    typeof probe.createdSeed === 'number' &&
    typeof probe.copiedSeed === 'number' &&
    probe.createdSeed !== probe.copiedSeed &&
    probe.csvRes?.ok === true &&
    probe.csvRes.data?.importedCount === 1 &&
    probe.csvRes.data?.errors.length === 1 &&
    probe.cookiesRes?.ok === true &&
    probe.cookiesRes.data?.validCount === 1 &&
    probe.labOk === true &&
    probe.labScreenStatus === 'unsupported' &&
    probe.overviewCount === 2 &&
    consoleErrors.length === 0;

  console.log(JSON.stringify({ smokePassed: passed, consoleErrors, probe }, null, 2));
  await launcher?.stopAll();
  database?.close();
  database = null;
  if (smokeTempDir) {
    rmSync(smokeTempDir, { recursive: true, force: true });
    smokeTempDir = null;
  }
  app.exit(passed ? 0 : 1);
}

if (!isSmokeTest) {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }
}

app.setName('Zed IT Anti Browser');

app.whenReady().then(() => {
  const storageRoot = resolveStorageRoot();
  const repoRoot = resolveRepoRoot();
  const dbPath = path.join(storageRoot, 'data', 'app.db');
  database = openDatabase(dbPath);
  const secretBox = createMasterSecretBox(storageRoot);
  const proxyService = new ProxyService(database, secretBox);
  const profilesService = new ProfilesService(database, storageRoot, secretBox, proxyService);
  const licenseService = new LicenseService({
    database,
    storageRoot,
    secretBox,
    publicKeyPem: process.env['ZITA_LICENSE_PUBLIC_KEY_PEM'] ?? DEFAULT_LICENSE_PUBLIC_KEY_PEM,
  });

  launcher = new ProfileLauncher({
    database,
    profilesService,
    proxyService,
    resolveExecutable: () => resolveEngineStatus({ storageRoot, repoRoot }).executablePath,
    canLaunch: () => licenseService.assertCanLaunch(),
    onStatusChange: (event) => {
      if (event.state === 'stopping' || event.state === 'stopped' || event.state === 'error') {
        void linkRunner?.stop(event.profileId);
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.EVENT_PROFILE_STATUS_CHANGED, event);
      }
    },
  });

  linkRunner = new LinkRunnerService({
    getCdpPort: (profileId) => launcher?.getCdpPort(profileId) ?? null,
    onStateChange: (state) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC_CHANNELS.EVENT_LINK_RUNNER_UPDATED, state);
      }
    },
  });

  launcher.reconcileStaleSessions();
  profilesService.purgeExpiredTrash(48);

  registerIpcHandlers({
    database,
    storageRoot,
    repoRoot,
    proxyService,
    profilesService,
    launcher,
    linkRunner,
    licenseService,
  });

  const preloadPath = path.join(__dirname, '../preload/preload.cjs');
  const rendererHtmlPath = path.join(__dirname, '../renderer/index.html');

  mainWindow = createMainWindow({
    preloadPath,
    rendererHtmlPath,
    smokeTest: isSmokeTest,
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isSmokeTest) {
    runSmokeProbe(mainWindow).catch(async (err) => {
      console.error('Smoke test failed:', err);
      await linkRunner?.stopAll();
      await launcher?.stopAll();
      database?.close();
      if (smokeTempDir) rmSync(smokeTempDir, { recursive: true, force: true });
      app.exit(1);
    });
  }
});

app.on('before-quit', () => {
  void linkRunner?.stopAll();
  void launcher?.stopAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  database?.close();
  database = null;
  if (smokeTempDir) {
    rmSync(smokeTempDir, { recursive: true, force: true });
    smokeTempDir = null;
  }
});
