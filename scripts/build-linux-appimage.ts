import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import {
  access,
  chmod,
  cp,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import * as asar from '@electron/asar';
import { Data } from 'resedit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DESKTOP_DIR = path.join(REPO_ROOT, 'apps', 'desktop');
const DIST_DIR = path.join(DESKTOP_DIR, 'dist');
const APPDIR = path.join(DIST_DIR, 'linux-unpacked.AppDir');
const ELECTRON_CACHE_DIR = path.join(REPO_ROOT, '.cache', 'electron');
const APPIMAGETOOL_CACHE_DIR = path.join(REPO_ROOT, '.cache', 'appimagetool');

const APP_NAME = 'Zed IT Anti Browser';
const BIN_NAME = 'zed-it-anti-browser';

const APPIMAGETOOL_VERSION = '1.9.1';
const APPIMAGETOOL_FILENAME = `appimagetool-${APPIMAGETOOL_VERSION}-x86_64.AppImage`;
const APPIMAGETOOL_URL = `https://github.com/AppImage/appimagetool/releases/download/${APPIMAGETOOL_VERSION}/appimagetool-x86_64.AppImage`;
const APPIMAGETOOL_SHA256 = 'ed4ce84f0d9caff66f50bcca6ff6f35aae54ce8135408b3fa33abfc3cb384eb0';

interface BuildMetadata {
  appVersion: string;
  engineVersion: string;
  electronVersion: string;
  electronLinuxZipSha256: string | null;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveBuildMetadata(): Promise<BuildMetadata> {
  const desktopPkg = JSON.parse(
    await readFile(path.join(DESKTOP_DIR, 'package.json'), 'utf8'),
  ) as { version?: string };
  const envVersion = process.env['ZITA_BUILD_VERSION']?.trim().replace(/^v/, '');
  const appVersion =
    envVersion && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(envVersion)
      ? envVersion
      : (desktopPkg.version ?? '0.1.0');

  const engineManifest = JSON.parse(
    await readFile(path.join(REPO_ROOT, 'resources', 'engines', 'manifest.json'), 'utf8'),
  ) as { version: string };

  let electronVersion = '45.4.1';
  let electronLinuxZipSha256: string | null = null;
  const electronDir = path.join(DESKTOP_DIR, 'node_modules', 'electron');
  if (await exists(path.join(electronDir, 'package.json'))) {
    const electronPkg = JSON.parse(
      await readFile(path.join(electronDir, 'package.json'), 'utf8'),
    ) as { version?: string };
    if (electronPkg.version) electronVersion = electronPkg.version;
  }
  const linuxZipName = `electron-v${electronVersion}-linux-x64.zip`;
  if (await exists(path.join(electronDir, 'checksums.json'))) {
    const checksums = JSON.parse(
      await readFile(path.join(electronDir, 'checksums.json'), 'utf8'),
    ) as Record<string, string>;
    electronLinuxZipSha256 = checksums[linuxZipName]?.toLowerCase() ?? null;
  }

  return {
    appVersion,
    engineVersion: engineManifest.version,
    electronVersion,
    electronLinuxZipSha256,
  };
}

function runOrThrow(
  cmd: string,
  args: string[],
  cwd = REPO_ROOT,
  extraEnv?: NodeJS.ProcessEnv,
): void {
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
  });
  if (res.error || res.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(' ')} failed with ${res.error ? res.error.message : `exit code ${res.status}`}`,
    );
  }
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  return res.text();
}

async function downloadFile(url: string, dest: string): Promise<string> {
  await mkdir(path.dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status} (${url})`);

  const total = Number(res.headers.get('content-length') ?? '0');
  const hash = createHash('sha256');
  let received = 0;
  let nextLog = 15 * 1024 * 1024;
  const reader = Readable.fromWeb(res.body as unknown as import('node:stream/web').ReadableStream);
  const out = createWriteStream(part);

  await new Promise<void>((resolve, reject) => {
    reader.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      received += chunk.length;
      if (received >= nextLog) {
        const mb = (received / (1024 * 1024)).toFixed(1);
        const tot = total > 0 ? ` / ${(total / (1024 * 1024)).toFixed(1)} MB` : ' MB';
        console.log(`  downloaded ${mb}${tot}`);
        nextLog += 15 * 1024 * 1024;
      }
    });
    reader.on('error', (err) => {
      out.destroy();
      reject(err);
    });
    out.on('error', (err) => {
      reader.destroy();
      reject(err);
    });
    out.on('finish', () => resolve());
    reader.pipe(out);
  });

  await rename(part, dest);
  return hash.digest('hex');
}

async function sha256File(filePath: string): Promise<string> {
  const buf = await readFile(filePath);
  return createHash('sha256').update(buf).digest('hex');
}

