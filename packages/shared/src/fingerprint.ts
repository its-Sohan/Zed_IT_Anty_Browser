import { z } from 'zod';

export const PlatformSchema = z.enum(['windows', 'macos', 'linux', 'android']);
export type Platform = z.infer<typeof PlatformSchema>;

export const BrandSchema = z.enum(['Chrome', 'Edge', 'Opera', 'Vivaldi', 'Chromium']);
export type Brand = z.infer<typeof BrandSchema>;

export const SpoofingTogglesSchema = z.object({
  canvas: z.boolean().default(true),
  audio: z.boolean().default(true),
  fonts: z.boolean().default(true),
  clientRects: z.boolean().default(true),
  gpu: z.boolean().default(true),
});
export type SpoofingToggles = z.infer<typeof SpoofingTogglesSchema>;

export const FingerprintConfigSchema = z.object({
  schemaVersion: z.literal(1).default(1),
  seed: z.number().int().min(1).max(2147483647),
  platform: PlatformSchema,
  platformVersion: z.string().min(1),
  brand: BrandSchema.default('Chrome'),
  brandVersion: z.string().min(1).default('150'),
  hardware: z.object({
    cpuCores: z.number().int().min(1).max(128),
    memoryGb: z.number().int().min(1).max(512).optional(),
    gpuVendor: z.string().optional(),
    gpuRenderer: z.string().optional(),
  }),
  screen: z
    .object({
      mode: z.enum(['host', 'custom']).default('host'),
      width: z.number().int().positive().nullable().default(null),
      height: z.number().int().positive().nullable().default(null),
      deviceScaleFactor: z.number().positive().nullable().default(null),
    })
    .default({ mode: 'host', width: null, height: null, deviceScaleFactor: null }),
  timezone: z
    .object({
      mode: z.enum(['auto', 'manual']).default('auto'),
      value: z.string().nullable().default(null),
    })
    .default({ mode: 'auto', value: null }),
  locale: z
    .object({
      mode: z.enum(['auto', 'manual']).default('auto'),
      value: z.string().nullable().default(null),
      acceptLanguage: z.string().nullable().default(null),
    })
    .default({ mode: 'auto', value: null, acceptLanguage: null }),
  geolocation: z
    .object({
      mode: z.enum(['auto', 'manual', 'disabled']).default('auto'),
      latitude: z.number().nullable().default(null),
      longitude: z.number().nullable().default(null),
    })
    .default({ mode: 'auto', latitude: null, longitude: null }),
  webrtc: z
    .object({
      mode: z.enum(['proxied', 'disabled', 'real']).default('proxied'),
    })
    .default({ mode: 'proxied' }),
  spoofing: SpoofingTogglesSchema.default({
    canvas: true,
    audio: true,
    fonts: true,
    clientRects: true,
    gpu: true,
  }),
  extras: z
    .object({
      doNotTrack: z.boolean().default(false),
      blockedPorts: z.array(z.number().int().min(1).max(65535)).default([]),
    })
    .default({ doNotTrack: false, blockedPorts: [] }),
});
export type FingerprintConfig = z.infer<typeof FingerprintConfigSchema>;

export const ProbeSnapshotSchema = z.object({
  capturedAt: z.string(),
  origin: z.string(),
  userAgent: z.string(),
  platform: z.string(),
  webdriver: z.boolean(),
  hardwareConcurrency: z.number().nullable(),
  deviceMemory: z.number().nullable(),
  language: z.string(),
  languages: z.array(z.string()),
  plugins: z.array(z.string()),
  userAgentData: z
    .object({
      brands: z.array(z.object({ brand: z.string(), version: z.string() })),
      mobile: z.boolean(),
      platform: z.string(),
      highEntropy: z.record(z.unknown()).nullable(),
    })
    .nullable(),
  timezone: z.string(),
  intlLocale: z.string(),
  timezoneOffset: z.number(),
  screen: z.object({
    width: z.number(),
    height: z.number(),
    availWidth: z.number(),
    availHeight: z.number(),
    colorDepth: z.number(),
    devicePixelRatio: z.number(),
    innerWidth: z.number(),
    innerHeight: z.number(),
  }),
  webgl: z.object({
    vendor: z.string().nullable(),
    renderer: z.string().nullable(),
    unmaskedVendor: z.string().nullable(),
    unmaskedRenderer: z.string().nullable(),
    imageHash: z.string().nullable(),
  }),
  canvas: z.object({
    hash: z.string().nullable(),
  }),
  audio: z.object({
    hash: z.string().nullable(),
    error: z.string().nullable().optional(),
  }),
  clientRects: z.object({
    hash: z.string(),
    sample: z.array(z.object({ width: z.number(), height: z.number() })),
  }),
  fonts: z.object({
    hash: z.string(),
    measuredWidths: z.record(z.number()),
  }),
  mediaDevices: z.object({
    available: z.boolean(),
    count: z.number().nullable(),
    kinds: z.record(z.number()).nullable(),
  }),
  webrtc: z.object({
    candidates: z.array(z.string()),
    hostIps: z.array(z.string()),
    srflxIps: z.array(z.string()),
    error: z.string().nullable().optional(),
  }),
});
export type ProbeSnapshot = z.infer<typeof ProbeSnapshotSchema>;
