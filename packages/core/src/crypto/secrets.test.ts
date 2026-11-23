import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { deriveFallbackKey, redactSecrets, SecretBox } from './secrets.js';

describe('SecretBox & redaction', () => {
  const dirs: string[] = [];
  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  it('encrypts and decrypts with AES-256-GCM and rejects tampered blobs', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'zita-sec-'));
    dirs.push(dir);
    const key = deriveFallbackKey(path.join(dir, '.key'));
    expect(deriveFallbackKey(path.join(dir, '.key'))).toEqual(key);

    const box = new SecretBox(key);
    const enc = box.encrypt('super-secret-proxy-pass');
    expect(enc.startsWith('v1:')).toBe(true);
    expect(enc).not.toContain('super-secret');
    expect(box.decrypt(enc)).toBe('super-secret-proxy-pass');

    const tampered = `${enc.slice(0, -2)}AA`;
    expect(() => box.decrypt(tampered)).toThrow();
  });

  it('redacts license keys, basic auth, proxy URLs, and password tokens', () => {
    const raw =
      'key=ZITA-7F3K-9Q2M-XB4T Proxy-Authorization: Basic dXNlcjpwYXNz socks5://bob:hunter2@1.2.3.4:1080 password=mysecret';
    const clean = redactSecrets(raw);
    expect(clean).not.toContain('7F3K');
    expect(clean).not.toContain('dXNlcjpwYXNz');
    expect(clean).not.toContain('hunter2');
    expect(clean).not.toContain('mysecret');
    expect(clean).toContain('ZITA-****-****-****');
    expect(clean).toContain('socks5://[REDACTED]:[REDACTED]@1.2.3.4:1080');
  });
});
