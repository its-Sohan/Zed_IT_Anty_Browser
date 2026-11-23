import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createId } from './ids.js';
import { NodeSqliteClient, createNodeSqliteDrizzle } from './node-sqlite-driver.js';
import { schema, statuses, settings } from './schema.js';

export const DEFAULT_STATUSES = [
  { name: 'Active', color: '#22C55E', icon: 'check-circle', isDefault: true, sortOrder: 0 },
  { name: 'Warming', color: '#F59E0B', icon: 'flame', isDefault: false, sortOrder: 1 },
  { name: 'Paused', color: '#9A9AA3', icon: 'pause-circle', isDefault: false, sortOrder: 2 },
  { name: 'Banned', color: '#F87171', icon: 'ban', isDefault: false, sortOrder: 3 },
] as const;

export const DEFAULT_SETTINGS: Record<string, string> = {
  theme: 'system',
  density: 'comfortable',
  language: 'en',
  telemetryOptIn: 'false',
};

const MIGRATION_V1_SQL = `
CREATE TABLE IF NOT EXISTS _zita_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS statuses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'circle',
  is_default INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#9A9AA3',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS proxies (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  protocol TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL,
  username TEXT,
  password_enc TEXT,
  country TEXT,
  city TEXT,
  timezone TEXT,
  last_check_json TEXT,
  bytes_up_total INTEGER NOT NULL DEFAULT 0,
  bytes_down_total INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
  status_id TEXT REFERENCES statuses(id) ON DELETE SET NULL,
  notes TEXT,
  proxy_id TEXT REFERENCES proxies(id) ON DELETE SET NULL,
  os TEXT NOT NULL,
  os_version TEXT NOT NULL,
  seed INTEGER NOT NULL,
  fingerprint_json TEXT NOT NULL,
  observed_fingerprint_json TEXT,
  engine_version TEXT NOT NULL,
  user_data_dir TEXT NOT NULL,
  start_pages_json TEXT NOT NULL DEFAULT '[]',
  flags_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_started_at TEXT,
  last_stopped_at TEXT,
  launch_count INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_profiles_folder_id ON profiles(folder_id);
CREATE INDEX IF NOT EXISTS idx_profiles_status_id ON profiles(status_id);
CREATE INDEX IF NOT EXISTS idx_profiles_proxy_id ON profiles(proxy_id);
CREATE INDEX IF NOT EXISTS idx_profiles_deleted_at ON profiles(deleted_at);
CREATE INDEX IF NOT EXISTS idx_profiles_updated_at ON profiles(updated_at);

CREATE TABLE IF NOT EXISTS profile_tags (
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (profile_id, tag_id)
);

CREATE TABLE IF NOT EXISTS profile_sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pid INTEGER,
  cdp_port INTEGER,
  bridge_port INTEGER,
  bytes_up INTEGER NOT NULL DEFAULT 0,
  bytes_down INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  exit_code INTEGER,
  error_message TEXT
);

CREATE TABLE IF NOT EXISTS profile_start_pages (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS engine_installations (
  version TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  installed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  meta_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS licenses (
  key_hash TEXT PRIMARY KEY,
  token_enc TEXT NOT NULL,
  plan TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_validated_at TEXT NOT NULL,
  machine_hash TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

/**
 * Opens or initializes the local SQLite database, applies migrations and WAL/FK pragmas,
 * and idempotently seeds default statuses and settings.
 */
export function openDatabase(dbPath: string) {
  if (dbPath !== ':memory:') {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const sqlite = new NodeSqliteClient(dbPath);
  if (dbPath !== ':memory:') {
    sqlite.pragma('journal_mode = WAL');
  }
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  sqlite.exec(MIGRATION_V1_SQL);

  const now = new Date().toISOString();
  sqlite
    .prepare('INSERT OR IGNORE INTO _zita_migrations (version, applied_at) VALUES (?, ?)')
    .run(1, now);

  const db = createNodeSqliteDrizzle(sqlite, { schema });

  const existingStatuses = db.select({ id: statuses.id }).from(statuses).limit(1).all();
  if (existingStatuses.length === 0) {
    db.insert(statuses)
      .values(
        DEFAULT_STATUSES.map((s) => ({
          id: createId('sts'),
          name: s.name,
          color: s.color,
          icon: s.icon,
          isDefault: s.isDefault,
          sortOrder: s.sortOrder,
          createdAt: now,
        })),
      )
      .run();
  }

  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    db.insert(settings)
      .values({ key, value, updatedAt: now })
      .onConflictDoNothing({ target: settings.key })
      .run();
  }

  return {
    db,
    sqlite,
    close: () => {
      sqlite.close();
    },
  };
}

export type ZitaDatabase = ReturnType<typeof openDatabase>;
