import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BLOB_PREFIX = 'v1:';

/**
 * AES-256-GCM symmetric encryption helper for proxy passwords, pending cookies, and cached license tokens.
 */
export class SecretBox {
  private readonly key: Buffer;

  constructor(key: Buffer) {
    if (key.length !== 32) {
      throw new Error(`SecretBox requires a 32-byte key, received ${key.length} bytes.`);
    }
    this.key = Buffer.from(key);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${BLOB_PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
  }

  decrypt(blob: string): string {
    if (!blob.startsWith(BLOB_PREFIX)) {
      throw new Error('Unsupported SecretBox payload format.');
    }
    const parts = blob.slice(BLOB_PREFIX.length).split(':');
    if (parts.length !== 3) {
      throw new Error('Malformed SecretBox payload.');
    }
    const [ivB64, tagB64, ctB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ct = Buffer.from(ctB64, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString('utf8');
  }
}

/**
 * Generates or loads a 32-byte key stored on disk with mode 0600 for environments where
 * OS keyring safeStorage is unavailable (e.g., headless Linux CI/tests).
 */
export function deriveFallbackKey(keyFilePath: string): Buffer {
  if (existsSync(keyFilePath)) {
    const raw = readFileSync(keyFilePath);
    if (raw.length === 32) {
      return raw;
    }
    const hex = raw.toString('utf8').trim();
    if (/^[0-9a-f]{64}$/i.test(hex)) {
      return Buffer.from(hex, 'hex');
    }
  }
  mkdirSync(path.dirname(keyFilePath), { recursive: true });
  const key = randomBytes(32);
  writeFileSync(keyFilePath, key.toString('hex'), { mode: 0o600 });
  try {
    chmodSync(keyFilePath, 0o600);
  } catch {
    // Windows ignores POSIX chmod bits
  }
  return key;
}

/**
 * Redacts license keys, basic auth headers, user:pass URLs, and password tokens from log/diagnostic strings.
 */
export function redactSecrets(input: string): string {
  return input
    .replace(/ZITA-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}/gi, 'ZITA-****-****-****')
    .replace(/(Proxy-Authorization\s*:\s*Basic\s+)[A-Za-z0-9+/=]+/gi, '$1[REDACTED]')
    .replace(/(Authorization\s*:\s*Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[REDACTED]')
    .replace(/([a-z0-9+.-]+:\/\/)([^:\s/@]+):([^@\s/]+)@/gi, '$1[REDACTED]:[REDACTED]@')
    .replace(/(password\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, '$1[REDACTED]');
}
