import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SecretBox } from '../crypto/secrets.js';
import { openDatabase } from '../db/index.js';
import { ProxyService } from '../proxy/service.js';
import { ProfilesService } from './service.js';

describe('ProfilesService, bulk actions, CSV import & export', () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  function setup() {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'zita-prof-'));
    dirs.push(dir);
    const db = openDatabase(path.join(dir, 'data', 'app.db'));
    const secretBox = new SecretBox(Buffer.alloc(32, 3));
    const proxyService = new ProxyService(db, secretBox);
    const profilesService = new ProfilesService(db, dir, secretBox, proxyService);
    return { dir, db, proxyService, profilesService };
  }

  it('creates, copies with new seed, soft-deletes, restores, and permanently deletes profiles', () => {
    const { db, profilesService } = setup();
    try {
      const p1 = profilesService.create({ name: 'FB Client 01', os: 'windows', osVersion: '11' });
      expect(p1.id.startsWith('prf_')).toBe(true);

      const copy = profilesService.copy(p1.id, { randomizeSeed: true });
      expect(copy.id).not.toBe(p1.id);
      expect(copy.seed).not.toBe(p1.seed);
      expect(copy.userDataDir).not.toBe(p1.userDataDir);

      profilesService.softDelete(copy.id);
      expect(profilesService.overview({ view: 'all' }).counts.all).toBe(1);
      expect(profilesService.overview({ view: 'trash' }).counts.trash).toBe(1);

      profilesService.restore(copy.id);
      expect(profilesService.overview({ view: 'all' }).counts.all).toBe(2);

      profilesService.permanentDelete(copy.id);
      expect(profilesService.overview({ view: 'all' }).counts.all).toBe(1);
    } finally {
      db.close();
    }
  });

  it('imports CSV with row-level errors, runs bulk operations, stages cookies, and exports redacted JSON/CSV', () => {
    const { db, proxyService, profilesService } = setup();
    try {
      const csv = [
        'name,os,proxy,tags,folder,notes',
        'Store A,windows,127.0.0.1:8080:u:p,ecom;us,Clients,Ready',
        'Store B,macos,,vip,Clients,Second',
        ',windows,,,,Missing name row',
        'Bad OS,solaris,,,,Unsupported OS row',
      ].join('\n');

      const preview = profilesService.previewCsv(csv);
      expect(preview.validRows).toHaveLength(2);
      expect(preview.errors).toHaveLength(2);

      const imported = profilesService.importCsvRows(preview.validRows);
      expect(imported.importedCount).toBe(2);
      expect(imported.createdProxiesCount).toBe(1);

      const cookieImport = profilesService.importCookies(
        imported.createdProfileIds[0]!,
        '.example.com\tTRUE\t/\tTRUE\t1893456000\tsid\tval123',
      );
      expect(cookieImport.validCount).toBe(1);
      expect(profilesService.getById(imported.createdProfileIds[0]!)?.pendingCookieCount).toBe(1);

      const p2 = proxyService.create({ label: 'Backup', protocol: 'socks5', host: '10.0.0.5', port: 1080 });
      profilesService.bulkAssignProxy(imported.createdProfileIds, p2.id);

      const exportedJson = profilesService.exportData('json');
      expect(exportedJson).toContain('Store A');
      expect(exportedJson).not.toContain(':p@');

      const exportedCsv = profilesService.exportData('csv');
      expect(exportedCsv).toContain('Store B');
    } finally {
      db.close();
    }
  });
});
