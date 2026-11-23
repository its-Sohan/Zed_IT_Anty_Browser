export interface NormalizedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  expires?: number;
}

export interface CookieParseResult {
  format: 'json' | 'netscape' | 'unknown';
  valid: NormalizedCookie[];
  skipped: Array<{ index: number; reason: string }>;
}

function normalizeSameSite(raw: unknown): 'Strict' | 'Lax' | 'None' | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim().toLowerCase();
  if (v === 'strict') return 'Strict';
  if (v === 'lax') return 'Lax';
  if (v === 'none' || v === 'no_restriction') return 'None';
  return undefined;
}

function normalizeExpires(raw: unknown): number | undefined {
  if (typeof raw !== 'number' && typeof raw !== 'string') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  // Convert millisecond timestamps to seconds if needed
  return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
}

/**
 * Parses Netscape cookies.txt or JSON cookie arrays into normalized CDP-ready cookies,
 * returning row-level skip reasons for invalid entries.
 */
export function parseCookies(rawText: string): CookieParseResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { format: 'unknown', valid: [], skipped: [] };
  }

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      return {
        format: 'json',
        valid: [],
        skipped: [{ index: 0, reason: err instanceof Error ? err.message : 'Invalid JSON' }],
      };
    }

    const items = Array.isArray(parsed)
      ? parsed
      : typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { cookies?: unknown }).cookies)
        ? (parsed as { cookies: unknown[] }).cookies
        : null;

    if (!items) {
      return {
        format: 'json',
        valid: [],
        skipped: [{ index: 0, reason: 'Expected a JSON array of cookie objects' }],
      };
    }

    const valid: NormalizedCookie[] = [];
    const skipped: Array<{ index: number; reason: string }> = [];

    items.forEach((raw, idx) => {
      if (typeof raw !== 'object' || raw === null) {
        skipped.push({ index: idx, reason: 'Entry is not an object' });
        return;
      }
      const rec = raw as Record<string, unknown>;
      const name = typeof rec.name === 'string' ? rec.name.trim() : '';
      const value = typeof rec.value === 'string' ? rec.value : String(rec.value ?? '');
      const domain = typeof rec.domain === 'string' ? rec.domain.trim() : '';
      const path = typeof rec.path === 'string' && rec.path.trim() ? rec.path.trim() : '/';

      if (!name) {
        skipped.push({ index: idx, reason: 'Missing cookie name' });
        return;
      }
      if (!domain) {
        skipped.push({ index: idx, reason: `Missing domain for "${name}"` });
        return;
      }
      if (!path.startsWith('/')) {
        skipped.push({ index: idx, reason: `Invalid path "${path}" for "${name}"` });
        return;
      }

      const secure = Boolean(rec.secure);
      const sameSite = normalizeSameSite(rec.sameSite);
      if (sameSite === 'None' && !secure) {
        skipped.push({ index: idx, reason: `Cookie "${name}" has SameSite=None without Secure` });
        return;
      }

      valid.push({
        name,
        value,
        domain,
        path,
        secure,
        httpOnly: Boolean(rec.httpOnly),
        sameSite,
        expires: normalizeExpires(rec.expirationDate ?? rec.expires),
      });
    });

    return { format: 'json', valid, skipped };
  }

  // Netscape format
  const lines = rawText.split(/\r?\n/);
  const valid: NormalizedCookie[] = [];
  const skipped: Array<{ index: number; reason: string }> = [];

  lines.forEach((rawLine, lineIdx) => {
    const line = rawLine.trim();
    if (!line) return;

    let httpOnlyPrefix = false;
    let payload = line;
    if (line.startsWith('#HttpOnly_')) {
      httpOnlyPrefix = true;
      payload = line.slice('#HttpOnly_'.length);
    } else if (line.startsWith('#')) {
      return;
    }

    const cols = payload.split('\t');
    if (cols.length < 7) {
      skipped.push({ index: lineIdx + 1, reason: `Expected 7 tab-separated columns, found ${cols.length}` });
      return;
    }

    const [domainRaw, _flag, pathRaw, secureRaw, expiresRaw, nameRaw, ...valueParts] = cols;
    const domain = domainRaw.trim();
    const path = pathRaw.trim() || '/';
    const name = nameRaw.trim();
    const value = valueParts.join('\t');

    if (!domain) {
      skipped.push({ index: lineIdx + 1, reason: 'Missing domain' });
      return;
    }
    if (!name) {
      skipped.push({ index: lineIdx + 1, reason: 'Missing cookie name' });
      return;
    }
    if (!path.startsWith('/')) {
      skipped.push({ index: lineIdx + 1, reason: `Invalid path "${path}"` });
      return;
    }

    valid.push({
      name,
      value,
      domain,
      path,
      secure: secureRaw.trim().toUpperCase() === 'TRUE',
      httpOnly: httpOnlyPrefix,
      expires: normalizeExpires(expiresRaw.trim()),
    });
  });

  return { format: 'netscape', valid, skipped };
}
