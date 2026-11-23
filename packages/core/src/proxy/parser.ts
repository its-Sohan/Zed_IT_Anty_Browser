import type { ProxyConfig, ProxyProtocol } from '@zita/shared';

export interface ParsedProxyEntry extends ProxyConfig {
  label: string;
}

export interface BulkProxyParseResult {
  valid: ParsedProxyEntry[];
  duplicates: Array<{ line: number; raw: string }>;
  errors: Array<{ line: number; raw: string; reason: string }>;
}

function parseSingleLine(line: string, defaultProtocol: ProxyProtocol): ParsedProxyEntry {
  const trimmed = line.trim();
  if (/^[a-z0-9+.-]+:\/\//i.test(trimmed)) {
    const u = new URL(trimmed);
    const protoRaw = u.protocol.replace(/:$/, '').toLowerCase();
    if (protoRaw !== 'http' && protoRaw !== 'https' && protoRaw !== 'socks5') {
      throw new Error(`Unsupported proxy protocol "${protoRaw}"`);
    }
    const port = Number.parseInt(u.port, 10);
    if (!u.hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Invalid host or port');
    }
    const username = u.username ? decodeURIComponent(u.username) : undefined;
    const password = u.password ? decodeURIComponent(u.password) : undefined;
    return {
      label: `${u.hostname}:${port}`,
      protocol: protoRaw,
      host: u.hostname,
      port,
      username,
      password,
    };
  }

  // Handle host:port[:user[:pass]] or CSV host,port,user,pass
  const parts = trimmed.includes(',')
    ? trimmed.split(',').map((s) => s.trim())
    : trimmed.split(':').map((s) => s.trim());

  if (parts.length !== 2 && parts.length !== 4) {
    throw new Error('Expected protocol://[user:pass@]host:port or host:port[:user:pass]');
  }

  const host = parts[0];
  const port = Number.parseInt(parts[1] ?? '', 10);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Invalid host or port');
  }

  return {
    label: `${host}:${port}`,
    protocol: defaultProtocol,
    host,
    port,
    username: parts[2] || undefined,
    password: parts[3] || undefined,
  };
}

/**
 * Parses bulk proxy lines (URL, host:port:user:pass, or CSV) and flags duplicates.
 */
export function parseBulkProxies(
  rawText: string,
  defaultProtocol: ProxyProtocol = 'http',
  existingKeys: Set<string> = new Set(),
): BulkProxyParseResult {
  const valid: ParsedProxyEntry[] = [];
  const duplicates: Array<{ line: number; raw: string }> = [];
  const errors: Array<{ line: number; raw: string; reason: string }> = [];
  const seen = new Set(existingKeys);

  const lines = rawText.split(/\r?\n/);
  lines.forEach((rawLine, idx) => {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    try {
      const parsed = parseSingleLine(trimmed, defaultProtocol);
      const dedupeKey = `${parsed.protocol}://${parsed.username ?? ''}@${parsed.host}:${parsed.port}`;
      if (seen.has(dedupeKey)) {
        duplicates.push({ line: idx + 1, raw: trimmed });
        return;
      }
      seen.add(dedupeKey);
      valid.push(parsed);
    } catch (err) {
      errors.push({
        line: idx + 1,
        raw: trimmed,
        reason: err instanceof Error ? err.message : 'Invalid proxy format',
      });
    }
  });

  return { valid, duplicates, errors };
}
