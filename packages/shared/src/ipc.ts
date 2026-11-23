import { z } from 'zod';
import { EnginePlatformSchema } from './engine.js';
import {
  BrandSchema,
  FingerprintConfigSchema,
  PlatformSchema,
  ProbeSnapshotSchema,
  type FingerprintConfig,
  type ProbeSnapshot,
} from './fingerprint.js';
import { IPC_CHANNELS } from './ipc-channels.js';
import { ProxyCheckResultSchema, ProxyProtocolSchema } from './proxy.js';

export { IPC_CHANNELS };

export const IpcErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  logPath: z.string().optional(),
});
export type IpcError = z.infer<typeof IpcErrorSchema>;

export type IpcResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: IpcError };

export const ThemePreferenceSchema = z.enum(['system', 'dark', 'light']);
export type ThemePreference = z.infer<typeof ThemePreferenceSchema>;

export const DensityPreferenceSchema = z.enum(['compact', 'comfortable']);
export type DensityPreference = z.infer<typeof DensityPreferenceSchema>;

export const LanguagePreferenceSchema = z.enum(['en', 'bn']);
export type LanguagePreference = z.infer<typeof LanguagePreferenceSchema>;

export const AppSettingsSchema = z.object({
  theme: ThemePreferenceSchema.default('system'),
  density: DensityPreferenceSchema.default('comfortable'),
  language: LanguagePreferenceSchema.default('en'),
  telemetryOptIn: z.boolean().default(false),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;

export const UpdateSettingsInputSchema = AppSettingsSchema.partial();
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsInputSchema>;

export const AppInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
  electronVersion: z.string(),
  nodeVersion: z.string(),
  platform: z.string(),
  arch: z.string(),
  storageRoot: z.string(),
  engineVersion: z.string(),
  engineInstalled: z.boolean(),
  engineExecutablePath: z.string().nullable(),
});
export type AppInfo = z.infer<typeof AppInfoSchema>;

export const ProfileLifecycleStateSchema = z.enum([
  'stopped',
  'starting',
  'running',
  'stopping',
  'error',
]);
export type ProfileLifecycleState = z.infer<typeof ProfileLifecycleStateSchema>;

export interface ProfileStatusEvent {
  profileId: string;
  state: ProfileLifecycleState;
  error?: string;
}

export const ProfileListFilterSchema = z.object({
  folderId: z.string().optional(),
  statusId: z.string().optional(),
  tagId: z.string().optional(),
  search: z.string().optional(),
  view: z.enum(['all', 'running', 'trash']).default('all'),
});
export type ProfileListFilter = z.infer<typeof ProfileListFilterSchema>;

export const FolderSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
  sortOrder: z.number(),
  profileCount: z.number(),
});
export type FolderSummary = z.infer<typeof FolderSummarySchema>;

export const StatusSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  icon: z.string(),
  isDefault: z.boolean(),
  profileCount: z.number(),
});
export type StatusSummary = z.infer<typeof StatusSummarySchema>;

export const TagSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  profileCount: z.number(),
});
export type TagSummary = z.infer<typeof TagSummarySchema>;

export const ProfileSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  folderId: z.string().nullable(),
  statusId: z.string().nullable(),
  proxyId: z.string().nullable(),
  os: PlatformSchema,
  osVersion: z.string(),
  seed: z.number(),
  engineVersion: z.string(),
  notes: z.string().nullable(),
  lastStartedAt: z.string().nullable(),
  lastStoppedAt: z.string().nullable(),
  launchCount: z.number(),
  deletedAt: z.string().nullable(),
  running: z.boolean(),
  tagIds: z.array(z.string()),
});
export type ProfileSummary = z.infer<typeof ProfileSummarySchema>;

