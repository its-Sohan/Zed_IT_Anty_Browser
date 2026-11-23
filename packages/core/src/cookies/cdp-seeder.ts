import { rmSync } from 'node:fs';
import path from 'node:path';
import type { CdpClient } from '../engine/cdp.js';
import type { NormalizedCookie } from './parser.js';

/**
 * Seeds normalized cookies into Chromium via CDP `Storage.setCookies` before navigation.
 */
export async function seedCookiesViaCdp(
  cdp: CdpClient,
  cookies: NormalizedCookie[],
): Promise<number> {
  if (cookies.length === 0) return 0;

  const cdpCookies = cookies.map((c) => {
    const entry: Record<string, unknown> = {
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      secure: c.secure,
      httpOnly: c.httpOnly,
    };
    if (c.sameSite) entry.sameSite = c.sameSite;
    if (c.expires !== undefined) entry.expires = c.expires;
    return entry;
  });

  await cdp.send('Storage.setCookies', { cookies: cdpCookies });
  return cdpCookies.length;
}

/**
 * Removes Chromium's on-disk cookie SQLite files inside a stopped profile's user-data-dir.
 */
export function clearCookiesFiles(userDataDir: string): void {
  const candidates = [
    path.join(userDataDir, 'Default', 'Network', 'Cookies'),
    path.join(userDataDir, 'Default', 'Network', 'Cookies-journal'),
    path.join(userDataDir, 'Default', 'Cookies'),
    path.join(userDataDir, 'Default', 'Cookies-journal'),
  ];
  for (const file of candidates) {
    rmSync(file, { force: true });
  }
}
