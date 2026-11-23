import { Hono } from 'hono';
import { z } from 'zod';
import { decodeJwtPayloadUnsafe, signEs256Jwt, verifyWebhookHmac } from './crypto.js';
import { generateLicenseKey, maskLicenseKey, normalizeLicenseKey, sha256Hex, validateLicenseKey } from './keys.js';

export interface Env {
  DB: D1Database;
  ISSUER: string;
  JWT_PRIVATE_KEY_PEM: string;
  ADMIN_TOKEN: string;
  WEBHOOK_SECRET: string;
}

const PLAN_CONFIG = {
  starter: { profiles: 10, devices: 1 },
  pro: { profiles: 50, devices: 2 },
  agency: { profiles: 200, devices: 5 },
  enterprise: { profiles: 500, devices: 10 },
} as const;

interface LicenseRow {
  id: string;
  key_hash: string;
  key_masked: string;
  plan: string;
  max_profiles: number;
  max_devices: number;
  status: string;
  email: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

interface ActivationRow {
  id: string;
  license_id: string;
  machine_hash: string;
  app_version: string | null;
  os: string | null;
  first_activated_at: string;
  last_seen_at: string;
}

const ActivateBodySchema = z.object({
  key: z.string().min(1),
  machineHash: z.string().min(8),
  appVersion: z.string().optional(),
  os: z.string().optional(),
});

const TokenBodySchema = z.object({
  token: z.string().min(10),
  machineHash: z.string().min(8),
});

const AdminCreateBodySchema = z.object({
  action: z.enum(['issue', 'extend', 'revoke', 'replace']).default('issue'),
  licenseId: z.string().optional(),
  plan: z.enum(['starter', 'pro', 'agency', 'enterprise']).optional(),
  days: z.number().int().min(1).max(3650).default(30),
  email: z.string().email().optional(),
});

const WebhookPaymentSchema = z.object({
  plan: z.enum(['starter', 'pro', 'agency', 'enterprise']),
  days: z.number().int().min(1).max(3650).default(30),
  email: z.string().email().optional(),
});

async function issueJwtForLicense(
  env: Env,
  lic: LicenseRow,
  machineHash: string,
): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const expSec = Math.floor(Date.parse(lic.expires_at) / 1000);
  return signEs256Jwt(
    {
      iss: env.ISSUER || 'license.zedit.app',
      sub: lic.id,
      aud: 'zed-it-anti-browser',
      key: lic.key_masked,
      plan: lic.plan,
      profiles: lic.max_profiles,
      devices: lic.max_devices,
      features: ['profiles', 'proxies', 'lab', 'cookie-import'],
      machine: machineHash,
      iat: nowSec,
      exp: expSec,
      ver: 1,
    },
    env.JWT_PRIVATE_KEY_PEM,
  );
}

export const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ ok: true, service: 'zita-license-worker' }));

app.post('/v1/activate', async (c) => {
  const parsed = ActivateBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Invalid activation request payload' }, 400);
  }

  const normalizedKey = normalizeLicenseKey(parsed.data.key);
  if (!validateLicenseKey(normalizedKey)) {
    return c.json({ error: 'Invalid license key format or checksum' }, 400);
  }

  const keyHash = await sha256Hex(normalizedKey);
  const lic = await c.env.DB.prepare('SELECT * FROM licenses WHERE key_hash = ?')
    .bind(keyHash)
    .first<LicenseRow>();

  if (!lic) return c.json({ error: 'License key not found' }, 404);
  if (lic.status !== 'active') return c.json({ error: `License is ${lic.status}` }, 403);
  if (Date.parse(lic.expires_at) <= Date.now()) {
    return c.json({ error: 'License has expired' }, 403);
  }

  const existingActs = await c.env.DB.prepare('SELECT * FROM activations WHERE license_id = ?')
    .bind(lic.id)
    .all<ActivationRow>();

  const rows = existingActs.results ?? [];
  const nowIso = new Date().toISOString();
  const alreadyBound = rows.find((r) => r.machine_hash === parsed.data.machineHash);

  if (alreadyBound) {
    await c.env.DB.prepare('UPDATE activations SET last_seen_at = ?, app_version = ?, os = ? WHERE id = ?')
      .bind(nowIso, parsed.data.appVersion ?? null, parsed.data.os ?? null, alreadyBound.id)
      .run();
  } else {
    if (rows.length >= lic.max_devices) {
      return c.json(
        { error: `Device limit reached (${rows.length}/${lic.max_devices}). Deactivate an old device first.` },
        409,
      );
    }
    await c.env.DB.prepare(
      'INSERT INTO activations (id, license_id, machine_hash, app_version, os, first_activated_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(
        `act_${crypto.randomUUID()}`,
        lic.id,
        parsed.data.machineHash,
        parsed.data.appVersion ?? null,
        parsed.data.os ?? null,
        nowIso,
        nowIso,
      )
      .run();
  }

  const token = await issueJwtForLicense(c.env, lic, parsed.data.machineHash);
  return c.json({ token, plan: lic.plan, expiresAt: lic.expires_at });
});

