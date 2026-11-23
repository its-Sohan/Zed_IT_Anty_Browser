import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SecretBox } from '../crypto/secrets.js';
import { openDatabase } from '../db/index.js';
import { ProfilesService } from '../profiles/service.js';
import { ProxyService } from '../proxy/service.js';
import { ProfileLauncher } from './launcher.js';

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

describe('ProfileLauncher', () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) {
      rmSync(dirs.pop()!, { recursive: true, force: true });
    }
  });

  const engineExe = resolveLocalEngineExecutable();

  it.skipIf(!engineExe)(
    'clears stale DevToolsActivePort and succeeds across launch -> stop -> relaunch',
    async () => {
      const dir = mkdtempSync(path.join(os.tmpdir(), 'zita-launcher-'));
      dirs.push(dir);
      const db = openDatabase(path.join(dir, 'data', 'app.db'));
      const secretBox = new SecretBox(Buffer.alloc(32, 7));
      const proxyService = new ProxyService(db, secretBox);
      const profilesService = new ProfilesService(db, dir, secretBox, proxyService);
      const launcher = new ProfileLauncher({
        database: db,
        profilesService,
        proxyService,
        resolveExecutable: () => engineExe,
      });

      try {
        const profile = profilesService.create({
          name: 'Relaunch Regression Profile',
          os: 'windows',
          osVersion: '10',
          extraFlags: ['--headless=new', '--mute-audio'],
        });

        // Simulate a stale DevToolsActivePort left behind by an earlier dead browser run
        mkdirSync(profile.userDataDir, { recursive: true });
        writeFileSync(
          path.join(profile.userDataDir, 'DevToolsActivePort'),
          '35559\n/devtools/browser/stale-target\n',
          'utf8',
        );

        const first = await launcher.launch(profile.id);
        expect(first.cdpPort).toBeGreaterThan(0);
        expect(first.cdpPort).not.toBe(35559);
        expect(launcher.isRunning(profile.id)).toBe(true);

        await launcher.stop(profile.id);
        expect(launcher.isRunning(profile.id)).toBe(false);
        expect(existsSync(path.join(profile.userDataDir, 'DevToolsActivePort'))).toBe(false);

        // Write another stale port before relaunching to confirm relaunch clears it too
        writeFileSync(
          path.join(profile.userDataDir, 'DevToolsActivePort'),
          '35559\n/devtools/browser/stale-target-2\n',
          'utf8',
        );

        const second = await launcher.launch(profile.id);
        expect(second.cdpPort).toBeGreaterThan(0);
        expect(second.cdpPort).not.toBe(35559);
        expect(launcher.isRunning(profile.id)).toBe(true);

        await launcher.stop(profile.id);
        expect(launcher.isRunning(profile.id)).toBe(false);
      } finally {
        await launcher.stopAll();
        db.close();
      }
    },
    45_000,
  );
});
