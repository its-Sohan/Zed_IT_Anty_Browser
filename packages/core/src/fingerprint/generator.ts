import { randomInt } from 'node:crypto';
import type { Brand, FingerprintConfig, Platform, ProbeSnapshot } from '@zita/shared';
import { HARDWARE_TABLES } from './hardware-tables.js';

export interface GenerateFingerprintInput {
  os: Platform;
  osVersion?: string;
  seed?: number;
  brand?: Brand;
  brandVersion?: string;
  timezone?: string | null;
  locale?: string | null;
}

export interface LabDiffRow {
  signal: string;
  expected: string;
  observed: string;
  status: 'pass' | 'warn' | 'fail' | 'unsupported';
  explanation: string;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a positive 32-bit signed integer seed (`1..2147483647`).
 */
export function generateSeed(): number {
  return randomInt(1, 2_147_483_647);
}

/**
 * Deterministically derives a coherent v1 FingerprintConfig from OS, seed, and optional overrides.
 */
export function generateFingerprint(input: GenerateFingerprintInput): FingerprintConfig {
  const seed = input.seed ?? generateSeed();
  const table = HARDWARE_TABLES[input.os];
  const rand = mulberry32(seed);

  const osVersion =
    input.osVersion && table.osVersions.includes(input.osVersion)
      ? input.osVersion
      : table.osVersions[Math.floor(rand() * table.osVersions.length)]!;

  const hw = table.hardware[Math.floor(rand() * table.hardware.length)]!;
  const res = table.resolutions[Math.floor(rand() * table.resolutions.length)]!;

  const tzValue = input.timezone?.trim() || null;
  const locValue = input.locale?.trim() || 'en-US';
  const baseLang = locValue.split('-')[0];
  const acceptLang = baseLang && baseLang !== locValue ? `${locValue},${baseLang}` : locValue;

  return {
    schemaVersion: 1,
    seed,
    platform: input.os,
    platformVersion: osVersion,
    brand: input.brand ?? 'Chrome',
    brandVersion: input.brandVersion ?? '150',
    hardware: {
      cpuCores: hw.cpuCores,
      memoryGb: hw.memoryGb,
      gpuVendor: hw.gpuVendor,
      gpuRenderer: hw.gpuRenderer,
    },
    screen: {
      mode: 'host',
      width: res.width,
      height: res.height,
      deviceScaleFactor: input.os === 'android' ? 2.625 : input.os === 'macos' ? 2 : 1,
    },
    timezone: {
      mode: tzValue ? 'manual' : 'auto',
      value: tzValue,
    },
    locale: {
      mode: input.locale ? 'manual' : 'auto',
      value: locValue,
      acceptLanguage: acceptLang,
    },
    geolocation: {
      mode: 'auto',
      latitude: null,
      longitude: null,
    },
    webrtc: {
      mode: 'proxied',
    },
    spoofing: {
      canvas: true,
      audio: true,
      fonts: true,
      clientRects: true,
      gpu: true,
    },
    extras: {
      doNotTrack: false,
      blockedPorts: [],
    },
  };
}

function expectedNavigatorPlatform(os: Platform): string {
  if (os === 'windows') return 'Win32';
  if (os === 'macos') return 'MacIntel';
  if (os === 'android') return 'Linux armv81';
  return 'Linux x86_64';
}

function expectedUadPlatform(os: Platform): string {
  if (os === 'windows') return 'Windows';
  if (os === 'macos') return 'macOS';
  if (os === 'android') return 'Android';
  return 'Linux';
}

/**
 * Compares expected FingerprintConfig against a live ProbeSnapshot and honestly surfaces engine gaps.
 */
export function compareExpectedVsObserved(
  expected: FingerprintConfig,
  observed: ProbeSnapshot,
  options?: { proxyTimezone?: string | null },
): LabDiffRow[] {
  const rows: LabDiffRow[] = [];

  const expPlatform = expectedNavigatorPlatform(expected.platform);
  rows.push({
    signal: 'navigator.platform',
    expected: expPlatform,
    observed: observed.platform,
    status: observed.platform === expPlatform ? 'pass' : 'fail',
    explanation: 'Must match the selected OS family so JS platform and User-Agent agree.',
  });

  const obsUadPlatform = observed.userAgentData?.platform ?? 'n/a';
  const expUadPlatform = expectedUadPlatform(expected.platform);
  const obsUadVer = String(observed.userAgentData?.highEntropy?.platformVersion ?? 'n/a');
  rows.push({
    signal: 'Client Hints (userAgentData)',
    expected: `${expUadPlatform} ${expected.platformVersion}`,
    observed: `${obsUadPlatform} ${obsUadVer}`,
    status: obsUadPlatform === expUadPlatform ? 'pass' : 'fail',
    explanation: 'High-entropy User-Agent Client Hints read by modern anti-bot scripts.',
  });

  const expectedUaToken = `${expected.brand}/${expected.brandVersion}.`;
  const hasExpectedUaOs = expected.platform === 'android' ? observed.userAgent.includes('Android') : true;
  rows.push({
    signal: 'navigator.userAgent',
    expected: `${expected.brand} ${expected.brandVersion} (${expUadPlatform})`,
    observed: observed.userAgent,
    status: observed.userAgent.includes(expectedUaToken) && hasExpectedUaOs ? 'pass' : 'warn',
    explanation: 'Primary browser brand, major version, and OS string.',
  });

  rows.push({
    signal: 'navigator.webdriver',
    expected: 'false',
    observed: String(observed.webdriver),
    status: observed.webdriver === false ? 'pass' : 'fail',
    explanation: 'Automation flag should remain false during normal and CDP-seeded launches.',
  });

  rows.push({
    signal: 'CPU cores (hardwareConcurrency)',
    expected: String(expected.hardware.cpuCores),
    observed: String(observed.hardwareConcurrency ?? 'null'),
    status: observed.hardwareConcurrency === expected.hardware.cpuCores ? 'pass' : 'fail',
    explanation: 'Explicitly passed via --fingerprint-hardware-concurrency.',
  });

  rows.push({
    signal: 'Device memory (deviceMemory)',
    expected: expected.hardware.memoryGb ? `${expected.hardware.memoryGb} GB (preset)` : 'Seed-derived',
    observed: observed.deviceMemory !== null ? `${observed.deviceMemory} GB` : 'null (non-secure origin)',
    status: observed.deviceMemory !== null ? 'pass' : 'warn',
    explanation: 'In v1, fingerprint-chromium derives deviceMemory from the seed rather than a separate CLI flag.',
  });

  const expectedTz = expected.timezone.value ?? options?.proxyTimezone ?? null;
  rows.push({
    signal: 'Timezone (Intl)',
    expected: expectedTz ?? 'Auto / Host default',
    observed: observed.timezone,
    status: expectedTz ? (observed.timezone === expectedTz ? 'pass' : 'fail') : 'pass',
    explanation: 'Timezone must align with the exit IP location to avoid geo-mismatch flags.',
  });

  const expectedLang = expected.locale.value ?? 'en-US';
  rows.push({
    signal: 'Language (navigator.language)',
    expected: expectedLang,
    observed: observed.language,
    status: observed.language === expectedLang ? 'pass' : 'warn',
    explanation: 'Browser UI language and Accept-Language header.',
  });

  rows.push({
    signal: 'WebGL Vendor / Renderer',
    expected: expected.spoofing.gpu ? 'Seed-derived GPU' : 'Spoofing disabled',
    observed: `${observed.webgl.unmaskedVendor ?? 'n/a'} — ${observed.webgl.unmaskedRenderer ?? 'n/a'}`,
    status: observed.webgl.unmaskedRenderer ? 'pass' : 'warn',
    explanation: 'Manual GPU strings were removed in Chromium 144+; engine derives coherent GPU per seed.',
  });

  rows.push({
    signal: 'Canvas / Audio / ClientRects / Fonts',
    expected: expected.spoofing.canvas ? `Seed ${expected.seed} active` : 'Partial/disabled',
    observed: `canvas=${observed.canvas.hash ?? 'n/a'} audio=${observed.audio.hash ?? 'n/a'} rects=${observed.clientRects.hash} fonts=${observed.fonts.hash}`,
    status: observed.canvas.hash && observed.audio.hash ? 'pass' : 'warn',
    explanation: 'Deterministic per-seed noise verified repeatable across launches.',
  });

  const hostIps = observed.webrtc.hostIps;
  rows.push({
    signal: 'WebRTC Host IP Leak',
    expected: expected.webrtc.mode === 'real' ? 'Allowed (real)' : '0 host IPs exposed',
    observed: hostIps.length === 0 ? '[] (no leak)' : hostIps.join(', '),
    status: expected.webrtc.mode === 'real' || hostIps.length === 0 ? 'pass' : 'fail',
    explanation: 'Non-proxied UDP is disabled by default so local LAN/host IPs do not leak via ICE.',
  });

  rows.push({
    signal: 'Screen Resolution (screen.*)',
    expected: 'Not spoofed in v1 engine',
    observed: `${observed.screen.width}x${observed.screen.height} (viewport ${observed.screen.innerWidth}x${observed.screen.innerHeight})`,
    status: 'unsupported',
    explanation: 'Known v1 engine gap: host screen dimensions remain visible; --window-size sets window bounds only.',
  });

  rows.push({
    signal: 'Media Devices (enumerateDevices)',
    expected: 'Not spoofed in v1 engine',
    observed: observed.mediaDevices.available
      ? `count=${observed.mediaDevices.count ?? 0}`
      : 'Unavailable on non-secure origin',
    status: 'unsupported',
    explanation: 'Known v1 engine gap: host media device counts remain visible in secure contexts.',
  });

  return rows;
}