app.post('/v1/validate', async (c) => {
  const parsed = TokenBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Invalid validate request' }, 400);
  }

  let claims: Record<string, unknown>;
  try {
    claims = decodeJwtPayloadUnsafe(parsed.data.token);
  } catch {
    return c.json({ error: 'Malformed token' }, 400);
  }

  const licId = typeof claims.sub === 'string' ? claims.sub : '';
  const lic = await c.env.DB.prepare('SELECT * FROM licenses WHERE id = ?').bind(licId).first<LicenseRow>();
  if (!lic || lic.status !== 'active') {
    return c.json({ revoked: true, error: 'License is inactive or revoked' }, 403);
  }
  if (Date.parse(lic.expires_at) <= Date.now()) {
    return c.json({ error: 'License has expired' }, 403);
  }

  const act = await c.env.DB.prepare('SELECT * FROM activations WHERE license_id = ? AND machine_hash = ?')
    .bind(lic.id, parsed.data.machineHash)
    .first<ActivationRow>();
  if (!act) {
    return c.json({ revoked: true, error: 'Device is no longer activated for this license' }, 403);
  }

  await c.env.DB.prepare('UPDATE activations SET last_seen_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), act.id)
    .run();

  const token = await issueJwtForLicense(c.env, lic, parsed.data.machineHash);
  return c.json({ token, plan: lic.plan, expiresAt: lic.expires_at });
});

app.post('/v1/deactivate', async (c) => {
  const parsed = TokenBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: 'Invalid deactivate request' }, 400);
  }

  let claims: Record<string, unknown>;
  try {
    claims = decodeJwtPayloadUnsafe(parsed.data.token);
  } catch {
    return c.json({ error: 'Malformed token' }, 400);
  }

  const licId = typeof claims.sub === 'string' ? claims.sub : '';
  const now = new Date();
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  const resetCountRow = await c.env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM deactivation_log WHERE license_id = ? AND month_key = ?',
  )
    .bind(licId, monthKey)
    .first<{ cnt: number }>();

  if ((resetCountRow?.cnt ?? 0) >= 2) {
    return c.json({ error: 'Monthly self-service deactivation limit (2/month) reached. Contact support.' }, 429);
  }

  await c.env.DB.prepare('DELETE FROM activations WHERE license_id = ? AND machine_hash = ?')
    .bind(licId, parsed.data.machineHash)
    .run();

  await c.env.DB.prepare(
    'INSERT INTO deactivation_log (id, license_id, machine_hash, month_key, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(`dea_${crypto.randomUUID()}`, licId, parsed.data.machineHash, monthKey, now.toISOString())
    .run();

  return c.json({ deactivated: true });
});

app.get('/v1/license/:key', async (c) => {
  const normalizedKey = normalizeLicenseKey(c.req.param('key'));
  if (!validateLicenseKey(normalizedKey)) {
    return c.json({ error: 'Invalid license key' }, 400);
  }
  const keyHash = await sha256Hex(normalizedKey);
  const lic = await c.env.DB.prepare('SELECT * FROM licenses WHERE key_hash = ?').bind(keyHash).first<LicenseRow>();
  if (!lic) return c.json({ error: 'License not found' }, 404);

  const acts = await c.env.DB.prepare('SELECT id, os, first_activated_at, last_seen_at FROM activations WHERE license_id = ?')
    .bind(lic.id)
    .all();

  return c.json({
    id: lic.id,
    keyMasked: lic.key_masked,
    plan: lic.plan,
    status: lic.status,
    maxProfiles: lic.max_profiles,
    maxDevices: lic.max_devices,
    expiresAt: lic.expires_at,
    activations: acts.results ?? [],
  });
});

