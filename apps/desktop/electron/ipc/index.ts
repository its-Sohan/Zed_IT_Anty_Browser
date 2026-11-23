import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { app, ipcMain, shell } from 'electron';
import { z } from 'zod';
import {
  activityLog,
  desc,
  generateFingerprint,
  HARDWARE_TABLES,
  ProxyCheckFailedError,
  redactSecrets,
  settings,
  type LicenseService,
  type ProfileLauncher,
  type ProfilesService,
  type ProxyService,
  type ZitaDatabase,
} from '@zita/core';
import {
  AppSettingsSchema,
  BrandSchema,
  BulkProfileActionInputSchema,
  CopyProfileInputSchema,
  CreateProfileInputSchema,
  CreateProxyInputSchema,
  EngineManifestSchema,
  FingerprintConfigSchema,
  IPC_CHANNELS,
  LaunchProfileInputSchema,
  OpenExternalInputSchema,
  PlatformSchema,
  ProfileListFilterSchema,
  ProxyProtocolSchema,
  UpdateProfileInputSchema,
  UpdateProxyInputSchema,
  UpdateSettingsInputSchema,
  type ActivityLogItem,
  type AppInfo,
  type AppSettings,
  type EnginePlatform,
  type EngineStatus,
  type IpcResponse,
} from '@zita/shared';

export interface IpcContext {
  database: ZitaDatabase;
  storageRoot: string;
  repoRoot: string;
  proxyService: ProxyService;
  profilesService: ProfilesService;
  launcher: ProfileLauncher;
  licenseService: LicenseService;
}

function ok<T>(data: T): IpcResponse<T> {
  return { ok: true, data };
}

function fail<T>(code: string, message: string): IpcResponse<T> {
  return { ok: false, error: { code, message } };
}

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export function resolveEngineStatus(ctx: Pick<IpcContext, 'storageRoot' | 'repoRoot'>): EngineStatus {
  const enginePlatform: EnginePlatform = process.platform === 'win32' ? 'win-x64' : 'linux-x64';
  const manifestCandidates = [
    path.join(process.resourcesPath ?? '', 'engines', 'manifest.json'),
    path.join(ctx.repoRoot, 'resources', 'engines', 'manifest.json'),
  ];

  const manifestPath = manifestCandidates.find((p) => p && existsSync(p));
  if (!manifestPath) {
    return {
      pinnedVersion: '150.0.7871.186',
      platform: enginePlatform,
      installed: false,
      executablePath: null,
      sha256: null,
      license: 'BSD-3-Clause',
      upstreamRepo: 'https://github.com/adryfish/fingerprint-chromium',
    };
  }

  const manifest = EngineManifestSchema.parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
  const artifact = manifest.artifacts[enginePlatform];

  const installRoots = [
    path.join(ctx.storageRoot, 'engines', manifest.version, enginePlatform),
    path.join(process.resourcesPath ?? '', 'engines', manifest.version, enginePlatform),
    path.join(ctx.repoRoot, 'resources', 'engines', manifest.version, enginePlatform),
  ];

  let executablePath: string | null = null;
  for (const root of installRoots) {
    const markerPath = path.join(root, '.zita-engine.json');
    if (existsSync(markerPath)) {
      try {
        const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as { executable?: string };
        if (marker.executable) {
          const candidate = path.join(root, marker.executable);
          if (existsSync(candidate)) {
            executablePath = candidate;
            break;
          }
        }
      } catch {
        // Ignore malformed marker
      }
    }
  }

  return {
    pinnedVersion: manifest.version,
    platform: enginePlatform,
    installed: executablePath !== null,
    executablePath,
    sha256: artifact?.sha256 ?? null,
    license: manifest.license,
    upstreamRepo: manifest.upstreamRepo,
  };
}

function readSettingsFromDb(database: ZitaDatabase): AppSettings {
  const rows = database.db.select().from(settings).all();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return AppSettingsSchema.parse({
    theme: map.get('theme') ?? 'system',
    density: map.get('density') ?? 'comfortable',
    language: map.get('language') ?? 'en',
    telemetryOptIn: map.get('telemetryOptIn') === 'true',
  });
}

/**
 * Registers all Zod-validated IPC handlers for the desktop application.
 */
