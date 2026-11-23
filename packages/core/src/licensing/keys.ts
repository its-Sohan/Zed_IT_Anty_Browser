import { randomBytes } from 'node:crypto';

const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const KEY_REGEX = /^ZITA-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

function computeChecksumChar(body11: string): string {
  let sum = 0;
  for (let i = 0; i < body11.length; i++) {
    const idx = CROCKFORD_ALPHABET.indexOf(body11[i]!);
    if (idx === -1) throw new Error(`Invalid Crockford character: ${body11[i]}`);
    sum = (sum + idx * (i + 1)) % 32;
  }
  return CROCKFORD_ALPHABET[sum]!;
}

/**
 * Normalizes user-entered license keys (uppercases, trims, maps common typo lookalikes I/L->1, O->0).
 */
export function normalizeLicenseKey(raw: string): string {
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
  if (!cleaned.startsWith('ZITA-')) return cleaned;
  const body = cleaned
    .slice(5)
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/-/g, '');
  if (body.length !== 12) return cleaned;
  return `ZITA-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

/**
 * Generates a `ZITA-XXXX-XXXX-XXXX` key with a Crockford Base32 check character in the final slot.
 */
export function generateLicenseKey(): string {
  const bytes = randomBytes(11);
  let body11 = '';
  for (let i = 0; i < 11; i++) {
    body11 += CROCKFORD_ALPHABET[bytes[i]! % 32]!;
  }
  const full12 = body11 + computeChecksumChar(body11);
  return `ZITA-${full12.slice(0, 4)}-${full12.slice(4, 8)}-${full12.slice(8, 12)}`;
}

/**
 * Validates key syntax and final Crockford checksum character before making a network call.
 */
export function validateLicenseKey(raw: string): boolean {
  const normalized = normalizeLicenseKey(raw);
  if (!KEY_REGEX.test(normalized)) return false;
  const body12 = normalized.slice(5).replace(/-/g, '');
  const expected = computeChecksumChar(body12.slice(0, 11));
  return body12[11] === expected;
}

export function maskLicenseKey(raw: string): string {
  const normalized = normalizeLicenseKey(raw);
  if (!KEY_REGEX.test(normalized)) return 'ZITA-****-****-****';
  return `ZITA-****-****-${normalized.slice(-4)}`;
}