app.post('/v1/webhooks/payment', async (c) => {
  const rawBody = await c.req.text();
  const sig = c.req.header('x-zita-signature') ?? '';
  if (!(await verifyWebhookHmac(rawBody, sig, c.env.WEBHOOK_SECRET))) {
    return c.json({ error: 'Invalid webhook signature' }, 401);
  }

  const parsed = WebhookPaymentSchema.safeParse(JSON.parse(rawBody));
  if (!parsed.success) return c.json({ error: 'Invalid webhook payload' }, 400);

  const plan = parsed.data.plan;
  const limits = PLAN_CONFIG[plan];
  const key = generateLicenseKey();
  const keyHash = await sha256Hex(key);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + parsed.data.days * 86400_000).toISOString();
  const id = `lic_${crypto.randomUUID()}`;

  await c.env.DB.prepare(
    'INSERT INTO licenses (id, key_hash, key_masked, plan, max_profiles, max_devices, status, email, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(
      id,
      keyHash,
      maskLicenseKey(key),
      plan,
      limits.profiles,
      limits.devices,
      'active',
      parsed.data.email ?? null,
      expiresAt,
      now.toISOString(),
      now.toISOString(),
    )
    .run();

  return c.json({ id, key, plan, expiresAt }, 201);
});

app.use('/v1/admin/*', async (c, next) => {
  const auth = c.req.header('authorization') ?? '';
  if (auth !== `Bearer ${c.env.ADMIN_TOKEN}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  await next();
});

app.post('/v1/admin/licenses', async (c) => {
  const parsed = AdminCreateBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'Invalid admin payload' }, 400);

  const now = new Date();
  const nowIso = now.toISOString();

  if (parsed.data.action === 'issue') {
    const plan = parsed.data.plan ?? 'pro';
    const limits = PLAN_CONFIG[plan];
    const key = generateLicenseKey();
    const keyHash = await sha256Hex(key);
    const id = `lic_${crypto.randomUUID()}`;
    const expiresAt = new Date(now.getTime() + parsed.data.days * 86400_000).toISOString();

    await c.env.DB.prepare(
      'INSERT INTO licenses (id, key_hash, key_masked, plan, max_profiles, max_devices, status, email, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(id, keyHash, maskLicenseKey(key), plan, limits.profiles, limits.devices, 'active', parsed.data.email ?? null, expiresAt, nowIso, nowIso)
      .run();

    await c.env.DB.prepare('INSERT INTO admin_audit_log (id, action, license_id, actor, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(`aud_${crypto.randomUUID()}`, 'license.issued', id, 'admin', JSON.stringify({ plan, days: parsed.data.days }), nowIso)
      .run();

    return c.json({ id, key, plan, expiresAt }, 201);
  }

  if (!parsed.data.licenseId) return c.json({ error: 'licenseId is required' }, 400);

  if (parsed.data.action === 'revoke') {
    await c.env.DB.prepare('UPDATE licenses SET status = ?, updated_at = ? WHERE id = ?')
      .bind('revoked', nowIso, parsed.data.licenseId)
      .run();
    await c.env.DB.prepare('INSERT INTO admin_audit_log (id, action, license_id, actor, meta_json, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(`aud_${crypto.randomUUID()}`, 'license.revoked', parsed.data.licenseId, 'admin', null, nowIso)
      .run();
    return c.json({ revoked: true });
  }

  if (parsed.data.action === 'extend') {
    const lic = await c.env.DB.prepare('SELECT * FROM licenses WHERE id = ?').bind(parsed.data.licenseId).first<LicenseRow>();
    if (!lic) return c.json({ error: 'License not found' }, 404);
    const baseMs = Math.max(Date.now(), Date.parse(lic.expires_at));
    const nextExp = new Date(baseMs + parsed.data.days * 86400_000).toISOString();
    await c.env.DB.prepare('UPDATE licenses SET expires_at = ?, updated_at = ? WHERE id = ?')
      .bind(nextExp, nowIso, lic.id)
      .run();
    return c.json({ id: lic.id, expiresAt: nextExp });
  }

  return c.json({ error: 'Unsupported action' }, 400);
});

app.get('/v1/admin/licenses', async (c) => {
  const rows = await c.env.DB.prepare('SELECT id, key_masked, plan, max_profiles, max_devices, status, email, expires_at, created_at FROM licenses ORDER BY created_at DESC LIMIT 200').all();
  return c.json({ licenses: rows.results ?? [] });
});

app.get('/v1/admin/activations', async (c) => {
  const rows = await c.env.DB.prepare('SELECT id, license_id, machine_hash, app_version, os, first_activated_at, last_seen_at FROM activations ORDER BY last_seen_at DESC LIMIT 200').all();
  return c.json({ activations: rows.results ?? [] });
});

export default app;