export const ProfileDetailSchema = ProfileSummarySchema.extend({
  fingerprint: FingerprintConfigSchema,
  observedFingerprint: ProbeSnapshotSchema.nullable(),
  userDataDir: z.string(),
  startPages: z.array(z.string()),
  extraFlags: z.array(z.string()),
  pendingCookieCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProfileDetail = z.infer<typeof ProfileDetailSchema>;

export const ProfilesOverviewSchema = z.object({
  profiles: z.array(ProfileSummarySchema),
  counts: z.object({
    all: z.number(),
    running: z.number(),
    trash: z.number(),
  }),
  folders: z.array(FolderSummarySchema),
  statuses: z.array(StatusSummarySchema),
  tags: z.array(TagSummarySchema),
});
export type ProfilesOverview = z.infer<typeof ProfilesOverviewSchema>;

export const CreateProfileInputSchema = z.object({
  name: z.string().min(1).max(120),
  folderId: z.string().nullable().optional(),
  statusId: z.string().nullable().optional(),
  proxyId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  os: PlatformSchema.optional(),
  osVersion: z.string().optional(),
  seed: z.number().int().min(1).max(2147483647).optional(),
  fingerprint: FingerprintConfigSchema.optional(),
  startPages: z.array(z.string()).optional(),
  extraFlags: z.array(z.string()).optional(),
  tagIds: z.array(z.string()).optional(),
});
export type CreateProfileInputDto = z.infer<typeof CreateProfileInputSchema>;

export const UpdateProfileInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(120).optional(),
  folderId: z.string().nullable().optional(),
  statusId: z.string().nullable().optional(),
  proxyId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  fingerprint: FingerprintConfigSchema.optional(),
  startPages: z.array(z.string()).optional(),
  extraFlags: z.array(z.string()).optional(),
  tagIds: z.array(z.string()).optional(),
});
export type UpdateProfileInputDto = z.infer<typeof UpdateProfileInputSchema>;

export const CopyProfileInputSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  randomizeSeed: z.boolean().default(true),
  copyCookies: z.boolean().default(false),
});

export const LaunchProfileInputSchema = z.object({
  id: z.string(),
  skipProxyCheck: z.boolean().optional(),
  allowWithoutProxy: z.boolean().optional(),
  captureReadback: z.boolean().optional(),
});

export const BulkProfileActionInputSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('launch'), ids: z.array(z.string()).min(1) }),
  z.object({ action: z.literal('stop'), ids: z.array(z.string()).min(1) }),
  z.object({ action: z.literal('assign_proxy'), ids: z.array(z.string()).min(1), proxyId: z.string().nullable() }),
  z.object({ action: z.literal('set_status'), ids: z.array(z.string()).min(1), statusId: z.string() }),
  z.object({ action: z.literal('move_folder'), ids: z.array(z.string()).min(1), folderId: z.string().nullable() }),
  z.object({ action: z.literal('add_tags'), ids: z.array(z.string()).min(1), tagIds: z.array(z.string()).min(1) }),
  z.object({ action: z.literal('soft_delete'), ids: z.array(z.string()).min(1) }),
  z.object({ action: z.literal('restore'), ids: z.array(z.string()).min(1) }),
]);
export type BulkProfileActionInput = z.infer<typeof BulkProfileActionInputSchema>;

export const ProxySummarySchema = z.object({
  id: z.string(),
  label: z.string(),
  protocol: ProxyProtocolSchema,
  host: z.string(),
  port: z.number(),
  username: z.string().nullable(),
  hasAuth: z.boolean(),
  country: z.string().nullable(),
  city: z.string().nullable(),
  timezone: z.string().nullable(),
  lastCheck: ProxyCheckResultSchema.nullable().optional(),
  bytesUpTotal: z.number(),
  bytesDownTotal: z.number(),
  assignedCount: z.number(),
  updatedAt: z.string(),
});
export type ProxySummary = z.infer<typeof ProxySummarySchema>;

export const CreateProxyInputSchema = z.object({
  label: z.string().min(1).max(120),
  protocol: ProxyProtocolSchema,
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
});

export const UpdateProxyInputSchema = CreateProxyInputSchema.partial().extend({
  id: z.string(),
});

export const ActivityLogItemSchema = z.object({
  id: z.string(),
  profileId: z.string().nullable(),
  action: z.string(),
  metaJson: z.string().nullable(),
  createdAt: z.string(),
});
export type ActivityLogItem = z.infer<typeof ActivityLogItemSchema>;

export const EngineStatusSchema = z.object({
  pinnedVersion: z.string(),
  platform: EnginePlatformSchema,
  installed: z.boolean(),
  executablePath: z.string().nullable(),
  sha256: z.string().nullable(),
  license: z.string(),
  upstreamRepo: z.string(),
});
export type EngineStatus = z.infer<typeof EngineStatusSchema>;

