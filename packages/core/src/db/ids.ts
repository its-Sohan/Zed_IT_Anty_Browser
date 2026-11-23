import { randomBytes } from 'node:crypto';

export type IdPrefix = 'prf' | 'prx' | 'fld' | 'tag' | 'sts' | 'ses' | 'act' | 'spg';

/**
 * Generates a prefixed RFC 9562 UUIDv7 identifier (`<prefix>_<uuidv7>`).
 */
export function createId(prefix: IdPrefix): string {
  const bytes = randomBytes(16);
  const nowMs = BigInt(Date.now());

  bytes[0] = Number((nowMs >> 40n) & 0xffn);
  bytes[1] = Number((nowMs >> 32n) & 0xffn);
  bytes[2] = Number((nowMs >> 24n) & 0xffn);
  bytes[3] = Number((nowMs >> 16n) & 0xffn);
  bytes[4] = Number((nowMs >> 8n) & 0xffn);
  bytes[5] = Number(nowMs & 0xffn);

  // Version 7 (0111)
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // Variant 10xx
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  return `${prefix}_${uuid}`;
}