async function ensureElectronLinuxZip(
  electronVersion: string,
  pinnedSha256: string | null,
): Promise<string> {
  const zipName = `electron-v${electronVersion}-linux-x64.zip`;
  const zipUrl = `https://github.com/electron/electron/releases/download/v${electronVersion}/${zipName}`;
  const shasumsUrl = `https://github.com/electron/electron/releases/download/v${electronVersion}/SHASUMS256.txt`;
  const zipPath = path.join(ELECTRON_CACHE_DIR, zipName);

  let expectedSha = pinnedSha256;
  if (!expectedSha) {
    const shasumsText = await fetchText(shasumsUrl);
    const match = shasumsText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.endsWith(`*${zipName}`) || line.endsWith(` ${zipName}`));
    if (!match) {
      throw new Error(`Could not find ${zipName} in Electron SHASUMS256.txt`);
    }
    expectedSha = match.split(/\s+/)[0]!.toLowerCase();
  }

  if (await exists(zipPath)) {
    const actualSha = await sha256File(zipPath);
    if (actualSha === expectedSha) {
      console.log(`Using cached ${zipName} (SHA-256 verified)`);
      return zipPath;
    }
    console.log(`Cached ${zipName} hash mismatch; re-downloading...`);
  }

  console.log(`Downloading ${zipUrl}...`);
  const actualSha = await downloadFile(zipUrl, zipPath);
  if (actualSha !== expectedSha) {
    await rm(zipPath, { force: true });
    throw new Error(`SHA-256 mismatch for ${zipName}: expected ${expectedSha}, got ${actualSha}`);
  }
  console.log(`Verified ${zipName} SHA-256: ${actualSha}`);
  return zipPath;
}

async function ensureAppImageTool(): Promise<string> {
  const toolPath = path.join(APPIMAGETOOL_CACHE_DIR, APPIMAGETOOL_FILENAME);
  if (await exists(toolPath)) {
    const actualSha = await sha256File(toolPath);
    if (actualSha === APPIMAGETOOL_SHA256) {
      await chmod(toolPath, 0o755);
      console.log(`Using cached ${APPIMAGETOOL_FILENAME} (SHA-256 verified)`);
      return toolPath;
    }
    console.log(`Cached ${APPIMAGETOOL_FILENAME} hash mismatch; re-downloading...`);
  }

  console.log(`Downloading ${APPIMAGETOOL_URL}...`);
  const actualSha = await downloadFile(APPIMAGETOOL_URL, toolPath);
  if (actualSha !== APPIMAGETOOL_SHA256) {
    await rm(toolPath, { force: true });
    throw new Error(
      `SHA-256 mismatch for ${APPIMAGETOOL_FILENAME}: expected ${APPIMAGETOOL_SHA256}, got ${actualSha}`,
    );
  }
  await chmod(toolPath, 0o755);
  console.log(`Verified ${APPIMAGETOOL_FILENAME} SHA-256: ${actualSha}`);
  return toolPath;
}

async function auditBundledRuntimeImports(): Promise<void> {
  const mainJs = await readFile(path.join(DESKTOP_DIR, 'out', 'main', 'index.js'), 'utf8');
  const preloadCjs = await readFile(path.join(DESKTOP_DIR, 'out', 'preload', 'preload.cjs'), 'utf8');

  const isAllowed = (spec: string) => spec === 'electron' || spec.startsWith('node:');

  for (const [name, src] of [
    ['out/main/index.js', mainJs],
    ['out/preload/preload.cjs', preloadCjs],
  ] as const) {
    const importRe = /(?:from\s+|import\s+|require\()["']([^"']+)["']/g;
    const disallowed = new Set<string>();
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(src)) !== null) {
      const spec = m[1]!;
      if (spec.startsWith('./') || spec.startsWith('../')) continue;
      if (!isAllowed(spec) && (spec === 'better-sqlite3' || spec === 'drizzle-orm' || spec.startsWith('@zita/'))) {
        disallowed.add(spec);
      }
    }
    if (disallowed.size > 0) {
      throw new Error(`${name} has disallowed unbundled runtime imports: ${Array.from(disallowed).join(', ')}`);
    }
  }
  console.log('Verified out/main and out/preload have zero unbundled third-party/native dependencies.');
}

