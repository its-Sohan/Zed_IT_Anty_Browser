const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const KEY_REGEX = /^ZITA-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

function checksumChar(body11: string): string {
  let sum = 0;
  for (let i = 0; i < body11.length; i++) {
    const idx = CROCKFORD.indexOf(body11[i]!);
    if (idx === -1) throw new Error(`Invalid character ${body11[i]}`);
    sum = (sum + idx * (i + 1)) % 32;
  }
  return CROCKFORD[sum]!;
}

export function normalizeLicenseKey(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (!cleaned.startsWith('ZITA-')) return cleaned;
  const body = cleaned.slice(5).replace(/[IL]/g, '1').replace(/O/g, '0').replace(/-/g, '');
  if (body.length !== 12) return cleaned;
  return `ZITA-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

export function validateLicenseKey(raw: string): boolean {
  const normalized = normalizeLicenseKey(raw);
  if (!KEY_REGEX.test(normalized)) return false;
  const body12 = normalized.slice(5).replace(/-/g, '');
  return body12[11] === checksumChar(body12.slice(0, 11));
}

export function generateLicenseKey(): string {
  const bytes = new Uint8Array(11);
  crypto.getRandomValues(bytes);
  let body11 = '';
  for (let i = 0; i < 11; i++) {
    body11 += CROCKFORD[bytes[i]! % 32]!;
  }
  const full12 = body11 + checksumChar(body11);
  return `ZITA-${full12.slice(0, 4)}-${full12.slice(4, 8)}-${full12.slice(8, 12)}`;
}

export function maskLicenseKey(raw: string): string {
  const n = normalizeLicenseKey(raw);
  return KEY_REGEX.test(n) ? `ZITA-****-****-${n.slice(-4)}` : 'ZITA-****-****-****';
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