export interface LabDiffRowDto {
  signal: string;
  expected: string;
  observed: string;
  status: 'pass' | 'warn' | 'fail' | 'unsupported';
  explanation: string;
}

export interface LabCheckResult {
  expected: FingerprintConfig;
  observed: ProbeSnapshot;
  diff: LabDiffRowDto[];
  capturedAt: string;
  launchDurationMs: number;
}

export const LicensePlanSchema = z.enum(['trial', 'starter', 'pro', 'agency', 'enterprise']);
export type LicensePlan = z.infer<typeof LicensePlanSchema>;

export const LicenseStatusSchema = z.enum([
  'unactivated',
  'trial',
  'active',
  'expired',
  'revoked',
  'clock_tampered',
]);
export type LicenseStatus = z.infer<typeof LicenseStatusSchema>;

export interface LicenseState {
  status: LicenseStatus;
  plan: LicensePlan | null;
  maxProfiles: number;
  maxDevices: number;
  expiresAt: string | null;
  offlineDaysRemaining: number;
  keyMasked: string | null;
  canLaunch: boolean;
  aupAccepted: boolean;
  machineHashPrefix: string;
}

export const OpenExternalInputSchema = z.object({
  url: z
    .string()
    .url()
    .refine((val) => val.startsWith('https://'), {
      message: 'Only https:// URLs may be opened externally',
    }),
});
export type OpenExternalInput = z.infer<typeof OpenExternalInputSchema>;

export interface CsvPreviewDto {
  headers: string[];
  totalRows: number;
  validRows: Array<{
    rowNumber: number;
    name: string;
    os: 'windows' | 'macos' | 'linux';
    osVersion?: string;
    proxy?: { protocol: 'http' | 'https' | 'socks5'; host: string; port: number; username?: string; password?: string };
    tags: string[];
    folder?: string;
    notes?: string;
    startPages: string[];
  }>;
  errors: Array<{ row: number; message: string }>;
}

export interface HardwareTablePresetDto {
  osVersions: string[];
  resolutions: Array<{ width: number; height: number }>;
  hardware: Array<{ cpuCores: number; memoryGb: number; gpuVendor: string; gpuRenderer: string }>;
}

