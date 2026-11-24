import type { Platform, ProxyProtocol } from '@zita/shared';

export interface CsvParseResult {
  headers: string[];
  rows: string[][];
}

export interface CsvColumnMapping {
  name: string;
  os?: string;
  osVersion?: string;
  proxy?: string;
  tags?: string;
  folder?: string;
  notes?: string;
  startPages?: string;
}

export interface ValidatedCsvProfileRow {
  rowNumber: number;
  name: string;
  os: Platform;
  osVersion?: string;
  proxy?: {
    protocol: ProxyProtocol;
    host: string;
    port: number;
    username?: string;
    password?: string;
  };
  tags: string[];
  folder?: string;
  notes?: string;
  startPages: string[];
}

export interface CsvPreviewResult {
  headers: string[];
  totalRows: number;
  validRows: ValidatedCsvProfileRow[];
  errors: Array<{ row: number; message: string }>;
}

/**
 * RFC 4180-compliant CSV parser handling quoted fields, escaped quotes, and CRLF/LF newlines.
 */
export function parseCsv(text: string): CsvParseResult {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let field = '';
  let inQuotes = false;

  const normalized = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      currentRow.push(field.trim());
      field = '';
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && normalized[i + 1] === '\n') {
        i += 1;
      }
      currentRow.push(field.trim());
      if (currentRow.some((c) => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      field = '';
    } else {
      field += ch;
    }
  }

  currentRow.push(field.trim());
  if (currentRow.some((c) => c.length > 0)) {
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return { headers: [], rows: [] };
  }

  const [headers, ...bodyRows] = rows;
  return { headers: headers ?? [], rows: bodyRows };
}

function parseInlineProxy(
  raw: string,
): { protocol: ProxyProtocol; host: string; port: number; username?: string; password?: string } {
  const trimmed = raw.trim();
  if (/^[a-z0-9+.-]+:\/\//i.test(trimmed)) {
    const u = new URL(trimmed);
    const proto = u.protocol.replace(/:$/, '').toLowerCase();
    if (proto !== 'http' && proto !== 'https' && proto !== 'socks5') {
      throw new Error(`Unsupported proxy protocol "${proto}"`);
    }
    const port = Number.parseInt(u.port, 10);
    if (!u.hostname || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid proxy URL "${trimmed}"`);
    }
    return {
      protocol: proto,
      host: u.hostname,
      port,
      username: u.username ? decodeURIComponent(u.username) : undefined,
      password: u.password ? decodeURIComponent(u.password) : undefined,
    };
  }

  const parts = trimmed.split(':').map((s) => s.trim());
  if (parts.length !== 2 && parts.length !== 4) {
    throw new Error(`Invalid proxy "${trimmed}": expected host:port[:user:pass] or URL`);
  }
  const host = parts[0];
  const port = Number.parseInt(parts[1] ?? '', 10);
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid proxy host/port "${trimmed}"`);
  }
  return {
    protocol: 'http',
    host,
    port,
    username: parts[2] || undefined,
    password: parts[3] || undefined,
  };
}

/**
 * Validates CSV rows against a column mapping and collects row-level error messages without failing the batch.
 */
export function previewCsvImport(
  csvText: string,
  mapping?: CsvColumnMapping,
): CsvPreviewResult {
  const parsed = parseCsv(csvText);
  if (parsed.headers.length === 0) {
    return { headers: [], totalRows: 0, validRows: [], errors: [{ row: 0, message: 'CSV is empty' }] };
  }

  const headerIndex = new Map<string, number>();
  parsed.headers.forEach((h, idx) => {
    headerIndex.set(h.toLowerCase(), idx);
  });

  const findCol = (mappedName: string | undefined, fallbacks: string[]): number => {
    if (mappedName) {
      const idx = parsed.headers.indexOf(mappedName);
      if (idx !== -1) return idx;
    }
    for (const candidate of fallbacks) {
      const idx = headerIndex.get(candidate.toLowerCase());
      if (idx !== undefined) return idx;
    }
    return -1;
  };

  const nameCol = findCol(mapping?.name, ['name', 'profile', 'profile_name', 'account']);
  if (nameCol === -1) {
    return {
      headers: parsed.headers,
      totalRows: parsed.rows.length,
      validRows: [],
      errors: [{ row: 1, message: 'No "name" column found or mapped' }],
    };
  }

  const osCol = findCol(mapping?.os, ['os', 'platform']);
  const osVerCol = findCol(mapping?.osVersion, ['os_version', 'osversion', 'platform_version']);
  const proxyCol = findCol(mapping?.proxy, ['proxy', 'proxy_url']);
  const tagsCol = findCol(mapping?.tags, ['tags', 'tag']);
  const folderCol = findCol(mapping?.folder, ['folder', 'group']);
  const notesCol = findCol(mapping?.notes, ['notes', 'note']);
  const pagesCol = findCol(mapping?.startPages, ['start_pages', 'startpages', 'urls', 'url']);

  const validRows: ValidatedCsvProfileRow[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  parsed.rows.forEach((row, idx) => {
    const rowNumber = idx + 2; // 1-based accounting for header row
    const name = (row[nameCol] ?? '').trim();
    if (!name || name.length > 120) {
      errors.push({ row: rowNumber, message: 'Profile name must be 1–120 characters' });
      return;
    }

    const osRaw = (osCol !== -1 ? row[osCol] : 'windows')?.trim().toLowerCase() || 'windows';
    if (osRaw !== 'windows' && osRaw !== 'macos' && osRaw !== 'linux' && osRaw !== 'android') {
      errors.push({ row: rowNumber, message: `Unsupported OS "${osRaw}" (use windows, macos, linux, or android)` });
      return;
    }

    let proxy: ValidatedCsvProfileRow['proxy'];
    const proxyRaw = proxyCol !== -1 ? (row[proxyCol] ?? '').trim() : '';
    if (proxyRaw) {
      try {
        proxy = parseInlineProxy(proxyRaw);
      } catch (err) {
        errors.push({
          row: rowNumber,
          message: err instanceof Error ? err.message : 'Invalid proxy',
        });
        return;
      }
    }

    const tagsRaw = tagsCol !== -1 ? (row[tagsCol] ?? '').trim() : '';
    const tags = tagsRaw
      ? tagsRaw
          .split(/[;|]/)
          .map((t) => t.trim())
          .filter(Boolean)
      : [];

    const pagesRaw = pagesCol !== -1 ? (row[pagesCol] ?? '').trim() : '';
    const startPages: string[] = [];
    if (pagesRaw) {
      for (const candidate of pagesRaw.split(/[;|]/).map((s) => s.trim()).filter(Boolean)) {
        try {
          const u = new URL(candidate);
          if (u.protocol !== 'http:' && u.protocol !== 'https:') {
            throw new Error();
          }
          startPages.push(candidate);
        } catch {
          errors.push({ row: rowNumber, message: `Invalid start page URL "${candidate}"` });
          return;
        }
      }
    }

    validRows.push({
      rowNumber,
      name,
      os: osRaw,
      osVersion: osVerCol !== -1 ? row[osVerCol]?.trim() || undefined : undefined,
      proxy,
      tags,
      folder: folderCol !== -1 ? row[folderCol]?.trim() || undefined : undefined,
      notes: notesCol !== -1 ? row[notesCol]?.trim() || undefined : undefined,
      startPages,
    });
  });

  return {
    headers: parsed.headers,
    totalRows: parsed.rows.length,
    validRows,
    errors,
  };
}
