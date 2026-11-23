import { z } from 'zod';
import { FingerprintConfigSchema } from './fingerprint.js';

export const EnginePlatformSchema = z.enum(['linux-x64', 'win-x64']);
export type EnginePlatform = z.infer<typeof EnginePlatformSchema>;

export const EngineArtifactSchema = z.object({
  filename: z.string().min(1),
  url: z.string().url(),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i).nullable(),
});
export type EngineArtifact = z.infer<typeof EngineArtifactSchema>;

export const EngineManifestSchema = z.object({
  version: z.string().min(1),
  upstreamRepo: z.string().url(),
  license: z.string().min(1),
  artifacts: z.record(EnginePlatformSchema, EngineArtifactSchema),
});
export type EngineManifest = z.infer<typeof EngineManifestSchema>;

export const EngineLaunchOptionsSchema = z.object({
  userDataDir: z.string().min(1),
  fingerprint: FingerprintConfigSchema,
  proxyServer: z.string().min(1).optional(),
  windowSize: z
    .object({
      width: z.number().int().min(200).max(7680),
      height: z.number().int().min(200).max(4320),
    })
    .optional(),
  extraFlags: z.array(z.string()).default([]),
  startPages: z.array(z.string()).default([]),
});
export type EngineLaunchOptions = z.infer<typeof EngineLaunchOptionsSchema>;
