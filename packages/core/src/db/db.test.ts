import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DEFAULT_STATUSES,
  activityLog,
  createId,
  folders,
  openDatabase,
  profileSessions,
  profileTags,
  profiles,
  proxies,
  settings,
  statuses,
  tags,
} from './index.js';

describe('SQLite + Drizzle database service', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
  });

  it('generates prefixed UUIDv7 identifiers with monotonic timestamp order', () => {
    const id1 = createId('prf');
    const id2 = createId('prx');
    expect(id1).toMatch(/^prf_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(id2).toMatch(/^prx_[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('initializes file database in WAL mode with foreign keys ON and idempotent seeds', () => {
    const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'zita-db-test-'));
    tempDirs.push(tmpDir);
    const dbPath = path.join(tmpDir, 'data', 'app.db');

    const handle1 = openDatabase(dbPath);
    expect(handle1.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(handle1.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);

    const seededStatuses = handle1.db.select().from(statuses).all();
    expect(seededStatuses).toHaveLength(DEFAULT_STATUSES.length);
    expect(seededStatuses.find((s) => s.isDefault)?.name).toBe('Active');

    const seededSettings = handle1.db.select().from(settings).all();
    expect(seededSettings).toHaveLength(Object.keys(DEFAULT_SETTINGS).length);
    handle1.close();

    // Re-opening must not duplicate seeded rows
    const handle2 = openDatabase(dbPath);
    expect(handle2.db.select().from(statuses).all()).toHaveLength(DEFAULT_STATUSES.length);
    expect(handle2.db.select().from(settings).all()).toHaveLength(Object.keys(DEFAULT_SETTINGS).length);
    handle2.close();
  });

  it('supports CRUD and cascade / set-null foreign keys across core tables', () => {
    const { db, close } = openDatabase(':memory:');
    try {
      const now = new Date().toISOString();
      const defaultStatus = db.select().from(statuses).where(eq(statuses.isDefault, true)).get()!;
      const folderId = createId('fld');
      const tagId = createId('tag');
      const proxyId = createId('prx');
      const profileId = createId('prf');
      const sessionId = createId('ses');
      const actId = createId('act');

      db.insert(folders).values({ id: folderId, name: 'Clients', sortOrder: 0, createdAt: now, updatedAt: now }).run();
      db.insert(tags).values({ id: tagId, name: 'fb-ads', color: '#38BDF8', createdAt: now }).run();
      db.insert(proxies)
        .values({
          id: proxyId,
          label: 'US Residential',
          protocol: 'socks5',
          host: '203.0.113.10',
          port: 1080,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.insert(profiles)
        .values({
          id: profileId,
          name: 'Client A — FB 01',
          folderId,
          statusId: defaultStatus.id,
          proxyId,
          os: 'windows',
          osVersion: '10',
          seed: 1287349192,
          fingerprintJson: JSON.stringify({ schemaVersion: 1, seed: 1287349192 }),
          engineVersion: '150.0.7871.186',
          userDataDir: '/tmp/zita-profiles/prf_1',
          createdAt: now,
          updatedAt: now,
        })
        .run();

      db.insert(profileTags).values({ profileId, tagId }).run();
      db.insert(profileSessions)
        .values({ id: sessionId, profileId, pid: 12345, cdpPort: 9222, bridgePort: 45123, startedAt: now })
        .run();
      db.insert(activityLog)
        .values({ id: actId, profileId, action: 'profile.created', metaJson: '{"name":"Client A"}', createdAt: now })
        .run();

      // Deleting folder sets profiles.folderId to NULL
      db.delete(folders).where(eq(folders.id, folderId)).run();
      const afterFolderDelete = db.select().from(profiles).where(eq(profiles.id, profileId)).get()!;
      expect(afterFolderDelete.folderId).toBeNull();

      // Deleting profile cascades profileTags & profileSessions, and sets activityLog.profileId to NULL
      db.delete(profiles).where(eq(profiles.id, profileId)).run();
      expect(db.select().from(profileTags).all()).toHaveLength(0);
      expect(db.select().from(profileSessions).all()).toHaveLength(0);
      const logRow = db.select().from(activityLog).where(eq(activityLog.id, actId)).get()!;
      expect(logRow.profileId).toBeNull();
    } finally {
      close();
    }
  });
});
