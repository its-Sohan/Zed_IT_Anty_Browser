import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { SecretBox } from '../crypto/secrets.js';
import { openDatabase } from '../db/index.js';
import { generateEs256KeyPair, signLicenseToken, verifyLicenseToken } from './jwt.js';
import { generateLicenseKey, maskLicenseKey, validateLicenseKey } from './keys.js';
import { LicenseService } from './service.js';

describe('Licensing removed: app is fully unlocked', () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it('generates and validates Crockford Base32 keys and catches typos', () => {
    const key = generateLicenseKey();
    expect(key).toMatch(/^ZITA-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(validateLicenseKey(key)).toBe(true);
    const badLast = key.endsWith('0') ? `${key.slice(0, -1)}1` : `${key.slice(0, -1)}0`;
    expect(validateLicenseKey(badLast)).toBe(false);
    expect(maskLicenseKey(key)).toBe(`ZITA-****-****-${key.slice(-4)}`);
  });

  it('always returns an active unlimited state and never blocks create/launch', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'zita-lic-'));
    dirs.push(dir);
    const db = openDatabase(path.join(dir, 'data', 'app.db'));
    const secretBox = new SecretBox(Buffer.alloc(32, 9));
    const { publicKeyPem } = generateEs256KeyPair();
    const service = new LicenseService({ database: db, storageRoot: dir, secretBox, publicKeyPem });
    try {
      const state = service.getState();
      expect(state.status).toBe('active');
      expect(state.canLaunch).toBe(true);
      expect(state.maxProfiles).toBeGreaterThan(1000);
      expect(() => service.assertCanCreateProfile(100000)).not.toThrow();
      expect(service.assertCanLaunch().allowed).toBe(true);
      expect(service.startTrial(false).status).toBe('active');
      expect((await service.activate({ key: 'ZITA-0000-0000-0000', aupAccepted: false })).status).toBe('active');
      expect((await service.revalidate()).status).toBe('active');
      expect((await service.deactivate()).status).toBe('active');
    } finally {
      db.close();
    }
  });

  it('rejects tampered ES256 tokens', () => {
    const { publicKeyPem, privateKeyPem } = generateEs256KeyPair();
    const token = signLicenseToken(
      { iss: 'license.zedit.app', sub: 'lic_1', aud: 'zed-it-anti-browser', key: 'ZITA-****-****-AAAA', plan: 'starter', profiles: 10, devices: 1, features: ['profiles'], machine: 'sha256:abc', iat: 1700000000, exp: 1800000000, ver: 1 },
      privateKeyPem,
    );
    expect(verifyLicenseToken(token, publicKeyPem).plan).toBe('starter');
    const [h, , s] = token.split('.');
    const badP = Buffer.from(JSON.stringify({ plan: 'enterprise' })).toString('base64url');
    expect(() => verifyLicenseToken(`${h}.${badP}.${s}`, publicKeyPem)).toThrow();
  });
});
