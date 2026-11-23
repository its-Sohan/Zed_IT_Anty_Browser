import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateEs256KeyPair, verifyLicenseToken } from '@zita/core';
import { app, type Env } from './index.js';

function createMockD1(): D1Database {
  const tables = {
    licenses: [] as Array<Record<string, unknown>>,
    activations: [] as Array<Record<string, unknown>>,
    deactivation_log: [] as Array<Record<string, unknown>>,
    admin_audit_log: [] as Array<Record<string, unknown>>,
  };

  return {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          bound = args;
          return stmt;
        },
        async first<T>() {
          if (sql.includes('FROM licenses WHERE key_hash = ?')) {
            return (tables.licenses.find((r) => r.key_hash === bound[0]) ?? null) as T | null;
          }
          if (sql.includes('FROM licenses WHERE id = ?')) {
            return (tables.licenses.find((r) => r.id === bound[0]) ?? null) as T | null;
          }
          if (sql.includes('FROM activations WHERE license_id = ? AND machine_hash = ?')) {
            return (tables.activations.find(
              (r) => r.license_id === bound[0] && r.machine_hash === bound[1],
            ) ?? null) as T | null;
          }
          if (sql.includes('COUNT(*) as cnt FROM deactivation_log')) {
            const cnt = tables.deactivation_log.filter(
              (r) => r.license_id === bound[0] && r.month_key === bound[1],
            ).length;
            return { cnt } as T;
          }
          return null;
        },
        async all<T>() {
          if (sql.includes('FROM activations WHERE license_id = ?')) {
            return {
              results: tables.activations.filter((r) => r.license_id === bound[0]),
              success: true,
              meta: {},
            } as unknown as D1Result<T>;
          }
          if (sql.includes('FROM licenses')) {
            return { results: tables.licenses, success: true, meta: {} } as unknown as D1Result<T>;
          }
          return { results: tables.activations, success: true, meta: {} } as unknown as D1Result<T>;
        },
        async run() {
          if (sql.startsWith('INSERT INTO licenses')) {
            const [id, key_hash, key_masked, plan, max_profiles, max_devices, status, email, expires_at, created_at, updated_at] = bound;
            tables.licenses.push({ id, key_hash, key_masked, plan, max_profiles, max_devices, status, email, expires_at, created_at, updated_at });
          } else if (sql.startsWith('INSERT INTO activations')) {
            const [id, license_id, machine_hash, app_version, os, first_activated_at, last_seen_at] = bound;
            tables.activations.push({ id, license_id, machine_hash, app_version, os, first_activated_at, last_seen_at });
          } else if (sql.startsWith('UPDATE activations SET last_seen_at')) {
            const target = tables.activations.find((r) => r.id === bound.at(-1));
            if (target) target.last_seen_at = bound[0];
          } else if (sql.startsWith('DELETE FROM activations')) {
            tables.activations = tables.activations.filter(
              (r) => !(r.license_id === bound[0] && r.machine_hash === bound[1]),
            );
          } else if (sql.startsWith('INSERT INTO deactivation_log')) {
            const [id, license_id, machine_hash, month_key, created_at] = bound;
            tables.deactivation_log.push({ id, license_id, machine_hash, month_key, created_at });
          } else if (sql.startsWith('INSERT INTO admin_audit_log')) {
            const [id, action, license_id, actor, meta_json, created_at] = bound;
            tables.admin_audit_log.push({ id, action, license_id, actor, meta_json, created_at });
          } else if (sql.startsWith('UPDATE licenses SET status = ?')) {
            const lic = tables.licenses.find((r) => r.id === bound[2]);
            if (lic) lic.status = bound[0];
          } else if (sql.startsWith('UPDATE licenses SET expires_at = ?')) {
            const lic = tables.licenses.find((r) => r.id === bound[2]);
            if (lic) lic.expires_at = bound[0];
          }
          return { success: true, meta: {} } as D1Result;
        },
      };
      return stmt as unknown as D1PreparedStatement;
    },
  } as unknown as D1Database;
}

describe('Cloudflare License Worker', () => {
  it('issues, activates with device limits, verifies ES256 JWT, deactivates up to 2/mo, and revokes', async () => {
    const { publicKeyPem, privateKeyPem } = generateEs256KeyPair();
    const env: Env = {
      DB: createMockD1(),
      ISSUER: 'license.zedit.app',
      JWT_PRIVATE_KEY_PEM: privateKeyPem,
      ADMIN_TOKEN: 'admin_secret_123',
      WEBHOOK_SECRET: 'wh_secret_123',
    };

    // Unauthenticated admin rejected
    const unauth = await app.request('/v1/admin/licenses', { method: 'GET' }, env);
    expect(unauth.status).toBe(401);

    // Webhook payment issues a 1-device starter key
    const whBody = JSON.stringify({ plan: 'starter', days: 30, email: 'op@zedit.app' });
    const whSig = createHmac('sha256', env.WEBHOOK_SECRET).update(whBody).digest('hex');
    const whRes = await app.request(
      '/v1/webhooks/payment',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-zita-signature': whSig },
        body: whBody,
      },
      env,
    );
    expect(whRes.status).toBe(201);
    const issued = (await whRes.json()) as { id: string; key: string };

    // Activate on device 1 -> verify with Node ES256 verifier
    const act1 = await app.request(
      '/v1/activate',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: issued.key, machineHash: 'sha256:dev1', os: 'win32' }),
      },
      env,
    );
    expect(act1.status).toBe(200);
    const { token } = (await act1.json()) as { token: string };
    const claims = verifyLicenseToken(token, publicKeyPem);
    expect(claims.plan).toBe('starter');
    expect(claims.machine).toBe('sha256:dev1');

    // Device 2 exceeds max_devices=1
    const act2 = await app.request(
      '/v1/activate',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: issued.key, machineHash: 'sha256:dev2' }),
      },
      env,
    );
    expect(act2.status).toBe(409);

    // Deactivate device 1 -> device 2 can now activate
    const dea1 = await app.request(
      '/v1/deactivate',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, machineHash: 'sha256:dev1' }),
      },
      env,
    );
    expect(dea1.status).toBe(200);

    const act2Ok = await app.request(
      '/v1/activate',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: issued.key, machineHash: 'sha256:dev2' }),
      },
      env,
    );
    expect(act2Ok.status).toBe(200);

    // Portal lookup
    const lookup = await app.request(`/v1/license/${issued.key}`, { method: 'GET' }, env);
    expect(lookup.status).toBe(200);
    expect(((await lookup.json()) as { plan: string }).plan).toBe('starter');

    // Admin revoke -> validate returns 403 revoked
    const rev = await app.request(
      '/v1/admin/licenses',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${env.ADMIN_TOKEN}`,
        },
        body: JSON.stringify({ action: 'revoke', licenseId: issued.id }),
      },
      env,
    );
    expect(rev.status).toBe(200);

    const val = await app.request(
      '/v1/validate',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: ((await act2Ok.json()) as { token: string }).token, machineHash: 'sha256:dev2' }),
      },
      env,
    );
    expect(val.status).toBe(403);
  });
});
