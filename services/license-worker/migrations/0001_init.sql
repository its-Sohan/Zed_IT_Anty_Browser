CREATE TABLE IF NOT EXISTS licenses (
  id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL UNIQUE,
  key_masked TEXT NOT NULL,
  plan TEXT NOT NULL,
  max_profiles INTEGER NOT NULL,
  max_devices INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  email TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS activations (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  machine_hash TEXT NOT NULL,
  app_version TEXT,
  os TEXT,
  first_activated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE(license_id, machine_hash)
);

CREATE TABLE IF NOT EXISTS deactivation_log (
  id TEXT PRIMARY KEY,
  license_id TEXT NOT NULL REFERENCES licenses(id) ON DELETE CASCADE,
  machine_hash TEXT NOT NULL,
  month_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deactivation_license_month ON deactivation_log(license_id, month_key);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  license_id TEXT,
  actor TEXT NOT NULL,
  meta_json TEXT,
  created_at TEXT NOT NULL
);
