import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SecretBox } from '../crypto/secrets.js';
import { openDatabase } from '../db/index.js';
import { generateEs256KeyPair, signLicenseToken, verifyLicenseToken } from './jwt.js';
import { generateLicenseKey, maskLicenseKey, validateLicenseKey } from './keys.js';
import { LicenseService } from './service.js';

describe('Licensing keys, ES256 JWT, trial, clock tamper & offline grace', () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it('generates and validates Crockford Base32 keys and catches typos', () => {
    const key = generateLicenseKey();
    expect(key).toMatch(/^ZITA-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(validateLicenseKey(key)).toBe(true);

    // Flip last checksum char
    const badLast = key.endsWith('0') ? `${key.slice(0, -1)}1` : `${key.slice(0, -1)}0`;
    expect(validateLicenseKey(badLast)).toBe(false);
    expect(maskLicenseKey(key)).toBe(`ZITA-****-****-${key.slice(-4)}`);
  });

  it('enforces AUP, single trial per device, ES256 activation, offline grace, and clock tamper', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'zita-lic-'));
    dirs.push(dir);
    const db = openDatabase(path.join(dir, 'data', 'app.db'));
    const secretBox = new SecretBox(Buffer.alloc(32, 9));
    const { publicKeyPem, privateKeyPem } = generateEs256KeyPair();

    let clockMs = Date.UTC(2026, 10, 23, 12, 0, 0);
    const service = new LicenseService({
      database: db,
      storageRoot: dir,
      secretBox,
      publicKeyPem,
      now: () => clockMs,
      fetchImpl: async () => {
        const token = signLicenseToken(
          {
            iss: 'license.zedit.app',
            sub: 'lic_test',
            aud: 'zed-it-anti-browser',
            key: 'ZITA-****-****-TEST',
            plan: 'pro',
            profiles: 50,
            devices: 2,
            features: ['profiles', 'proxies', 'lab', 'cookie-import'],
            machine: service.getMachineHash(),
            iat: Math.floor(clockMs / 1000),
            exp: Math.floor((clockMs + 30 * 86400_000) / 1000),
            ver: 1,
          },
          privateKeyPem,
        );
        return new Response(JSON.stringify({ token }), { status: 200 });
      },
    });

    try {
      expect(service.getState().status).toBe('unactivated');
      expect(() => service.startTrial(false)).toThrow(/Acceptable Use Policy/);

      const trial = service.startTrial(true);
      expect(trial.status).toBe('trial');
      expect(trial.maxProfiles).toBe(5);
      expect(trial.canLaunch).toBe(true);
      expect(() => service.startTrial(true)).toThrow(/already been used/);

      const key = generateLicenseKey();
      const activated = await service.activate({ key, aupAccepted: true, serverUrl: 'https://mock.local' });
      expect(activated.status).toBe('active');
      expect(activated.plan).toBe('pro');
      expect(activated.maxProfiles).toBe(50);
      expect(activated.offlineDaysRemaining).toBe(14);

      // Advance 15 days without revalidation -> offline grace expired -> read-only
      clockMs += 15 * 86400_000;
      const expired = service.getState();
      expect(expired.status).toBe('expired');
      expect(expired.canLaunch).toBe(false);

      // Roll clock backward -> clock_tampered
      clockMs -= 2 * 86400_000;
      expect(service.getState().status).toBe('clock_tampered');
      expect(service.getState().canLaunch).toBe(false);
    } finally {
      db.close();
    }
  });

  it('rejects tampered ES256 tokens', () => {
    const { publicKeyPem, privateKeyPem } = generateEs256KeyPair();
    const token = signLicenseToken(
      {
        iss: 'license.zedit.app',
        sub: 'lic_1',
        aud: 'zed-it-anti-browser',
        key: 'ZITA-****-****-AAAA',
        plan: 'starter',
        profiles: 10,
        devices: 1,
        features: ['profiles'],
        machine: 'sha256:abc',
        iat: 1700000000,
        exp: 1800000000,
        ver: 1,
      },
      privateKeyPem,
    );
    expect(verifyLicenseToken(token, publicKeyPem).plan).toBe('starter');
    const [h, p, s] = token.split('.');
    const badP = Buffer.from(JSON.stringify({ plan: 'enterprise' })).toString('base64url');
    expect(() => verifyLicenseToken(`${h}.${badP}.${s}`, publicKeyPem)).toThrow();
  });
});
