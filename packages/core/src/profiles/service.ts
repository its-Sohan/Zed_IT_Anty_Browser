import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { desc, eq, inArray, isNull } from 'drizzle-orm';
import {
  FingerprintConfigSchema,
  type FingerprintConfig,
  type Platform,
  type ProbeSnapshot,
  type ProfileDetail,
  type ProfileListFilter,
  type ProfilesOverview,
  type ProfileSummary,
} from '@zita/shared';
import type { NormalizedCookie } from '../cookies/parser.js';
import { parseCookies } from '../cookies/parser.js';
import { clearCookiesFiles } from '../cookies/cdp-seeder.js';
import type { SecretBox } from '../crypto/secrets.js';
import {
  activityLog,
  createId,
  folders,
  profiles,
  profileSessions,
  profileTags,
  statuses,
  tags,
  type ZitaDatabase,
} from '../db/index.js';
import { validateExtraFlags } from '../engine/flags.js';
import { generateFingerprint, generateSeed } from '../fingerprint/generator.js';
import type { ProxyService } from '../proxy/service.js';
import { previewCsvImport, type ValidatedCsvProfileRow } from './csv-import.js';

export interface CreateProfileInput {
  name: string;
  folderId?: string | null;
  statusId?: string | null;
  proxyId?: string | null;
  notes?: string | null;
  os?: Platform;
  osVersion?: string;
  seed?: number;
  fingerprint?: FingerprintConfig;
  engineVersion?: string;
  startPages?: string[];
  extraFlags?: string[];
  tagIds?: string[];
}

export interface UpdateProfileInput {
  name?: string;
  folderId?: string | null;
  statusId?: string | null;
  proxyId?: string | null;
  notes?: string | null;
  fingerprint?: FingerprintConfig;
  startPages?: string[];
  extraFlags?: string[];
  tagIds?: string[];
}

const PENDING_COOKIES_FILENAME = '.zita-pending-cookies.enc';

/**
 * Core CRUD, organization, bulk operations, CSV import, cookie staging, and export service for profiles.
 */
export class ProfilesService {
  constructor(
    private readonly database: ZitaDatabase,
    private readonly storageRoot: string,
    private readonly secretBox: SecretBox,
    private readonly proxyService: ProxyService,
    private readonly defaultEngineVersion = '150.0.7871.186',
  ) {}

  getProfilesRootDir(): string {
    return path.join(this.storageRoot, 'profiles');
  }

  private resolveSafeUserDataDir(profileId: string): string {
    const root = path.resolve(this.getProfilesRootDir());
    const target = path.resolve(root, profileId);
    if (!target.startsWith(`${root}${path.sep}`)) {
      throw new Error(`Unsafe profile directory path for ${profileId}`);
    }
    return target;
  }

  private getDefaultStatusId(): string | null {
    const def = this.database.db.select().from(statuses).where(eq(statuses.isDefault, true)).get();
    return def?.id ?? null;
  }

  logActivity(action: string, profileId: string | null, meta?: Record<string, unknown>): void {
    this.database.db
      .insert(activityLog)
      .values({
        id: createId('act'),
        profileId,
        action,
        metaJson: meta ? JSON.stringify(meta) : null,
        createdAt: new Date().toISOString(),
      })
      .run();
  }