export function registerIpcHandlers(ctx: IpcContext): void {
  ipcMain.handle(IPC_CHANNELS.APP_GET_INFO, (): IpcResponse<AppInfo> => {
    try {
      const engine = resolveEngineStatus(ctx);
      return ok({
        name: app.getName(),
        version: app.getVersion(),
        electronVersion: process.versions.electron ?? 'unknown',
        nodeVersion: process.versions.node,
        platform: process.platform,
        arch: process.arch,
        storageRoot: ctx.storageRoot,
        engineVersion: engine.pinnedVersion,
        engineInstalled: engine.installed,
        engineExecutablePath: engine.executablePath,
      });
    } catch (err) {
      return fail('APP_INFO_ERROR', errMsg(err, 'Failed to load app info'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.APP_EXPORT_DIAGNOSTICS, () => {
    try {
      const engine = resolveEngineStatus(ctx);
      const lic = ctx.licenseService.getState();
      const act = ctx.database.db
        .select()
        .from(activityLog)
        .orderBy(desc(activityLog.createdAt))
        .limit(50)
        .all();
      const raw = JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          app: {
            version: app.getVersion(),
            electron: process.versions.electron,
            platform: process.platform,
            arch: process.arch,
          },
          engine: {
            version: engine.pinnedVersion,
            installed: engine.installed,
            sha256: engine.sha256,
          },
          license: {
            status: lic.status,
            plan: lic.plan,
            offlineDaysRemaining: lic.offlineDaysRemaining,
            machineHashPrefix: lic.machineHashPrefix,
          },
          recentActivity: act,
        },
        null,
        2,
      );
      return ok({
        filename: `zita-diagnostics-${Date.now()}.json`,
        content: redactSecrets(raw),
      });
    } catch (err) {
      return fail('DIAGNOSTICS_ERROR', errMsg(err, 'Failed to export diagnostics'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.ENGINE_STATUS, (): IpcResponse<EngineStatus> => {
    try {
      return ok(resolveEngineStatus(ctx));
    } catch (err) {
      return fail('ENGINE_STATUS_ERROR', errMsg(err, 'Failed to inspect engine'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET_ALL, (): IpcResponse<AppSettings> => {
    try {
      return ok(readSettingsFromDb(ctx.database));
    } catch (err) {
      return fail('SETTINGS_READ_ERROR', errMsg(err, 'Failed to read settings'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_e, rawInput: unknown): IpcResponse<AppSettings> => {
    const parsed = UpdateSettingsInputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid settings update');
    }
    try {
      const now = new Date().toISOString();
      const updates: Array<[string, string]> = [];
      if (parsed.data.theme !== undefined) updates.push(['theme', parsed.data.theme]);
      if (parsed.data.density !== undefined) updates.push(['density', parsed.data.density]);
      if (parsed.data.language !== undefined) updates.push(['language', parsed.data.language]);
      if (parsed.data.telemetryOptIn !== undefined) {
        updates.push(['telemetryOptIn', String(parsed.data.telemetryOptIn)]);
      }
      for (const [key, value] of updates) {
        ctx.database.db
          .insert(settings)
          .values({ key, value, updatedAt: now })
          .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: now } })
          .run();
      }
      return ok(readSettingsFromDb(ctx.database));
    } catch (err) {
      return fail('SETTINGS_WRITE_ERROR', errMsg(err, 'Failed to save settings'));
    }
  });

  // --- Profiles ---

  ipcMain.handle(IPC_CHANNELS.PROFILES_OVERVIEW, (_e, rawFilter: unknown) => {
    const parsed = ProfileListFilterSchema.safeParse(rawFilter ?? {});
    if (!parsed.success) {
      return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid profile filter');
    }
    try {
      return ok(ctx.profilesService.overview(parsed.data, ctx.launcher.getRunningIds()));
    } catch (err) {
      return fail('PROFILES_LIST_ERROR', errMsg(err, 'Failed to load profiles'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_GET, (_e, rawId: unknown) => {
    const id = z.string().min(1).safeParse(rawId);
    if (!id.success) return fail('VALIDATION_ERROR', 'Profile id is required');
    const detail = ctx.profilesService.getById(id.data, ctx.launcher.getRunningIds());
    return detail ? ok(detail) : fail('NOT_FOUND', `Profile ${id.data} not found`);
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_CREATE, (_e, rawInput: unknown) => {
    const parsed = CreateProfileInputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid profile data');
    }
    try {
      ctx.licenseService.assertCanCreateProfile(ctx.profilesService.countStoredProfiles());
      return ok(ctx.profilesService.create(parsed.data));
    } catch (err) {
      return fail('PROFILES_CREATE_ERROR', errMsg(err, 'Failed to create profile'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_QUICK_CREATE, (_e, rawOs: unknown) => {
    const osParsed = PlatformSchema.optional().safeParse(rawOs);
    try {
      ctx.licenseService.assertCanCreateProfile(ctx.profilesService.countStoredProfiles());
      return ok(ctx.profilesService.quickCreate(osParsed.success ? osParsed.data : 'windows'));
    } catch (err) {
      return fail('PROFILES_CREATE_ERROR', errMsg(err, 'Failed to quick-create profile'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_UPDATE, (_e, rawInput: unknown) => {
    const parsed = UpdateProfileInputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid profile update');
    }
    try {
      const { id, ...rest } = parsed.data;
      return ok(ctx.profilesService.update(id, rest));
    } catch (err) {
      return fail('PROFILES_UPDATE_ERROR', errMsg(err, 'Failed to update profile'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_COPY, (_e, rawInput: unknown) => {
    const parsed = CopyProfileInputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid copy input');
    }
    try {
      ctx.licenseService.assertCanCreateProfile(ctx.profilesService.countStoredProfiles());
      return ok(
        ctx.profilesService.copy(parsed.data.id, {
          name: parsed.data.name,
          randomizeSeed: parsed.data.randomizeSeed,
          copyCookies: parsed.data.copyCookies,
        }),
      );
    } catch (err) {
      return fail('PROFILES_COPY_ERROR', errMsg(err, 'Failed to copy profile'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_SOFT_DELETE, (_e, rawId: unknown) => {
    const id = z.string().min(1).safeParse(rawId);
    if (!id.success) return fail('VALIDATION_ERROR', 'Profile id is required');
    try {
      if (ctx.launcher.isRunning(id.data)) {
        return fail('PROFILE_RUNNING', 'Stop the running profile before moving it to trash.');
      }
      ctx.profilesService.softDelete(id.data);
      return ok({ deleted: true });
    } catch (err) {
      return fail('PROFILES_DELETE_ERROR', errMsg(err, 'Failed to trash profile'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_RESTORE, (_e, rawId: unknown) => {
    const id = z.string().min(1).safeParse(rawId);
    if (!id.success) return fail('VALIDATION_ERROR', 'Profile id is required');
    try {
      ctx.profilesService.restore(id.data);
      return ok({ restored: true });
    } catch (err) {
      return fail('PROFILES_RESTORE_ERROR', errMsg(err, 'Failed to restore profile'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_PERMANENT_DELETE, (_e, rawId: unknown) => {
    const id = z.string().min(1).safeParse(rawId);
    if (!id.success) return fail('VALIDATION_ERROR', 'Profile id is required');
    try {
      if (ctx.launcher.isRunning(id.data)) {
        return fail('PROFILE_RUNNING', 'Stop the profile before permanently deleting it.');
      }
      ctx.profilesService.permanentDelete(id.data);
      return ok({ deleted: true });
    } catch (err) {
      return fail('PROFILES_DELETE_ERROR', errMsg(err, 'Failed to permanently delete profile'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_LAUNCH, async (_e, rawInput: unknown) => {
    const parsed = LaunchProfileInputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid launch request');
    }
    try {
      const res = await ctx.launcher.launch(parsed.data.id, {
        skipProxyCheck: parsed.data.skipProxyCheck,
        allowWithoutProxy: parsed.data.allowWithoutProxy,
        captureReadback: parsed.data.captureReadback,
      });
      return ok(res);
    } catch (err) {
      if (err instanceof ProxyCheckFailedError) {
        return fail('PROXY_CHECK_FAILED', `${err.message}: ${err.details}`);
      }
      return fail('PROFILE_LAUNCH_ERROR', errMsg(err, 'Failed to launch profile'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_STOP, async (_e, rawId: unknown) => {
    const id = z.string().min(1).safeParse(rawId);
    if (!id.success) return fail('VALIDATION_ERROR', 'Profile id is required');
    try {
      await ctx.launcher.stop(id.data);
      return ok({ stopped: true });
    } catch (err) {
      return fail('PROFILE_STOP_ERROR', errMsg(err, 'Failed to stop profile'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_BULK_ACTION, async (_e, rawInput: unknown) => {
    const parsed = BulkProfileActionInputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid bulk action');
    }
    try {
      const data = parsed.data;
      if (data.action === 'launch') {
        let count = 0;
        for (const id of data.ids) {
          await ctx.launcher.launch(id, { skipProxyCheck: true });
          count += 1;
        }
        return ok({ affected: count });
      }
      if (data.action === 'stop') {
        await Promise.all(data.ids.map((id) => ctx.launcher.stop(id)));
        return ok({ affected: data.ids.length });
      }
      if (data.action === 'assign_proxy') {
        ctx.profilesService.bulkAssignProxy(data.ids, data.proxyId);
      } else if (data.action === 'set_status') {
        ctx.profilesService.bulkSetStatus(data.ids, data.statusId);
      } else if (data.action === 'move_folder') {
        ctx.profilesService.bulkMoveFolder(data.ids, data.folderId);
      } else if (data.action === 'add_tags') {
        ctx.profilesService.bulkAddTags(data.ids, data.tagIds);
      } else if (data.action === 'soft_delete') {
        ctx.profilesService.bulkSoftDelete(data.ids);
      } else if (data.action === 'restore') {
        ctx.profilesService.bulkRestore(data.ids);
      }
      return ok({ affected: data.ids.length });
    } catch (err) {
      return fail('BULK_ACTION_ERROR', errMsg(err, 'Bulk action failed'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_IMPORT_COOKIES, (_e, rawInput: unknown) => {
    const parsed = z
      .object({ profileId: z.string().min(1), rawText: z.string() })
      .safeParse(rawInput ?? {});
    if (!parsed.success) return fail('VALIDATION_ERROR', 'Invalid cookie import payload');
    try {
      return ok(ctx.profilesService.importCookies(parsed.data.profileId, parsed.data.rawText));
    } catch (err) {
      return fail('COOKIE_IMPORT_ERROR', errMsg(err, 'Failed to import cookies'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_CLEAR_COOKIES, (_e, rawId: unknown) => {
    const id = z.string().min(1).safeParse(rawId);
    if (!id.success) return fail('VALIDATION_ERROR', 'Profile id is required');
    try {
      if (ctx.launcher.isRunning(id.data)) {
        return fail('PROFILE_RUNNING', 'Stop the profile before clearing cookies');
      }
      ctx.profilesService.clearCookies(id.data);
      return ok({ cleared: true });
    } catch (err) {
      return fail('COOKIE_CLEAR_ERROR', errMsg(err, 'Failed to clear cookies'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_CSV_PREVIEW, (_e, rawInput: unknown) => {
    const parsed = z
      .object({ csvText: z.string(), mapping: z.record(z.string()).optional() })
      .safeParse(rawInput ?? {});
    if (!parsed.success) return fail('VALIDATION_ERROR', 'Invalid CSV preview input');
    try {
      return ok(
        ctx.profilesService.previewCsv(
          parsed.data.csvText,
          parsed.data.mapping as { name: string } | undefined,
        ),
      );
    } catch (err) {
      return fail('CSV_PREVIEW_ERROR', errMsg(err, 'Failed to parse CSV'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_CSV_IMPORT, (_e, rawInput: unknown) => {
    const parsed = z
      .object({ csvText: z.string(), mapping: z.record(z.string()).optional() })
      .safeParse(rawInput ?? {});
    if (!parsed.success) return fail('VALIDATION_ERROR', 'Invalid CSV import input');
    try {
      const preview = ctx.profilesService.previewCsv(
        parsed.data.csvText,
        parsed.data.mapping as { name: string } | undefined,
      );
      const lic = ctx.licenseService.getState();
      const current = ctx.profilesService.countStoredProfiles();
      if (current + preview.validRows.length > lic.maxProfiles) {
        return fail(
          'PLAN_LIMIT',
          `Import of ${preview.validRows.length} profiles would exceed your ${lic.plan ?? 'trial'} limit (${current}/${lic.maxProfiles}).`,
        );
      }
      const res = ctx.profilesService.importCsvRows(preview.validRows);
      return ok({
        importedCount: res.importedCount,
        createdProxiesCount: res.createdProxiesCount,
        errors: preview.errors,
      });
    } catch (err) {
      return fail('CSV_IMPORT_ERROR', errMsg(err, 'Failed to import CSV'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROFILES_EXPORT, (_e, rawFormat: unknown) => {
    const parsed = z.enum(['json', 'csv']).safeParse(rawFormat);
    if (!parsed.success) return fail('VALIDATION_ERROR', 'Format must be json or csv');
    try {
      const content = ctx.profilesService.exportData(parsed.data);
      return ok({
        filename: `zita-profiles-export-${Date.now()}.${parsed.data}`,
        content,
      });
    } catch (err) {
      return fail('EXPORT_ERROR', errMsg(err, 'Failed to export data'));
    }
  });

  // --- Organization ---

  ipcMain.handle(IPC_CHANNELS.FOLDERS_CREATE, (_e, rawInput: unknown) => {
    const parsed = z.object({ name: z.string().min(1), parentId: z.string().nullable().optional() }).safeParse(rawInput);
    if (!parsed.success) return fail('VALIDATION_ERROR', 'Folder name is required');
    try {
      return ok(ctx.profilesService.createFolder(parsed.data.name, parsed.data.parentId ?? null));
    } catch (err) {
      return fail('FOLDER_ERROR', errMsg(err, 'Failed to create folder'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.FOLDERS_RENAME, (_e, rawInput: unknown) => {
    const parsed = z.object({ id: z.string().min(1), name: z.string().min(1) }).safeParse(rawInput);
    if (!parsed.success) return fail('VALIDATION_ERROR', 'Invalid folder rename');
    try {
      ctx.profilesService.renameFolder(parsed.data.id, parsed.data.name);
      return ok({ renamed: true });
    } catch (err) {
      return fail('FOLDER_ERROR', errMsg(err, 'Failed to rename folder'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.FOLDERS_DELETE, (_e, rawId: unknown) => {
    const id = z.string().min(1).safeParse(rawId);
    if (!id.success) return fail('VALIDATION_ERROR', 'Folder id is required');
    ctx.profilesService.deleteFolder(id.data);
    return ok({ deleted: true });
  });

  ipcMain.handle(IPC_CHANNELS.TAGS_CREATE, (_e, rawInput: unknown) => {
    const parsed = z.object({ name: z.string().min(1), color: z.string().optional() }).safeParse(rawInput);
    if (!parsed.success) return fail('VALIDATION_ERROR', 'Tag name is required');
    try {
      return ok(ctx.profilesService.createTag(parsed.data.name, parsed.data.color));
    } catch (err) {
      return fail('TAG_ERROR', errMsg(err, 'Failed to create tag'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.TAGS_RENAME, (_e, rawInput: unknown) => {
    const parsed = z.object({ id: z.string().min(1), name: z.string().min(1) }).safeParse(rawInput);
    if (!parsed.success) return fail('VALIDATION_ERROR', 'Invalid tag rename');
    ctx.profilesService.renameTag(parsed.data.id, parsed.data.name);
    return ok({ renamed: true });
  });

  ipcMain.handle(IPC_CHANNELS.TAGS_DELETE, (_e, rawId: unknown) => {
    const id = z.string().min(1).safeParse(rawId);
    if (!id.success) return fail('VALIDATION_ERROR', 'Tag id is required');
    ctx.profilesService.deleteTag(id.data);
    return ok({ deleted: true });
  });

  ipcMain.handle(IPC_CHANNELS.STATUSES_CREATE, (_e, rawInput: unknown) => {
    const parsed = z.object({ name: z.string().min(1), color: z.string().optional() }).safeParse(rawInput);
    if (!parsed.success) return fail('VALIDATION_ERROR', 'Status name is required');
    return ok(ctx.profilesService.createStatus(parsed.data.name, parsed.data.color));
  });

  ipcMain.handle(IPC_CHANNELS.STATUSES_DELETE, (_e, rawId: unknown) => {
    const id = z.string().min(1).safeParse(rawId);
    if (!id.success) return fail('VALIDATION_ERROR', 'Status id is required');
    try {
      ctx.profilesService.deleteStatus(id.data);
      return ok({ deleted: true });
    } catch (err) {
      return fail('STATUS_ERROR', errMsg(err, 'Failed to delete status'));
    }
  });

  // --- Proxies ---

  ipcMain.handle(IPC_CHANNELS.PROXIES_LIST, () => {
    try {
      return ok(ctx.proxyService.list());
    } catch (err) {
      return fail('PROXIES_LIST_ERROR', errMsg(err, 'Failed to load proxies'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROXIES_CREATE, (_e, rawInput: unknown) => {
    const parsed = CreateProxyInputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid proxy data');
    }
    try {
      return ok(ctx.proxyService.create(parsed.data));
    } catch (err) {
      return fail('PROXY_CREATE_ERROR', errMsg(err, 'Failed to create proxy'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROXIES_UPDATE, (_e, rawInput: unknown) => {
    const parsed = UpdateProxyInputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid proxy update');
    }
    try {
      const { id, ...rest } = parsed.data;
      return ok(ctx.proxyService.update(id, rest));
    } catch (err) {
      return fail('PROXY_UPDATE_ERROR', errMsg(err, 'Failed to update proxy'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROXIES_DELETE, (_e, rawId: unknown) => {
    const id = z.string().min(1).safeParse(rawId);
    if (!id.success) return fail('VALIDATION_ERROR', 'Proxy id is required');
    ctx.proxyService.delete(id.data);
    return ok({ deleted: true });
  });

  ipcMain.handle(IPC_CHANNELS.PROXIES_DUPLICATE, (_e, rawId: unknown) => {
    const id = z.string().min(1).safeParse(rawId);
    if (!id.success) return fail('VALIDATION_ERROR', 'Proxy id is required');
    try {
      return ok(ctx.proxyService.duplicate(id.data));
    } catch (err) {
      return fail('PROXY_DUPLICATE_ERROR', errMsg(err, 'Failed to duplicate proxy'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROXIES_BULK_ADD, (_e, rawInput: unknown) => {
    const parsed = z
      .object({ rawText: z.string(), defaultProtocol: ProxyProtocolSchema.optional() })
      .safeParse(rawInput ?? {});
    if (!parsed.success) return fail('VALIDATION_ERROR', 'Invalid bulk proxy input');
    try {
      const res = ctx.proxyService.bulkCreate(parsed.data.rawText, parsed.data.defaultProtocol);
      return ok({
        createdCount: res.created.length,
        duplicatesCount: res.duplicates.length,
        errors: res.errors,
      });
    } catch (err) {
      return fail('PROXY_BULK_ERROR', errMsg(err, 'Failed to bulk import proxies'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROXIES_TEST, async (_e, rawId: unknown) => {
    const id = z.string().min(1).safeParse(rawId);
    if (!id.success) return fail('VALIDATION_ERROR', 'Proxy id is required');
    try {
      return ok(await ctx.proxyService.test(id.data));
    } catch (err) {
      return fail('PROXY_TEST_ERROR', errMsg(err, 'Proxy test failed'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.PROXIES_REVEAL_PASSWORD, (_e, rawId: unknown) => {
    const id = z.string().min(1).safeParse(rawId);
    if (!id.success) return fail('VALIDATION_ERROR', 'Proxy id is required');
    try {
      return ok({ password: ctx.proxyService.revealPassword(id.data) });
    } catch (err) {
      return fail('PROXY_REVEAL_ERROR', errMsg(err, 'Failed to reveal password'));
    }
  });

  // --- Fingerprint & Lab ---

  ipcMain.handle(IPC_CHANNELS.FINGERPRINT_GENERATE, (_e, rawInput: unknown) => {
    const parsed = z
      .object({
        os: PlatformSchema,
        osVersion: z.string().optional(),
        seed: z.number().int().min(1).max(2147483647).optional(),
        brand: BrandSchema.optional(),
        timezone: z.string().nullable().optional(),
        locale: z.string().nullable().optional(),
      })
      .safeParse(rawInput ?? {});
    if (!parsed.success) return fail('VALIDATION_ERROR', 'Invalid fingerprint generation options');
    return ok(generateFingerprint(parsed.data));
  });

  ipcMain.handle(IPC_CHANNELS.FINGERPRINT_HARDWARE_PRESETS, () => ok(HARDWARE_TABLES));

  ipcMain.handle(IPC_CHANNELS.LAB_RUN_CHECK, async (_e, rawInput: unknown) => {
    const parsed = z
      .object({
        profileId: z.string().optional(),
        fingerprint: FingerprintConfigSchema.optional(),
        proxyId: z.string().nullable().optional(),
      })
      .safeParse(rawInput ?? {});
    if (!parsed.success) return fail('VALIDATION_ERROR', 'Invalid lab check parameters');
    try {
      return ok(await ctx.launcher.runLabCheck(parsed.data));
    } catch (err) {
      return fail('LAB_CHECK_ERROR', errMsg(err, 'Fingerprint Lab check failed'));
    }
  });

  // --- Licensing ---

  ipcMain.handle(IPC_CHANNELS.LICENSE_GET_STATE, () => {
    try {
      return ok(ctx.licenseService.getState());
    } catch (err) {
      return fail('LICENSE_ERROR', errMsg(err, 'Failed to read license state'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.LICENSE_START_TRIAL, (_e, rawAup: unknown) => {
    try {
      return ok(ctx.licenseService.startTrial(Boolean(rawAup)));
    } catch (err) {
      return fail('LICENSE_TRIAL_ERROR', errMsg(err, 'Failed to start trial'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.LICENSE_ACTIVATE, async (_e, rawInput: unknown) => {
    const parsed = z
      .object({ key: z.string().min(1), aupAccepted: z.boolean(), serverUrl: z.string().url().optional() })
      .safeParse(rawInput ?? {});
    if (!parsed.success) {
      return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid activation payload');
    }
    try {
      return ok(
        await ctx.licenseService.activate({
          ...parsed.data,
          appVersion: app.getVersion(),
        }),
      );
    } catch (err) {
      return fail('LICENSE_ACTIVATE_ERROR', errMsg(err, 'Activation failed'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.LICENSE_REVALIDATE, async (_e, rawUrl: unknown) => {
    const serverUrl = typeof rawUrl === 'string' && rawUrl ? rawUrl : undefined;
    try {
      return ok(await ctx.licenseService.revalidate(serverUrl));
    } catch (err) {
      return fail('LICENSE_VALIDATE_ERROR', errMsg(err, 'Revalidation failed'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.LICENSE_DEACTIVATE, async (_e, rawUrl: unknown) => {
    const serverUrl = typeof rawUrl === 'string' && rawUrl ? rawUrl : undefined;
    try {
      return ok(await ctx.licenseService.deactivate(serverUrl));
    } catch (err) {
      return fail('LICENSE_DEACTIVATE_ERROR', errMsg(err, 'Deactivation failed'));
    }
  });

  // --- Activity & External URL ---

  ipcMain.handle(IPC_CHANNELS.ACTIVITY_LIST, (_e, rawLimit: unknown): IpcResponse<ActivityLogItem[]> => {
    const limit = typeof rawLimit === 'number' && rawLimit > 0 && rawLimit <= 500 ? rawLimit : 100;
    try {
      const rows = ctx.database.db
        .select()
        .from(activityLog)
        .orderBy(desc(activityLog.createdAt))
        .limit(limit)
        .all();
      return ok(rows);
    } catch (err) {
      return fail('ACTIVITY_LIST_ERROR', errMsg(err, 'Failed to load activity'));
    }
  });

  ipcMain.handle(IPC_CHANNELS.WINDOW_OPEN_EXTERNAL, async (_e, rawUrl: unknown) => {
    const parsed = OpenExternalInputSchema.safeParse({ url: rawUrl });
    if (!parsed.success) {
      return fail('INVALID_EXTERNAL_URL', parsed.error.issues[0]?.message ?? 'Invalid URL');
    }
    try {
      await shell.openExternal(parsed.data.url);
      return ok({ opened: true });
    } catch (err) {
      return fail('OPEN_EXTERNAL_ERROR', errMsg(err, 'Failed to open URL'));
    }
  });
}
