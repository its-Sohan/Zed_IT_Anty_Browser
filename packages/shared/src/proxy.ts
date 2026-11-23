import { z } from 'zod';

export const ProxyProtocolSchema = z.enum(['http', 'https', 'socks5']);
export type ProxyProtocol = z.infer<typeof ProxyProtocolSchema>;

export const ProxyConfigSchema = z.object({
  protocol: ProxyProtocolSchema,
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().optional(),
  password: z.string().optional(),
});
export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;

export const ProxyStatsSchema = z.object({
  bytesUp: z.number().nonnegative(),
  bytesDown: z.number().nonnegative(),
  activeConnections: z.number().int().nonnegative(),
  totalConnections: z.number().int().nonnegative(),
});
export type ProxyStats = z.infer<typeof ProxyStatsSchema>;

export const ProxyCheckResultSchema = z.object({
  ok: z.boolean(),
  exitIp: z.string().nullable(),
  country: z.string().nullable(),
  city: z.string().nullable(),
  timezone: z.string().nullable(),
  latencyMs: z.number().nonnegative().nullable(),
  error: z.string().nullable(),
  checkedAt: z.string(),
});
export type ProxyCheckResult = z.infer<typeof ProxyCheckResultSchema>;
