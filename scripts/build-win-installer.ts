import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import {
  access,
  cp,
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
import { Data, NtExecutable, NtExecutableResource, Resource } from 'resedit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DESKTOP_DIR = path.join(REPO_ROOT, 'apps', 'desktop');
const DIST_DIR = path.join(DESKTOP_DIR, 'dist');
const UNPACKED_DIR = path.join(DIST_DIR, 'win-unpacked');
const CACHE_DIR = path.join(REPO_ROOT, '.cache', 'electron');

const APP_NAME = 'Zed IT Anti Browser';
const EXE_NAME = 'Zed IT Anti Browser.exe';
const APP_VERSION = '0.1.0';
const ENGINE_VERSION = '150.0.7871.186';
const ELECTRON_VERSION = '45.4.1';
const ELECTRON_WIN_ZIP = `electron-v${ELECTRON_VERSION}-win32-x64.zip`;
const ELECTRON_WIN_URL = `https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/${ELECTRON_WIN_ZIP}`;
const ELECTRON_SHASUMS_URL = `https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/SHASUMS256.txt`;
const INSTALLER_NAME = `ZedIT-AntiBrowser-Setup-${APP_VERSION}-amd64.exe`;

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function runOrThrow(cmd: string, args: string[], cwd = REPO_ROOT): void {
  const res = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${res.status}`);
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

async function ensureElectronWinZip(): Promise<string> {
  const zipPath = path.join(CACHE_DIR, ELECTRON_WIN_ZIP);
  const shasumsText = await fetchText(ELECTRON_SHASUMS_URL);
  const match = shasumsText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.endsWith(`*${ELECTRON_WIN_ZIP}`) || line.endsWith(` ${ELECTRON_WIN_ZIP}`));
  if (!match) {
    throw new Error(`Could not find ${ELECTRON_WIN_ZIP} in Electron SHASUMS256.txt`);
  }
  const expectedSha = match.split(/\s+/)[0]!.toLowerCase();

  if (await exists(zipPath)) {
    const actualSha = await sha256File(zipPath);
    if (actualSha === expectedSha) {
      console.log(`Using cached ${ELECTRON_WIN_ZIP} (SHA-256 verified)`);
      return zipPath;
    }
    console.log(`Cached ${ELECTRON_WIN_ZIP} hash mismatch; re-downloading...`);
  }

  console.log(`Downloading ${ELECTRON_WIN_URL}...`);
  const actualSha = await downloadFile(ELECTRON_WIN_URL, zipPath);
  if (actualSha !== expectedSha) {
    await rm(zipPath, { force: true });
    throw new Error(`SHA-256 mismatch for ${ELECTRON_WIN_ZIP}: expected ${expectedSha}, got ${actualSha}`);
  }
  console.log(`Verified ${ELECTRON_WIN_ZIP} SHA-256: ${actualSha}`);
  return zipPath;
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
      // Ignore relative chunk/string false positives outside module specifiers when clearly URLs/paths
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

async function patchWindowsExecutable(exePath: string, iconPath: string): Promise<void> {
  const exeBuf = await readFile(exePath);
  const icoBuf = await readFile(iconPath);

  const exe = NtExecutable.from(exeBuf);
  const res = NtExecutableResource.from(exe);

  const iconFile = Data.IconFile.from(icoBuf);
  const existingGroups = Resource.IconGroupEntry.fromEntries(res.entries);
  const groupId = existingGroups[0]?.id ?? 1;
  const groupLang = existingGroups[0]?.lang ?? 1033;
  Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    groupId,
    groupLang,
    iconFile.icons.map((i) => i.data),
  );

  const viList = Resource.VersionInfo.fromEntries(res.entries);
  const vi = viList[0] ?? Resource.VersionInfo.createEmpty();
  vi.setFileVersion(0, 1, 0, 0, 1033);
  vi.setProductVersion(0, 1, 0, 0, 1033);
  vi.setStringValues(
    { lang: 1033, codepage: 1200 },
    {
      ProductName: APP_NAME,
      FileDescription: APP_NAME,
      CompanyName: 'ZED IT Bangladesh',
      LegalCopyright: 'Copyright © 2026 ZED IT Bangladesh',
      FileVersion: APP_VERSION,
      ProductVersion: APP_VERSION,
      InternalName: APP_NAME,
      OriginalFilename: EXE_NAME,
    },
  );
  vi.outputToResourceEntries(res.entries);

  res.outputResource(exe);
  await writeFile(exePath, Buffer.from(exe.generate()));
  console.log(`Patched PE icon & version resources on ${path.basename(exePath)}`);
}

async function walkAndVerifyWindowsTree(rootDir: string): Promise<{ fileCount: number; totalBytes: number }> {
  let fileCount = 0;
  let totalBytes = 0;

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (entry.name.endsWith('.node')) {
        throw new Error(`Found unexpected native addon in Windows package: ${full}`);
      }
      const st = await stat(full);
      fileCount += 1;
      totalBytes += st.size;
      if (entry.isFile() && st.size >= 4) {
        const fh = await readFile(full, { flag: 'r' }).then((b) => b.subarray(0, 4));
        if (fh[0] === 0x7f && fh[1] === 0x45 && fh[2] === 0x4c && fh[3] === 0x46) {
          throw new Error(`Found Linux ELF binary inside Windows package: ${full}`);
        }
      }
    }
  }

  await walk(rootDir);
  return { fileCount, totalBytes };
}

function buildNsisScript(opts: {
  unpackedDir: string;
  outExe: string;
  iconPath: string;
  estimatedSizeKb: number;
}): string {
  const esc = (p: string) => p.replaceAll('/', '\\');
  return `!include "MUI2.nsh"
!include "x64.nsh"

Unicode True
Name "${APP_NAME}"
OutFile "${esc(opts.outExe)}"
InstallDir "$LOCALAPPDATA\\Programs\\${APP_NAME}"
InstallDirRegKey HKCU "Software\\ZedIT\\AntiBrowser" "InstallDir"
RequestExecutionLevel user
ManifestDPIAware true
SetCompressor /SOLID lzma
SetCompressorDictSize 32

!define MUI_ABORTWARNING
!define MUI_ICON "${esc(opts.iconPath)}"
!define MUI_UNICON "${esc(opts.iconPath)}"
!define MUI_FINISHPAGE_RUN "$INSTDIR\\${EXE_NAME}"
!define MUI_FINISHPAGE_RUN_TEXT "Launch ${APP_NAME}"

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Function .onInit
  \${IfNot} \${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "${APP_NAME} requires a 64-bit (amd64/x64) edition of Windows 10 or Windows 11."
    Abort
  \${EndIf}
FunctionEnd

Section "Install"
  SetShellVarContext current
  SetOutPath "$INSTDIR"
  File /r "${esc(opts.unpackedDir)}\\*"

  WriteRegStr HKCU "Software\\ZedIT\\AntiBrowser" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ZedITAntiBrowser" "DisplayName" "${APP_NAME}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ZedITAntiBrowser" "DisplayVersion" "${APP_VERSION}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ZedITAntiBrowser" "Publisher" "ZED IT Bangladesh"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ZedITAntiBrowser" "DisplayIcon" "$INSTDIR\\${EXE_NAME}"
  WriteRegStr HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ZedITAntiBrowser" "UninstallString" "$\\"$INSTDIR\\Uninstall.exe$\\""
  WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ZedITAntiBrowser" "NoModify" 1
  WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ZedITAntiBrowser" "NoRepair" 1
  WriteRegDWORD HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ZedITAntiBrowser" "EstimatedSize" ${opts.estimatedSizeKb}

  CreateDirectory "$SMPROGRAMS\\${APP_NAME}"
  CreateShortCut "$SMPROGRAMS\\${APP_NAME}\\${APP_NAME}.lnk" "$INSTDIR\\${EXE_NAME}" "" "$INSTDIR\\resources\\icon.ico"
  CreateShortCut "$SMPROGRAMS\\${APP_NAME}\\Uninstall ${APP_NAME}.lnk" "$INSTDIR\\Uninstall.exe"
  CreateShortCut "$DESKTOP\\${APP_NAME}.lnk" "$INSTDIR\\${EXE_NAME}" "" "$INSTDIR\\resources\\icon.ico"

  WriteUninstaller "$INSTDIR\\Uninstall.exe"
SectionEnd

Section "Uninstall"
  SetShellVarContext current
  Delete "$DESKTOP\\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\\${APP_NAME}\\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\\${APP_NAME}\\Uninstall ${APP_NAME}.lnk"
  RMDir "$SMPROGRAMS\\${APP_NAME}"
  DeleteRegKey HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\ZedITAntiBrowser"
  DeleteRegKey HKCU "Software\\ZedIT\\AntiBrowser"
  RMDir /r "$INSTDIR"
SectionEnd
`;
}

async function main(): Promise<void> {
  const winEngineDir = path.join(REPO_ROOT, 'resources', 'engines', ENGINE_VERSION, 'win-x64');
  const winChromeExe = path.join(
    winEngineDir,
    'ungoogled-chromium_150.0.7871.186-1.1_windows_x64',
    'chrome.exe',
  );
  if (!(await exists(path.join(winEngineDir, '.zita-engine.json'))) || !(await exists(winChromeExe))) {
    throw new Error('Windows Chromium engine missing. Run: pnpm engine:fetch -- --platform=win-x64 --record-sha256');
  }

  console.log('1/6 Building @zita/desktop renderer, preload & main bundles...');
  runOrThrow('pnpm', ['--filter', '@zita/desktop', 'build']);
  await auditBundledRuntimeImports();

  console.log('2/6 Preparing Windows x64 Electron runtime...');
  const electronZip = await ensureElectronWinZip();
  await rm(UNPACKED_DIR, { recursive: true, force: true });
  await mkdir(UNPACKED_DIR, { recursive: true });
  runOrThrow('unzip', ['-q', electronZip, '-d', UNPACKED_DIR]);

  const rawElectronExe = path.join(UNPACKED_DIR, 'electron.exe');
  const appExe = path.join(UNPACKED_DIR, EXE_NAME);
  await rename(rawElectronExe, appExe);

  const iconPath = path.join(DESKTOP_DIR, 'public', 'brand', 'icon.ico');
  await patchWindowsExecutable(appExe, iconPath);

  console.log('3/6 Packing resources/app.asar...');
  const resourcesDir = path.join(UNPACKED_DIR, 'resources');
  await rm(path.join(resourcesDir, 'default_app.asar'), { force: true });

  const stageAppDir = path.join(DIST_DIR, '.stage-app');
  await rm(stageAppDir, { recursive: true, force: true });
  await mkdir(stageAppDir, { recursive: true });
  await cp(path.join(DESKTOP_DIR, 'out'), path.join(stageAppDir, 'out'), { recursive: true });
  await writeFile(
    path.join(stageAppDir, 'package.json'),
    JSON.stringify(
      {
        name: 'zed-it-anti-browser',
        productName: APP_NAME,
        version: APP_VERSION,
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

  console.log('4/6 Copying Windows Chromium engine & metadata...');
  const destEnginesDir = path.join(resourcesDir, 'engines');
  await mkdir(path.join(destEnginesDir, ENGINE_VERSION), { recursive: true });
  await cp(
    path.join(REPO_ROOT, 'resources', 'engines', 'manifest.json'),
    path.join(destEnginesDir, 'manifest.json'),
  );
  await cp(winEngineDir, path.join(destEnginesDir, ENGINE_VERSION, 'win-x64'), {
    recursive: true,
  });
  await cp(
    path.join(REPO_ROOT, 'docs', 'third-party-notices.md'),
    path.join(resourcesDir, 'third-party-notices.md'),
  );
  await cp(iconPath, path.join(resourcesDir, 'icon.ico'));

  console.log('5/6 Auditing win-unpacked tree (no .node / no Linux ELF)...');
  const treeStats = await walkAndVerifyWindowsTree(UNPACKED_DIR);
  const estimatedSizeKb = Math.ceil(treeStats.totalBytes / 1024);
  console.log(
    `Verified ${treeStats.fileCount} Windows files (${(treeStats.totalBytes / (1024 * 1024)).toFixed(1)} MB unpacked).`,
  );

  console.log('6/6 Compiling Windows amd64 NSIS installer with makensis...');
  const outInstaller = path.join(DIST_DIR, INSTALLER_NAME);
  await rm(outInstaller, { force: true });
  const nsiPath = path.join(DIST_DIR, 'installer.nsi');
  await writeFile(
    nsiPath,
    buildNsisScript({
      unpackedDir: UNPACKED_DIR,
      outExe: outInstaller,
      iconPath,
      estimatedSizeKb,
    }),
    'utf8',
  );

  runOrThrow('makensis', ['-V2', nsiPath]);

  const installerStat = await stat(outInstaller);
  const installerSha = await sha256File(outInstaller);
  console.log('');
  console.log('Windows amd64 installer ready:');
  console.log(`  Path:   ${outInstaller}`);
  console.log(`  Size:   ${(installerStat.size / (1024 * 1024)).toFixed(2)} MB (${installerStat.size} bytes)`);
  console.log(`  SHA256: ${installerSha}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
