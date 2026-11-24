import { existsSync } from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, session } from 'electron';

export interface CreateMainWindowOptions {
  preloadPath: string;
  rendererHtmlPath: string;
  smokeTest: boolean;
}

const PROD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
].join('; ');

let cspRegistered = false;

/**
 * Installs a strict Content-Security-Policy header on local file responses in production/built mode.
 */
function ensureStrictCsp(): void {
  if (cspRegistered || process.env['ELECTRON_RENDERER_URL']) return;
  cspRegistered = true;

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [PROD_CSP],
      },
    });
  });
}

function resolveWindowIcon(): string | undefined {
  const candidates =
    process.platform === 'win32'
      ? [
          path.join(process.resourcesPath ?? '', 'icon.ico'),
          path.join(__dirname, '../renderer/brand/icon.ico'),
          path.join(__dirname, '../renderer/brand/logo-dark.png'),
        ]
      : [
          path.join(process.resourcesPath ?? '', 'icon.png'),
          path.join(__dirname, '../renderer/brand/icon.png'),
          path.join(__dirname, '../renderer/brand/logo-dark.png'),
          path.join(process.resourcesPath ?? '', 'icon.ico'),
        ];
  return candidates.find((p) => p && existsSync(p));
}

/**
 * Creates the hardened primary BrowserWindow for Zed IT Anti Browser.
 */
export function createMainWindow(options: CreateMainWindowOptions): BrowserWindow {
  ensureStrictCsp();
  const icon = resolveWindowIcon();

  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    title: 'Zed IT Anti Browser',
    ...(icon ? { icon } : {}),
    backgroundColor: '#08080A',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      devTools: !app.isPackaged,
    },
  });

  if (!options.smokeTest) {
    win.once('ready-to-show', () => {
      win.show();
    });
  }

  // Deny all renderer-initiated window.open popups
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  const devServerUrl = process.env['ELECTRON_RENDERER_URL'];
  const allowedOrigin = devServerUrl ? new URL(devServerUrl).origin : 'file://';

  win.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      const parsed = new URL(targetUrl);
      if (devServerUrl) {
        if (parsed.origin !== allowedOrigin) {
          event.preventDefault();
        }
      } else if (parsed.protocol !== 'file:') {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(path.resolve(options.rendererHtmlPath));
  }

  return win;
}
