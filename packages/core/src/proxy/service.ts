import { desc, eq, isNotNull } from 'drizzle-orm';
import type {
  ProxyCheckResult,
  ProxyConfig,
  ProxyProtocol,
  ProxySummary,
} from '@zita/shared';
import type { SecretBox } from '../crypto/secrets.js';
import { createId, profiles, proxies, type ZitaDatabase } from '../db/index.js';
import { checkProxy, type CheckProxyOptions } from './checker.js';
import { parseBulkProxies } from './parser.js';

export interface CreateProxyInput {
  label: string;
  protocol: ProxyProtocol;
  host: string;
  port: number;
  username?: string | null;
  password?: string | null;
}

export interface UpdateProxyInput extends Partial<CreateProxyInput> {}

function parseLastCheck(raw: string | null): ProxyCheckResult | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ProxyCheckResult;
  } catch {
    return null;
  }
}

/**
 * Manages persisted proxies with AES-256-GCM encrypted passwords and geo/latency checks.
 */
export class ProxyService {
  constructor(
    private readonly database: ZitaDatabase,
    private readonly secretBox: SecretBox,
  ) {}

  list(): ProxySummary[] {
    const rows = this.database.db.select().from(proxies).orderBy(desc(proxies.updatedAt)).all();
    const assigned = this.database.db
      .select({ proxyId: profiles.proxyId })
      .from(profiles)
      .where(isNotNull(profiles.proxyId))
      .all();

    const counts = new Map<string, number>();
    for (const row of assigned) {
      if (row.proxyId) counts.set(row.proxyId, (counts.get(row.proxyId) ?? 0) + 1);
    }

    return rows.map((p) => ({
      id: p.id,
      label: p.label,
      protocol: p.protocol as ProxyProtocol,
      host: p.host,
      port: p.port,
      username: p.username,
      hasAuth: Boolean(p.username || p.passwordEnc),
      country: p.country,
      city: p.city,
      timezone: p.timezone,
      lastCheck: parseLastCheck(p.lastCheckJson),
      bytesUpTotal: p.bytesUpTotal,
      bytesDownTotal: p.bytesDownTotal,
      assignedCount: counts.get(p.id) ?? 0,
      updatedAt: p.updatedAt,
    }));
  }

  getById(id: string): ProxySummary | null {
    return this.list().find((p) => p.id === id) ?? null;
  }

  /**
   * Returns decrypted credentials for internal main-process bridge startup or explicit user reveal.
   */
  getDecrypted(id: string): ProxyConfig | null {
    const row = this.database.db.select().from(proxies).where(eq(proxies.id, id)).get();
    if (!row) return null;
    const password = row.passwordEnc ? this.secretBox.decrypt(row.passwordEnc) : undefined;
    return {
      protocol: row.protocol as ProxyProtocol,
      host: row.host,
      port: row.port,
      username: row.username ?? undefined,
      password,
    };
  }

  revealPassword(id: string): string | null {
    const row = this.database.db.select().from(proxies).where(eq(proxies.id, id)).get();
    if (!row) throw new Error(`Proxy ${id} not found`);
    return row.passwordEnc ? this.secretBox.decrypt(row.passwordEnc) : null;
  }

  create(input: CreateProxyInput): ProxySummary {
    const now = new Date().toISOString();
    const id = createId('prx');
    const passwordEnc = input.password ? this.secretBox.encrypt(input.password) : null;

    this.database.db
      .insert(proxies)
      .values({
        id,
        label: input.label.trim() || `${input.host}:${input.port}`,
        protocol: input.protocol,
        host: input.host.trim(),
        port: input.port,
        username: input.username?.trim() || null,
        passwordEnc,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return this.getById(id)!;
  }

  update(id: string, input: UpdateProxyInput): ProxySummary {
    const existing = this.database.db.select().from(proxies).where(eq(proxies.id, id)).get();
    if (!existing) throw new Error(`Proxy ${id} not found`);

    const now = new Date().toISOString();
    let passwordEnc = existing.passwordEnc;
    if (input.password !== undefined) {
      passwordEnc = input.password ? this.secretBox.encrypt(input.password) : null;
    }

    this.database.db
      .update(proxies)
      .set({
        label: input.label !== undefined ? input.label.trim() : existing.label,
        protocol: input.protocol ?? existing.protocol,
        host: input.host !== undefined ? input.host.trim() : existing.host,
        port: input.port ?? existing.port,
        username: input.username !== undefined ? input.username?.trim() || null : existing.username,
        passwordEnc,
        updatedAt: now,
      })
      .where(eq(proxies.id, id))
      .run();

    return this.getById(id)!;
  }

  duplicate(id: string): ProxySummary {
    const existing = this.database.db.select().from(proxies).where(eq(proxies.id, id)).get();
    if (!existing) throw new Error(`Proxy ${id} not found`);

    const password = existing.passwordEnc ? this.secretBox.decrypt(existing.passwordEnc) : null;
    return this.create({
      label: `${existing.label} (Copy)`,
      protocol: existing.protocol as ProxyProtocol,
      host: existing.host,
      port: existing.port,
      username: existing.username,
      password,
    });
  }

  delete(id: string): void {
    this.database.db.delete(proxies).where(eq(proxies.id, id)).run();
  }

  bulkCreate(
    rawText: string,
    defaultProtocol: ProxyProtocol = 'http',
  ): {
    created: ProxySummary[];
    duplicates: Array<{ line: number; raw: string }>;
    errors: Array<{ line: number; raw: string; reason: string }>;
  } {
    const existingKeys = new Set(
      this.database.db
        .select()
        .from(proxies)
        .all()
        .map((p) => `${p.protocol}://${p.username ?? ''}@${p.host}:${p.port}`),
    );

    const parsed = parseBulkProxies(rawText, defaultProtocol, existingKeys);
    const created = parsed.valid.map((entry) => this.create(entry));
    return {
      created,
      duplicates: parsed.duplicates,
      errors: parsed.errors,
    };
  }

  async test(id: string, opts?: CheckProxyOptions): Promise<ProxyCheckResult> {
    const config = this.getDecrypted(id);
    if (!config) throw new Error(`Proxy ${id} not found`);

    const result = await checkProxy(config, opts);
    const existing = this.database.db.select().from(proxies).where(eq(proxies.id, id)).get();
    if (existing) {
      this.database.db
        .update(proxies)
        .set({
          country: result.country ?? existing.country,
          city: result.city ?? existing.city,
          timezone: result.timezone ?? existing.timezone,
          lastCheckJson: JSON.stringify(result),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(proxies.id, id))
        .run();
    }

    return result;
  }

  recordTraffic(id: string, bytesUp: number, bytesDown: number): void {
    const existing = this.database.db.select().from(proxies).where(eq(proxies.id, id)).get();
    if (!existing) return;
    this.database.db
      .update(proxies)
      .set({
        bytesUpTotal: existing.bytesUpTotal + Math.max(0, bytesUp),
        bytesDownTotal: existing.bytesDownTotal + Math.max(0, bytesDown),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(proxies.id, id))
      .run();
  }
}