async function writeLinuxIconsFromIco(icoPath: string, appDir: string, resourcesDir: string): Promise<void> {
  const icoBuf = await readFile(icoPath);
  const iconFile = Data.IconFile.from(icoBuf);

  let largestPng: Buffer | null = null;
  let largestDim = 0;

  for (const entry of iconFile.icons) {
    if (!entry.data.isRaw()) continue;
    const dim = !entry.width || entry.width === 0 ? 256 : entry.width;
    const raw = Buffer.from(entry.data.bin);
    const isPng =
      raw.length >= 8 &&
      raw[0] === 0x89 &&
      raw[1] === 0x50 &&
      raw[2] === 0x4e &&
      raw[3] === 0x47;
    if (!isPng) continue;

    const hicolorDir = path.join(appDir, 'usr', 'share', 'icons', 'hicolor', `${dim}x${dim}`, 'apps');
    await mkdir(hicolorDir, { recursive: true });
    await writeFile(path.join(hicolorDir, `${BIN_NAME}.png`), raw);

    if (dim >= largestDim) {
      largestDim = dim;
      largestPng = raw;
    }
  }

  if (!largestPng) {
    throw new Error(`No embedded PNG icon found in ${icoPath}`);
  }

  await writeFile(path.join(appDir, `${BIN_NAME}.png`), largestPng);
  await writeFile(path.join(appDir, '.DirIcon'), largestPng);
  await writeFile(path.join(resourcesDir, 'icon.png'), largestPng);
}

function buildAppRunScript(): string {
  return `#!/bin/sh
set -e
HERE="$(dirname "$(readlink -f "\${0}")")"
export APPDIR="$HERE"
BIN="$HERE/${BIN_NAME}"

NEED_NO_SANDBOX=0
if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = "1" ]; then
  NEED_NO_SANDBOX=1
elif [ "$(cat /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null)" = "0" ]; then
  NEED_NO_SANDBOX=1
elif ! unshare --user --map-root-user true >/dev/null 2>&1; then
  NEED_NO_SANDBOX=1
fi

if [ "$NEED_NO_SANDBOX" = "1" ]; then
  exec "$BIN" --no-sandbox "$@"
fi
exec "$BIN" "$@"
`;
}

function buildDesktopEntry(appVersion: string): string {
  return `[Desktop Entry]
Name=${APP_NAME}
Comment=Local-first anti-detect browser manager by ZED IT Bangladesh
Exec=${BIN_NAME} %U
Terminal=false
Type=Application
Icon=${BIN_NAME}
StartupWMClass=${APP_NAME}
X-AppImage-Version=${appVersion}
Categories=Network;WebBrowser;
`;
}

async function walkAndVerifyLinuxTree(rootDir: string): Promise<{ fileCount: number; totalBytes: number }> {
  let fileCount = 0;
  let totalBytes = 0;

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const lst = await lstat(full);
      if (lst.isSymbolicLink()) {
        fileCount += 1;
        continue;
      }
      if (lst.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.name.endsWith('.node')) {
        throw new Error(`Found unexpected native addon in Linux package: ${full}`);
      }
      if (entry.name.endsWith('.exe') || entry.name.endsWith('.dll')) {
        throw new Error(`Found Windows PE binary inside Linux package: ${full}`);
      }
      fileCount += 1;
      totalBytes += lst.size;
    }
  }

  await walk(rootDir);
  return { fileCount, totalBytes };
}