  overview(filter: Partial<ProfileListFilter> = {}, runningIds: Set<string> = new Set()): ProfilesOverview {
    const view = filter.view ?? 'all';
    const allProfiles = this.database.db.select().from(profiles).orderBy(desc(profiles.updatedAt)).all();
    const proxyList = this.proxyService.list();
    const proxyById = new Map(proxyList.map((p) => [p.id, p]));

    const dbActiveSessions = this.database.db
      .select({ profileId: profileSessions.profileId })
      .from(profileSessions)
      .where(isNull(profileSessions.endedAt))
      .all();
    const effectiveRunning = new Set([...runningIds, ...dbActiveSessions.map((s) => s.profileId)]);

    const tagLinks = this.database.db.select().from(profileTags).all();
    const tagsByProfile = new Map<string, string[]>();
    const profileCountByTag = new Map<string, number>();
    for (const link of tagLinks) {
      const arr = tagsByProfile.get(link.profileId) ?? [];
      arr.push(link.tagId);
      tagsByProfile.set(link.profileId, arr);
    }

    const nonDeleted = allProfiles.filter((p) => p.deletedAt === null);
    const trashed = allProfiles.filter((p) => p.deletedAt !== null);

    const countByFolder = new Map<string, number>();
    const countByStatus = new Map<string, number>();
    for (const p of nonDeleted) {
      if (p.folderId) countByFolder.set(p.folderId, (countByFolder.get(p.folderId) ?? 0) + 1);
      if (p.statusId) countByStatus.set(p.statusId, (countByStatus.get(p.statusId) ?? 0) + 1);
      for (const tId of tagsByProfile.get(p.id) ?? []) {
        profileCountByTag.set(tId, (profileCountByTag.get(tId) ?? 0) + 1);
      }
    }

    const tagNameById = new Map(this.database.db.select().from(tags).all().map((t) => [t.id, t.name]));
    const searchLower = filter.search?.trim().toLowerCase();

    const visible: ProfileSummary[] = allProfiles
      .filter((p) => {
        if (view === 'trash') return p.deletedAt !== null;
        if (p.deletedAt !== null) return false;
        if (view === 'running' && !effectiveRunning.has(p.id)) return false;
        if (filter.folderId && p.folderId !== filter.folderId) return false;
        if (filter.statusId && p.statusId !== filter.statusId) return false;
        if (filter.tagId && !(tagsByProfile.get(p.id) ?? []).includes(filter.tagId)) return false;
        if (searchLower) {
          const proxy = p.proxyId ? proxyById.get(p.proxyId) : undefined;
          const tagNames = (tagsByProfile.get(p.id) ?? []).map((id) => tagNameById.get(id) ?? '').join(' ');
          const haystack = `${p.name} ${p.id} ${p.notes ?? ''} ${proxy?.host ?? ''} ${proxy?.label ?? ''} ${tagNames}`.toLowerCase();
          if (!haystack.includes(searchLower)) return false;
        }
        return true;
      })
      .map((p) => ({
        id: p.id,
        name: p.name,
        folderId: p.folderId,
        statusId: p.statusId,
        proxyId: p.proxyId,
        os: p.os as Platform,
        osVersion: p.osVersion,
        seed: p.seed,
        engineVersion: p.engineVersion,
        notes: p.notes,
        lastStartedAt: p.lastStartedAt,
        lastStoppedAt: p.lastStoppedAt,
        launchCount: p.launchCount,
        deletedAt: p.deletedAt,
        running: effectiveRunning.has(p.id),
        tagIds: tagsByProfile.get(p.id) ?? [],
      }));

    const folderRows = this.database.db.select().from(folders).all();
    const statusRows = this.database.db.select().from(statuses).all();
    const tagRows = this.database.db.select().from(tags).all();

    return {
      profiles: visible,
      counts: {
        all: nonDeleted.length,
        running: nonDeleted.filter((p) => effectiveRunning.has(p.id)).length,
        trash: trashed.length,
      },
      folders: folderRows
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((f) => ({
          id: f.id,
          name: f.name,
          parentId: f.parentId,
          sortOrder: f.sortOrder,
          profileCount: countByFolder.get(f.id) ?? 0,
        })),
      statuses: statusRows
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => ({
          id: s.id,
          name: s.name,
          color: s.color,
          icon: s.icon,
          isDefault: s.isDefault,
          profileCount: countByStatus.get(s.id) ?? 0,
        })),
      tags: tagRows.map((t) => ({
        id: t.id,
        name: t.name,
        color: t.color,
        profileCount: profileCountByTag.get(t.id) ?? 0,
      })),
    };
  }

  getById(id: string, runningIds: Set<string> = new Set()): ProfileDetail | null {
    const row = this.database.db.select().from(profiles).where(eq(profiles.id, id)).get();
    if (!row) return null;

    const tagLinks = this.database.db
      .select()
      .from(profileTags)
      .where(eq(profileTags.profileId, id))
      .all();

    let observedFingerprint: ProbeSnapshot | null = null;
    if (row.observedFingerprintJson) {
      try {
        observedFingerprint = JSON.parse(row.observedFingerprintJson) as ProbeSnapshot;
      } catch {
        observedFingerprint = null;
      }
    }

    return {
      id: row.id,
      name: row.name,
      folderId: row.folderId,
      statusId: row.statusId,
      proxyId: row.proxyId,
      os: row.os as Platform,
      osVersion: row.osVersion,
      seed: row.seed,
      engineVersion: row.engineVersion,
      notes: row.notes,
      lastStartedAt: row.lastStartedAt,
      lastStoppedAt: row.lastStoppedAt,
      launchCount: row.launchCount,
      deletedAt: row.deletedAt,
      running: runningIds.has(row.id),
      tagIds: tagLinks.map((t) => t.tagId),
      fingerprint: FingerprintConfigSchema.parse(JSON.parse(row.fingerprintJson)),
      observedFingerprint,
      userDataDir: row.userDataDir,
      startPages: JSON.parse(row.startPagesJson) as string[],
      extraFlags: JSON.parse(row.flagsJson) as string[],
      pendingCookieCount: this.getPendingCookies(row.userDataDir).length,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  countStoredProfiles(): number {
    return this.database.db.select().from(profiles).where(isNull(profiles.deletedAt)).all().length;
  }

  create(input: CreateProfileInput): ProfileDetail {
    const name = input.name.trim();
    if (!name || name.length > 120) {
      throw new Error('Profile name must be between 1 and 120 characters');
    }

    const extraFlags = validateExtraFlags(input.extraFlags ?? []);
    const id = createId('prf');
    const now = new Date().toISOString();
    const userDataDir = this.resolveSafeUserDataDir(id);
    mkdirSync(userDataDir, { recursive: true });

    const os = input.fingerprint?.platform ?? input.os ?? 'windows';
    const fp = input.fingerprint
      ? FingerprintConfigSchema.parse(input.fingerprint)
      : generateFingerprint({
          os,
          osVersion: input.osVersion,
          seed: input.seed,
        });

    const statusId = input.statusId !== undefined ? input.statusId : this.getDefaultStatusId();

    this.database.db
      .insert(profiles)
      .values({
        id,
        name,
        folderId: input.folderId ?? null,
        statusId,
        notes: input.notes?.trim() || null,
        proxyId: input.proxyId ?? null,
        os: fp.platform,
        osVersion: fp.platformVersion,
        seed: fp.seed,
        fingerprintJson: JSON.stringify(fp),
        engineVersion: input.engineVersion ?? this.defaultEngineVersion,
        userDataDir,
        startPagesJson: JSON.stringify(input.startPages ?? []),
        flagsJson: JSON.stringify(extraFlags),
        createdAt: now,
        updatedAt: now,
      })
      .run();

    if (input.tagIds?.length) {
      for (const tagId of input.tagIds) {
        this.database.db.insert(profileTags).values({ profileId: id, tagId }).onConflictDoNothing().run();
      }
    }

    this.logActivity('profile.created', id, { name, os: fp.platform });
    return this.getById(id)!;
  }

  quickCreate(os: Platform = 'windows'): ProfileDetail {
    const count = this.database.db.select().from(profiles).all().length + 1;
    return this.create({
      name: `Profile ${count}`,
      os,
    });
  }

  update(id: string, input: UpdateProfileInput): ProfileDetail {
    const existing = this.database.db.select().from(profiles).where(eq(profiles.id, id)).get();
    if (!existing) throw new Error(`Profile ${id} not found`);

    const now = new Date().toISOString();
    const nextFp = input.fingerprint
      ? FingerprintConfigSchema.parse(input.fingerprint)
      : FingerprintConfigSchema.parse(JSON.parse(existing.fingerprintJson));

    const nextFlags =
      input.extraFlags !== undefined
        ? validateExtraFlags(input.extraFlags)
        : (JSON.parse(existing.flagsJson) as string[]);

    const nextName = input.name !== undefined ? input.name.trim() : existing.name;
    if (!nextName || nextName.length > 120) {
      throw new Error('Profile name must be between 1 and 120 characters');
    }

    this.database.db
      .update(profiles)
      .set({
        name: nextName,
        folderId: input.folderId !== undefined ? input.folderId : existing.folderId,
        statusId: input.statusId !== undefined ? input.statusId : existing.statusId,
        proxyId: input.proxyId !== undefined ? input.proxyId : existing.proxyId,
        notes: input.notes !== undefined ? input.notes?.trim() || null : existing.notes,
        os: nextFp.platform,
        osVersion: nextFp.platformVersion,
        seed: nextFp.seed,
        fingerprintJson: JSON.stringify(nextFp),
        startPagesJson:
          input.startPages !== undefined ? JSON.stringify(input.startPages) : existing.startPagesJson,
        flagsJson: JSON.stringify(nextFlags),
        updatedAt: now,
      })
      .where(eq(profiles.id, id))
      .run();

    if (input.tagIds !== undefined) {
      this.database.db.delete(profileTags).where(eq(profileTags.profileId, id)).run();
      for (const tagId of input.tagIds) {
        this.database.db.insert(profileTags).values({ profileId: id, tagId }).onConflictDoNothing().run();
      }
    }

    this.logActivity('profile.updated', id, { name: nextName });
    return this.getById(id)!;
  }

  copy(
    id: string,
    opts: { name?: string; randomizeSeed?: boolean; copyCookies?: boolean } = {},
  ): ProfileDetail {
    const source = this.getById(id);
    if (!source) throw new Error(`Profile ${id} not found`);

    const randomize = opts.randomizeSeed ?? true;
    const nextFp = randomize
      ? generateFingerprint({
          os: source.fingerprint.platform,
          osVersion: source.fingerprint.platformVersion,
          seed: generateSeed(),
          brand: source.fingerprint.brand,
          brandVersion: source.fingerprint.brandVersion,
          timezone: source.fingerprint.timezone.value,
          locale: source.fingerprint.locale.value,
        })
      : { ...source.fingerprint };

    const created = this.create({
      name: opts.name?.trim() || `${source.name} (Copy)`,
      folderId: source.folderId,
      statusId: source.statusId,
      proxyId: source.proxyId,
      notes: source.notes,
      fingerprint: nextFp,
      engineVersion: source.engineVersion,
      startPages: source.startPages,
      extraFlags: source.extraFlags,
      tagIds: source.tagIds,
    });

    if (opts.copyCookies) {
      const pending = this.getPendingCookies(source.userDataDir);
      if (pending.length > 0) {
        this.savePendingCookies(created.userDataDir, pending);
      }
    }

    this.logActivity('profile.copied', created.id, { sourceId: id, randomizeSeed: randomize });
    return this.getById(created.id)!;
  }

  softDelete(id: string): void {
    const now = new Date().toISOString();
    this.database.db
      .update(profiles)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(profiles.id, id))
      .run();
    this.logActivity('profile.trashed', id);
  }

  restore(id: string): void {
    const now = new Date().toISOString();
    this.database.db
      .update(profiles)
      .set({ deletedAt: null, updatedAt: now })
      .where(eq(profiles.id, id))
      .run();
    this.logActivity('profile.restored', id);
  }

  permanentDelete(id: string): void {
    const row = this.database.db.select().from(profiles).where(eq(profiles.id, id)).get();
    if (!row) return;

    const root = path.resolve(this.getProfilesRootDir());
    const target = path.resolve(row.userDataDir);
    if (target.startsWith(`${root}${path.sep}`)) {
      rmSync(target, { recursive: true, force: true });
    }

    this.database.db.delete(profiles).where(eq(profiles.id, id)).run();
    this.logActivity('profile.deleted', null, { profileId: id, name: row.name });
  }

  purgeExpiredTrash(maxAgeHours = 48): number {
    const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const trashed = this.database.db.select().from(profiles).all().filter((p) => p.deletedAt !== null);
    let purged = 0;
    for (const p of trashed) {
      if (p.deletedAt && Date.parse(p.deletedAt) <= cutoff) {
        this.permanentDelete(p.id);
        purged += 1;
      }
    }
    return purged;
  }

  saveObservedFingerprint(id: string, snapshot: ProbeSnapshot): void {
    this.database.db
      .update(profiles)
      .set({
        observedFingerprintJson: JSON.stringify(snapshot),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(profiles.id, id))
      .run();
  }

  private getPendingCookiesPath(userDataDir: string): string {
    return path.join(userDataDir, PENDING_COOKIES_FILENAME);
  }

  private savePendingCookies(userDataDir: string, cookies: NormalizedCookie[]): void {
    mkdirSync(userDataDir, { recursive: true });
    const enc = this.secretBox.encrypt(JSON.stringify(cookies));
    writeFileSync(this.getPendingCookiesPath(userDataDir), enc, 'utf8');
  }

  getPendingCookies(userDataDir: string): NormalizedCookie[] {
    const filePath = this.getPendingCookiesPath(userDataDir);
    if (!existsSync(filePath)) return [];
    try {
      const dec = this.secretBox.decrypt(readFileSync(filePath, 'utf8'));
      return JSON.parse(dec) as NormalizedCookie[];
    } catch {
      return [];
    }
  }

  clearPendingCookies(userDataDir: string): void {
    rmSync(this.getPendingCookiesPath(userDataDir), { force: true });
  }

  importCookies(
    profileId: string,
    rawText: string,
  ): { format: 'json' | 'netscape' | 'unknown'; validCount: number; skipped: Array<{ index: number; reason: string }> } {
    const row = this.database.db.select().from(profiles).where(eq(profiles.id, profileId)).get();
    if (!row) throw new Error(`Profile ${profileId} not found`);

    const parsed = parseCookies(rawText);
    if (parsed.valid.length > 0) {
      const existing = this.getPendingCookies(row.userDataDir);
      const merged = [...existing, ...parsed.valid];
      this.savePendingCookies(row.userDataDir, merged);
      this.logActivity('profile.cookies_imported', profileId, {
        format: parsed.format,
        validCount: parsed.valid.length,
        skippedCount: parsed.skipped.length,
      });
    }

    return {
      format: parsed.format,
      validCount: parsed.valid.length,
      skipped: parsed.skipped,
    };
  }

  clearCookies(profileId: string): void {
    const row = this.database.db.select().from(profiles).where(eq(profiles.id, profileId)).get();
    if (!row) throw new Error(`Profile ${profileId} not found`);
    clearCookiesFiles(row.userDataDir);
    this.clearPendingCookies(row.userDataDir);
    this.logActivity('profile.cookies_cleared', profileId);
  }

  // --- Bulk actions ---

  bulkAssignProxy(ids: string[], proxyId: string | null): void {
    if (ids.length === 0) return;
    this.database.db
      .update(profiles)
      .set({ proxyId, updatedAt: new Date().toISOString() })
      .where(inArray(profiles.id, ids))
      .run();
    this.logActivity('profile.bulk_assign_proxy', null, { count: ids.length, proxyId });
  }

  bulkSetStatus(ids: string[], statusId: string): void {
    if (ids.length === 0) return;
    this.database.db
      .update(profiles)
      .set({ statusId, updatedAt: new Date().toISOString() })
      .where(inArray(profiles.id, ids))
      .run();
    this.logActivity('profile.bulk_set_status', null, { count: ids.length, statusId });
  }

  bulkMoveFolder(ids: string[], folderId: string | null): void {
    if (ids.length === 0) return;
    this.database.db
      .update(profiles)
      .set({ folderId, updatedAt: new Date().toISOString() })
      .where(inArray(profiles.id, ids))
      .run();
    this.logActivity('profile.bulk_move_folder', null, { count: ids.length, folderId });
  }

  bulkAddTags(ids: string[], tagIds: string[]): void {
    for (const profileId of ids) {
      for (const tagId of tagIds) {
        this.database.db.insert(profileTags).values({ profileId, tagId }).onConflictDoNothing().run();
      }
    }
  }

  bulkRemoveTags(ids: string[], tagIds: string[]): void {
    for (const profileId of ids) {
      for (const tagId of tagIds) {
        this.database.db
          .delete(profileTags)
          .where(eq(profileTags.profileId, profileId))
          .run();
      }
    }
  }

  bulkSoftDelete(ids: string[]): void {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    this.database.db
      .update(profiles)
      .set({ deletedAt: now, updatedAt: now })
      .where(inArray(profiles.id, ids))
      .run();
    this.logActivity('profile.bulk_trashed', null, { count: ids.length });
  }

  bulkRestore(ids: string[]): void {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    this.database.db
      .update(profiles)
      .set({ deletedAt: null, updatedAt: now })
      .where(inArray(profiles.id, ids))
      .run();
    this.logActivity('profile.bulk_restored', null, { count: ids.length });
  }

  // --- Organization ---

  createFolder(name: string, parentId: string | null = null): { id: string; name: string } {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Folder name is required');
    const now = new Date().toISOString();
    const id = createId('fld');
    this.database.db
      .insert(folders)
      .values({ id, name: trimmed, parentId, sortOrder: 0, createdAt: now, updatedAt: now })
      .run();
    return { id, name: trimmed };
  }

  renameFolder(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Folder name is required');
    this.database.db
      .update(folders)
      .set({ name: trimmed, updatedAt: new Date().toISOString() })
      .where(eq(folders.id, id))
      .run();
  }

  deleteFolder(id: string): void {
    this.database.db.delete(folders).where(eq(folders.id, id)).run();
  }

  createTag(name: string, color = '#38BDF8'): { id: string; name: string; color: string } {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Tag name is required');
    const existing = this.database.db.select().from(tags).where(eq(tags.name, trimmed)).get();
    if (existing) return existing;
    const id = createId('tag');
    this.database.db
      .insert(tags)
      .values({ id, name: trimmed, color, createdAt: new Date().toISOString() })
      .run();
    return { id, name: trimmed, color };
  }

  renameTag(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Tag name is required');
    this.database.db.update(tags).set({ name: trimmed }).where(eq(tags.id, id)).run();
  }

  deleteTag(id: string): void {
    this.database.db.delete(tags).where(eq(tags.id, id)).run();
  }

  createStatus(name: string, color = '#9A9AA3'): { id: string; name: string; color: string } {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Status name is required');
    const id = createId('sts');
    const count = this.database.db.select().from(statuses).all().length;
    this.database.db
      .insert(statuses)
      .values({
        id,
        name: trimmed,
        color,
        icon: 'circle',
        isDefault: false,
        sortOrder: count,
        createdAt: new Date().toISOString(),
      })
      .run();
    return { id, name: trimmed, color };
  }

  deleteStatus(id: string): void {
    const row = this.database.db.select().from(statuses).where(eq(statuses.id, id)).get();
    if (row?.isDefault) throw new Error('Cannot delete the default status');
    this.database.db.delete(statuses).where(eq(statuses.id, id)).run();
  }

  // --- CSV Import & Data Export ---

  previewCsv(csvText: string, mapping?: import('./csv-import.js').CsvColumnMapping) {
    return previewCsvImport(csvText, mapping);
  }

  importCsvRows(
    rows: ValidatedCsvProfileRow[],
  ): { importedCount: number; createdProxiesCount: number; createdProfileIds: string[] } {
    const folderCache = new Map(
      this.database.db
        .select()
        .from(folders)
        .all()
        .map((f) => [f.name.toLowerCase(), f.id]),
    );
    const tagCache = new Map(
      this.database.db
        .select()
        .from(tags)
        .all()
        .map((t) => [t.name.toLowerCase(), t.id]),
    );
    const proxyCache = new Map(
      this.proxyService
        .list()
        .map((p) => [`${p.protocol}://${p.username ?? ''}@${p.host}:${p.port}`, p.id]),
    );

    let createdProxiesCount = 0;
    const createdProfileIds: string[] = [];

    for (const row of rows) {
      let folderId: string | null = null;
      if (row.folder) {
        const key = row.folder.toLowerCase();
        folderId = folderCache.get(key) ?? null;
        if (!folderId) {
          const createdFolder = this.createFolder(row.folder);
          folderId = createdFolder.id;
          folderCache.set(key, folderId);
        }
      }

      let proxyId: string | null = null;
      if (row.proxy) {
        const pKey = `${row.proxy.protocol}://${row.proxy.username ?? ''}@${row.proxy.host}:${row.proxy.port}`;
        proxyId = proxyCache.get(pKey) ?? null;
        if (!proxyId) {
          const createdProxy = this.proxyService.create({
            label: `${row.proxy.host}:${row.proxy.port}`,
            ...row.proxy,
          });
          proxyId = createdProxy.id;
          proxyCache.set(pKey, proxyId);
          createdProxiesCount += 1;
        }
      }

      const tagIds: string[] = [];
      for (const tagName of row.tags) {
        const tKey = tagName.toLowerCase();
        let tagId = tagCache.get(tKey);
        if (!tagId) {
          const createdTag = this.createTag(tagName);
          tagId = createdTag.id;
          tagCache.set(tKey, tagId);
        }
        tagIds.push(tagId);
      }

      const profile = this.create({
        name: row.name,
        os: row.os,
        osVersion: row.osVersion,
        folderId,
        proxyId,
        notes: row.notes,
        startPages: row.startPages,
        tagIds,
      });
      createdProfileIds.push(profile.id);
    }

    this.logActivity('profile.csv_imported', null, {
      importedCount: createdProfileIds.length,
      createdProxiesCount,
    });

    return {
      importedCount: createdProfileIds.length,
      createdProxiesCount,
      createdProfileIds,
    };
  }

  exportData(format: 'json' | 'csv'): string {
    const all = this.overview({ view: 'all' }).profiles;
    const proxyMap = new Map(this.proxyService.list().map((p) => [p.id, p]));

    if (format === 'json') {
      const payload = {
        exportedAt: new Date().toISOString(),
        profiles: all.map((p) => ({
          id: p.id,
          name: p.name,
          os: p.os,
          osVersion: p.osVersion,
          seed: p.seed,
          engineVersion: p.engineVersion,
          notes: p.notes,
          proxy: p.proxyId
            ? (() => {
                const prx = proxyMap.get(p.proxyId);
                return prx
                  ? { protocol: prx.protocol, host: prx.host, port: prx.port, label: prx.label }
                  : null;
              })()
            : null,
        })),
        proxies: this.proxyService.list().map((p) => ({
          id: p.id,
          label: p.label,
          protocol: p.protocol,
          host: p.host,
          port: p.port,
          country: p.country,
          city: p.city,
          timezone: p.timezone,
        })),
      };
      return JSON.stringify(payload, null, 2);
    }

    const esc = (v: string | number | null | undefined) => {
      const s = String(v ?? '');
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = 'id,name,os,os_version,seed,engine_version,proxy,notes';
    const lines = all.map((p) => {
      const prx = p.proxyId ? proxyMap.get(p.proxyId) : undefined;
      const proxyStr = prx ? `${prx.protocol}://${prx.host}:${prx.port}` : '';
      return [p.id, p.name, p.os, p.osVersion, p.seed, p.engineVersion, proxyStr, p.notes]
        .map(esc)
        .join(',');
    });
    return [header, ...lines].join('\n');
  }
}
