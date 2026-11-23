import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { access, chmod, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { EngineManifestSchema, type EnginePlatform } from '@zita/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const ENGINES_DIR = path.join(REPO_ROOT, 'resources', 'engines');
const MANIFEST_PATH = path.join(ENGINES_DIR, 'manifest.json');

interface CliOptions {
  platform: EnginePlatform;
  recordSha256: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const defaultPlatform: EnginePlatform = process.platform === 'win32' ? 'win-x64' : 'linux-x64';
  let platform: EnginePlatform = defaultPlatform;
  let recordSha256 = false;
  let force = false;

  for (const arg of argv) {
    if (arg === '--') continue;
    if (arg === '--record-sha256') {
      recordSha256 = true;
    } else if (arg === '--force') {
      force = true;
    } else if (arg.startsWith('--platform=')) {
      const value = arg.slice('--platform='.length);
      if (value !== 'linux-x64' && value !== 'win-x64') {
        throw new Error(`Unsupported platform "${value}". Expected linux-x64 or win-x64.`);
      }
      platform = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { platform, recordSha256, force };
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findExecutable(dir: string, binaryNames: string[]): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile() && binaryNames.includes(entry.name)) {
      return full;
    }
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nested = await findExecutable(path.join(dir, entry.name), binaryNames);
      if (nested) return nested;
    }
  }
  return null;
}

async function downloadWithHash(
  url: string,
  destPath: string,
): Promise<{ size: number; sha256: string }> {
  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed: HTTP ${response.status} ${response.statusText} (${url})`);
  }

  const contentLength = Number(response.headers.get('content-length') ?? '0');
  const hash = createHash('sha256');
  let downloaded = 0;
  let nextLogAt = 10 * 1024 * 1024;

  const reader = Readable.fromWeb(response.body as unknown as import('node:stream/web').ReadableStream);
  const out = createWriteStream(destPath);

  await new Promise<void>((resolve, reject) => {
    reader.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      downloaded += chunk.length;
      if (downloaded >= nextLogAt) {
        const mb = (downloaded / (1024 * 1024)).toFixed(1);
        const totalMb = contentLength > 0 ? ` / ${(contentLength / (1024 * 1024)).toFixed(1)} MB` : ' MB';
        console.log(`  downloaded ${mb}${totalMb}`);
        nextLogAt += 10 * 1024 * 1024;
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

  return {
    size: downloaded,
    sha256: hash.digest('hex'),
  };
}

function extractArchive(archivePath: string, destDir: string, platform: EnginePlatform): void {
  if (platform === 'linux-x64') {
    const res = spawnSync('tar', ['-xJf', archivePath, '-C', destDir], { stdio: 'inherit' });
    if (res.status !== 0) {
      throw new Error(`tar extraction failed with exit code ${res.status}`);
    }
    return;
  }

  const res = spawnSync('unzip', ['-q', archivePath, '-d', destDir], { stdio: 'inherit' });
  if (res.status !== 0) {
    throw new Error(`unzip extraction failed with exit code ${res.status}`);
  }
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const rawManifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as unknown;
  const manifest = EngineManifestSchema.parse(rawManifest);
  const artifact = manifest.artifacts[opts.platform];

  const versionDir = path.join(ENGINES_DIR, manifest.version);
  const targetDir = path.join(versionDir, opts.platform);
  const markerPath = path.join(targetDir, '.zita-engine.json');
  const binaryNames = opts.platform === 'win-x64' ? ['chrome.exe'] : ['chrome', 'chromium'];

  if (!opts.force && (await fileExists(markerPath))) {
    const marker = JSON.parse(await readFile(markerPath, 'utf8')) as {
      version: string;
      sha256: string;
      executable: string;
    };
    const exePath = path.join(targetDir, marker.executable);
    if (
      marker.version === manifest.version &&
      (!artifact.sha256 || marker.sha256 === artifact.sha256) &&
      (await fileExists(exePath))
    ) {
      console.log(`Engine ${manifest.version} (${opts.platform}) already verified at ${exePath}`);
      return;
    }
  }

  await mkdir(versionDir, { recursive: true });
  const tempRoot = await mkdtemp(path.join(versionDir, '.fetch-'));
  const partFile = path.join(tempRoot, `${artifact.filename}.part`);
  const extractDir = path.join(tempRoot, 'extracted');

  try {
    console.log(`Fetching fingerprint-chromium ${manifest.version} (${opts.platform})...`);
    console.log(`  URL: ${artifact.url}`);
    const { size, sha256 } = await downloadWithHash(artifact.url, partFile);
    console.log(`  Downloaded ${size} bytes, SHA-256: ${sha256}`);

    if (size !== artifact.size) {
      throw new Error(`Size mismatch: expected ${artifact.size} bytes, got ${size} bytes`);
    }

    if (artifact.sha256) {
      if (artifact.sha256.toLowerCase() !== sha256.toLowerCase()) {
        throw new Error(`SHA-256 mismatch: expected ${artifact.sha256}, got ${sha256}`);
      }
    } else if (opts.recordSha256) {
      manifest.artifacts[opts.platform].sha256 = sha256;
      await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      console.log(`  Recorded SHA-256 into ${path.relative(REPO_ROOT, MANIFEST_PATH)}`);
    } else {
      throw new Error(
        `Manifest SHA-256 is null for ${opts.platform}. Re-run with --record-sha256 to pin ${sha256}.`,
      );
    }

    await mkdir(extractDir, { recursive: true });
    console.log('Extracting archive...');
    extractArchive(partFile, extractDir, opts.platform);

    const exeAbs = await findExecutable(extractDir, binaryNames);
    if (!exeAbs) {
      throw new Error(`Could not locate ${binaryNames.join(' or ')} inside extracted engine`);
    }

    if (opts.platform === 'linux-x64') {
      await chmod(exeAbs, 0o755);
      const sandboxPath = path.join(path.dirname(exeAbs), 'chrome_sandbox');
      if (await fileExists(sandboxPath)) {
        const s = await stat(sandboxPath);
        await chmod(sandboxPath, s.mode | 0o755);
      }
    }

    const relExe = path.relative(extractDir, exeAbs);
    await writeFile(
      path.join(extractDir, '.zita-engine.json'),
      `${JSON.stringify(
        {
          version: manifest.version,
          platform: opts.platform,
          sha256,
          size,
          executable: relExe,
          installedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    if (await fileExists(targetDir)) {
      await rm(targetDir, { recursive: true, force: true });
    }
    await rename(extractDir, targetDir);
    console.log(`Engine ready: ${path.join(targetDir, relExe)}`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