async function main(): Promise<void> {
  if (process.platform !== 'linux') {
    throw new Error(`Linux AppImage builds must run on Linux (detected ${process.platform}).`);
  }

  const meta = await resolveBuildMetadata();
  const appImageName = `ZedIT-AntiBrowser-${meta.appVersion}-x86_64.AppImage`;

  const linuxEngineDir = path.join(REPO_ROOT, 'resources', 'engines', meta.engineVersion, 'linux-x64');
  const linuxMarkerPath = path.join(linuxEngineDir, '.zita-engine.json');
  if (!(await exists(linuxMarkerPath))) {
    throw new Error('Linux Chromium engine missing. Run: pnpm engine:fetch -- --platform=linux-x64 --record-sha256');
  }
  const linuxMarker = JSON.parse(await readFile(linuxMarkerPath, 'utf8')) as { executable?: string };
  const linuxChromeBin = linuxMarker.executable ? path.join(linuxEngineDir, linuxMarker.executable) : '';
  if (!linuxChromeBin || !(await exists(linuxChromeBin))) {
    throw new Error('Linux Chromium executable missing. Run: pnpm engine:fetch -- --platform=linux-x64 --force');
  }

  console.log('1/6 Building @zita/desktop renderer, preload & main bundles...');
  runOrThrow('pnpm', ['--filter', '@zita/desktop', 'build']);
  await auditBundledRuntimeImports();

  console.log('2/6 Preparing Linux x64 Electron AppDir...');
  const electronZip = await ensureElectronLinuxZip(meta.electronVersion, meta.electronLinuxZipSha256);
  await rm(APPDIR, { recursive: true, force: true });
  await mkdir(APPDIR, { recursive: true });
  runOrThrow('unzip', ['-q', electronZip, '-d', APPDIR]);

  const rawElectronBin = path.join(APPDIR, 'electron');
  const appBin = path.join(APPDIR, BIN_NAME);
  await rename(rawElectronBin, appBin);
  await chmod(appBin, 0o755);

  for (const helper of ['chrome_crashpad_handler', 'chrome-sandbox']) {
    const helperPath = path.join(APPDIR, helper);
    if (await exists(helperPath)) {
      await chmod(helperPath, 0o755);
    }
  }

  console.log('3/6 Packing resources/app.asar...');
  const resourcesDir = path.join(APPDIR, 'resources');
  await rm(path.join(resourcesDir, 'default_app.asar'), { force: true });

  const stageAppDir = path.join(DIST_DIR, '.stage-app-linux');
  await rm(stageAppDir, { recursive: true, force: true });
  await mkdir(stageAppDir, { recursive: true });
  await cp(path.join(DESKTOP_DIR, 'out'), path.join(stageAppDir, 'out'), { recursive: true });
  await writeFile(
    path.join(stageAppDir, 'package.json'),
    JSON.stringify(
      {
        name: BIN_NAME,
        productName: APP_NAME,
        version: meta.appVersion,
        type: 'module',
        main: './out/main/index.js',
      },
      null,
      2,
    ),
    'utf8',
  );
  await asar.createPackage(stageAppDir, path.join(resourcesDir, 'app.asar'));
  await rm(stageAppDir, { recursive: true, force: true });

  console.log('4/6 Copying Linux Chromium engine, icons & desktop metadata...');
  const destEnginesDir = path.join(resourcesDir, 'engines');
  await mkdir(path.join(destEnginesDir, meta.engineVersion), { recursive: true });
  await cp(
    path.join(REPO_ROOT, 'resources', 'engines', 'manifest.json'),
    path.join(destEnginesDir, 'manifest.json'),
  );
  const destLinuxEngineDir = path.join(destEnginesDir, meta.engineVersion, 'linux-x64');
  await cp(linuxEngineDir, destLinuxEngineDir, {
    recursive: true,
    verbatimSymlinks: true,
  });

  const destChromeBin = path.join(destLinuxEngineDir, linuxMarker.executable!);
  await chmod(destChromeBin, 0o755);
  for (const sibling of ['chrome_crashpad_handler', 'chrome_sandbox', 'chrome-wrapper']) {
    const siblingPath = path.join(path.dirname(destChromeBin), sibling);
    if (await exists(siblingPath)) {
      await chmod(siblingPath, 0o755);
    }
  }

  await cp(
    path.join(REPO_ROOT, 'docs', 'third-party-notices.md'),
    path.join(resourcesDir, 'third-party-notices.md'),
  );

  const iconIcoPath = path.join(DESKTOP_DIR, 'public', 'brand', 'icon.ico');
  await writeLinuxIconsFromIco(iconIcoPath, APPDIR, resourcesDir);

  const appRunPath = path.join(APPDIR, 'AppRun');
  await writeFile(appRunPath, buildAppRunScript(), 'utf8');
  await chmod(appRunPath, 0o755);

  const desktopEntry = buildDesktopEntry(meta.appVersion);
  await writeFile(path.join(APPDIR, `${BIN_NAME}.desktop`), desktopEntry, 'utf8');
  const applicationsDir = path.join(APPDIR, 'usr', 'share', 'applications');
  await mkdir(applicationsDir, { recursive: true });
  await writeFile(path.join(applicationsDir, `${BIN_NAME}.desktop`), desktopEntry, 'utf8');

  console.log('5/6 Auditing Linux AppDir tree (no .node / no Windows PE)...');
  const treeStats = await walkAndVerifyLinuxTree(APPDIR);
  console.log(
    `Verified ${treeStats.fileCount} Linux files (${(treeStats.totalBytes / (1024 * 1024)).toFixed(1)} MB unpacked).`,
  );

  console.log('6/6 Building x86_64 AppImage with appimagetool...');
  const appImageTool = await ensureAppImageTool();
  const outAppImage = path.join(DIST_DIR, appImageName);
  await rm(outAppImage, { force: true });

  runOrThrow(
    appImageTool,
    ['--appimage-extract-and-run', '--no-appstream', APPDIR, outAppImage],
    DIST_DIR,
    { ARCH: 'x86_64' },
  );
  await chmod(outAppImage, 0o755);

  const appImageStat = await stat(outAppImage);
  const appImageSha = await sha256File(outAppImage);
  await writeFile(`${outAppImage}.sha256`, `${appImageSha}  ${appImageName}\n`, 'utf8');

  console.log('');
  console.log('Linux x86_64 AppImage ready:');
  console.log(`  Path:   ${outAppImage}`);
  console.log(`  Size:   ${(appImageStat.size / (1024 * 1024)).toFixed(2)} MB (${appImageStat.size} bytes)`);
  console.log(`  SHA256: ${appImageSha}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