export interface ZitaApi {
  app: {
    getInfo: () => Promise<IpcResponse<AppInfo>>;
    exportDiagnostics: () => Promise<IpcResponse<{ filename: string; content: string }>>;
  };
  settings: {
    getAll: () => Promise<IpcResponse<AppSettings>>;
    update: (input: UpdateSettingsInput) => Promise<IpcResponse<AppSettings>>;
  };
  profiles: {
    overview: (filter?: Partial<ProfileListFilter>) => Promise<IpcResponse<ProfilesOverview>>;
    get: (id: string) => Promise<IpcResponse<ProfileDetail>>;
    create: (input: CreateProfileInputDto) => Promise<IpcResponse<ProfileDetail>>;
    quickCreate: (os?: 'windows' | 'macos' | 'linux') => Promise<IpcResponse<ProfileDetail>>;
    update: (input: UpdateProfileInputDto) => Promise<IpcResponse<ProfileDetail>>;
    copy: (input: { id: string; name?: string; randomizeSeed?: boolean; copyCookies?: boolean }) => Promise<IpcResponse<ProfileDetail>>;
    softDelete: (id: string) => Promise<IpcResponse<{ deleted: boolean }>>;
    restore: (id: string) => Promise<IpcResponse<{ restored: boolean }>>;
    permanentDelete: (id: string) => Promise<IpcResponse<{ deleted: boolean }>>;
    launch: (input: { id: string; skipProxyCheck?: boolean; allowWithoutProxy?: boolean; captureReadback?: boolean }) => Promise<IpcResponse<{ sessionId: string; cdpPort: number; bridgePort: number | null }>>;
    stop: (id: string) => Promise<IpcResponse<{ stopped: boolean }>>;
    bulkAction: (input: BulkProfileActionInput) => Promise<IpcResponse<{ affected: number }>>;
    importCookies: (input: { profileId: string; rawText: string }) => Promise<IpcResponse<{ format: string; validCount: number; skipped: Array<{ index: number; reason: string }> }>>;
    clearCookies: (profileId: string) => Promise<IpcResponse<{ cleared: boolean }>>;
    csvPreview: (input: { csvText: string; mapping?: Record<string, string> }) => Promise<IpcResponse<CsvPreviewDto>>;
    csvImport: (input: { csvText: string; mapping?: Record<string, string> }) => Promise<IpcResponse<{ importedCount: number; createdProxiesCount: number; errors: Array<{ row: number; message: string }> }>>;
    exportData: (format: 'json' | 'csv') => Promise<IpcResponse<{ filename: string; content: string }>>;
  };
  org: {
    createFolder: (input: { name: string; parentId?: string | null }) => Promise<IpcResponse<{ id: string; name: string }>>;
    renameFolder: (input: { id: string; name: string }) => Promise<IpcResponse<{ renamed: boolean }>>;
    deleteFolder: (id: string) => Promise<IpcResponse<{ deleted: boolean }>>;
    createTag: (input: { name: string; color?: string }) => Promise<IpcResponse<{ id: string; name: string; color: string }>>;
    renameTag: (input: { id: string; name: string }) => Promise<IpcResponse<{ renamed: boolean }>>;
    deleteTag: (id: string) => Promise<IpcResponse<{ deleted: boolean }>>;
    createStatus: (input: { name: string; color?: string }) => Promise<IpcResponse<{ id: string; name: string; color: string }>>;
    deleteStatus: (id: string) => Promise<IpcResponse<{ deleted: boolean }>>;
  };
  proxies: {
    list: () => Promise<IpcResponse<ProxySummary[]>>;
    create: (input: z.infer<typeof CreateProxyInputSchema>) => Promise<IpcResponse<ProxySummary>>;
    update: (input: z.infer<typeof UpdateProxyInputSchema>) => Promise<IpcResponse<ProxySummary>>;
    delete: (id: string) => Promise<IpcResponse<{ deleted: boolean }>>;
    duplicate: (id: string) => Promise<IpcResponse<ProxySummary>>;
    bulkAdd: (input: { rawText: string; defaultProtocol?: 'http' | 'https' | 'socks5' }) => Promise<IpcResponse<{ createdCount: number; duplicatesCount: number; errors: Array<{ line: number; raw: string; reason: string }> }>>;
    test: (id: string) => Promise<IpcResponse<z.infer<typeof ProxyCheckResultSchema>>>;
    revealPassword: (id: string) => Promise<IpcResponse<{ password: string | null }>>;
  };
  fingerprint: {
    generate: (input: { os: z.infer<typeof PlatformSchema>; osVersion?: string; seed?: number; brand?: z.infer<typeof BrandSchema>; timezone?: string | null; locale?: string | null }) => Promise<IpcResponse<z.infer<typeof FingerprintConfigSchema>>>;
    hardwarePresets: () => Promise<IpcResponse<Record<'windows' | 'macos' | 'linux', HardwareTablePresetDto>>>;
  };
  lab: {
    runCheck: (input: { profileId?: string; fingerprint?: z.infer<typeof FingerprintConfigSchema>; proxyId?: string | null }) => Promise<IpcResponse<LabCheckResult>>;
  };
  license: {
    getState: () => Promise<IpcResponse<LicenseState>>;
    startTrial: (aupAccepted: boolean) => Promise<IpcResponse<LicenseState>>;
    activate: (input: { key: string; aupAccepted: boolean; serverUrl?: string }) => Promise<IpcResponse<LicenseState>>;
    revalidate: (serverUrl?: string) => Promise<IpcResponse<LicenseState>>;
    deactivate: (serverUrl?: string) => Promise<IpcResponse<LicenseState>>;
  };
  activity: {
    list: (limit?: number) => Promise<IpcResponse<ActivityLogItem[]>>;
  };
  engine: {
    status: () => Promise<IpcResponse<EngineStatus>>;
  };
  window: {
    openExternal: (url: string) => Promise<IpcResponse<{ opened: boolean }>>;
  };
  events: {
    onProfileStatusChanged: (cb: (event: ProfileStatusEvent) => void) => () => void;
  };
}
