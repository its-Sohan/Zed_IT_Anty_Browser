import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

export const folders = sqliteTable('folders', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parentId: text('parent_id').references((): AnySQLiteColumn => folders.id, {
    onDelete: 'set null',
  }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const statuses = sqliteTable('statuses', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  icon: text('icon').notNull().default('circle'),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color').notNull().default('#9A9AA3'),
  createdAt: text('created_at').notNull(),
});

export const proxies = sqliteTable('proxies', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  protocol: text('protocol').notNull(),
  host: text('host').notNull(),
  port: integer('port').notNull(),
  username: text('username'),
  passwordEnc: text('password_enc'),
  country: text('country'),
  city: text('city'),
  timezone: text('timezone'),
  lastCheckJson: text('last_check_json'),
  bytesUpTotal: integer('bytes_up_total').notNull().default(0),
  bytesDownTotal: integer('bytes_down_total').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const profiles = sqliteTable(
  'profiles',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    folderId: text('folder_id').references(() => folders.id, { onDelete: 'set null' }),
    statusId: text('status_id').references(() => statuses.id, { onDelete: 'set null' }),
    notes: text('notes'),
    proxyId: text('proxy_id').references(() => proxies.id, { onDelete: 'set null' }),
    os: text('os').notNull(),
    osVersion: text('os_version').notNull(),
    seed: integer('seed').notNull(),
    fingerprintJson: text('fingerprint_json').notNull(),
    observedFingerprintJson: text('observed_fingerprint_json'),
    engineVersion: text('engine_version').notNull(),
    userDataDir: text('user_data_dir').notNull(),
    startPagesJson: text('start_pages_json').notNull().default('[]'),
    flagsJson: text('flags_json').notNull().default('[]'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    lastStartedAt: text('last_started_at'),
    lastStoppedAt: text('last_stopped_at'),
    launchCount: integer('launch_count').notNull().default(0),
    deletedAt: text('deleted_at'),
  },
  (table) => [
    index('idx_profiles_folder_id').on(table.folderId),
    index('idx_profiles_status_id').on(table.statusId),
    index('idx_profiles_proxy_id').on(table.proxyId),
    index('idx_profiles_deleted_at').on(table.deletedAt),
    index('idx_profiles_updated_at').on(table.updatedAt),
  ],
);

export const profileTags = sqliteTable(
  'profile_tags',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => [primaryKey({ columns: [table.profileId, table.tagId] })],
);

export const profileSessions = sqliteTable('profile_sessions', {
  id: text('id').primaryKey(),
  profileId: text('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  pid: integer('pid'),
  cdpPort: integer('cdp_port'),
  bridgePort: integer('bridge_port'),
  bytesUp: integer('bytes_up').notNull().default(0),
  bytesDown: integer('bytes_down').notNull().default(0),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at'),
  exitCode: integer('exit_code'),
  errorMessage: text('error_message'),
});

export const profileStartPages = sqliteTable('profile_start_pages', {
  id: text('id').primaryKey(),
  profileId: text('profile_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const engineInstallations = sqliteTable('engine_installations', {
  version: text('version').primaryKey(),
  platform: text('platform').notNull(),
  path: text('path').notNull(),
  sha256: text('sha256').notNull(),
  installedAt: text('installed_at').notNull(),
});

export const activityLog = sqliteTable('activity_log', {
  id: text('id').primaryKey(),
  profileId: text('profile_id').references(() => profiles.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  metaJson: text('meta_json'),
  createdAt: text('created_at').notNull(),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const licenses = sqliteTable('licenses', {
  keyHash: text('key_hash').primaryKey(),
  tokenEnc: text('token_enc').notNull(),
  plan: text('plan').notNull(),
  expiresAt: text('expires_at').notNull(),
  lastValidatedAt: text('last_validated_at').notNull(),
  machineHash: text('machine_hash').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const schema = {
  folders,
  statuses,
  tags,
  proxies,
  profiles,
  profileTags,
  profileSessions,
  profileStartPages,
  engineInstallations,
  activityLog,
  settings,
  licenses,
};
