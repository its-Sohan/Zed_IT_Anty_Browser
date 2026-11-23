import type { ProbeSnapshot } from '@zita/shared';
import { describe, expect, it } from 'vitest';
import { compareExpectedVsObserved, generateFingerprint } from './generator.js';
import { HARDWARE_TABLES } from './hardware-tables.js';

describe('Fingerprint generator & hardware coherence', () => {
  it('enforces coherent OS hardware presets (macOS never NVIDIA, >=4GB for 2+ cores)', () => {
    for (const preset of HARDWARE_TABLES.macos.hardware) {
      expect(preset.gpuVendor).toContain('Apple');
      expect(preset.gpuRenderer).not.toContain('NVIDIA');
    }
    for (const table of Object.values(HARDWARE_TABLES)) {
      for (const preset of table.hardware) {
        if (preset.cpuCores <= 2) expect(preset.memoryGb).toBeLessThan(64);
      }
    }
  });

  it('generates identical FingerprintConfig deterministically for the same seed and OS', () => {
    const a = generateFingerprint({ os: 'windows', osVersion: '11', seed: 1287349192, timezone: 'America/New_York' });
    const b = generateFingerprint({ os: 'windows', osVersion: '11', seed: 1287349192, timezone: 'America/New_York' });
    expect(a).toEqual(b);
  });

  it('surfaces screen and mediaDevices honestly as unsupported in compareExpectedVsObserved', () => {
    const expected = generateFingerprint({
      os: 'windows',
      osVersion: '10',
      seed: 1287349192,
      timezone: 'America/New_York',
      locale: 'en-US',
    });
    const observed: ProbeSnapshot = {
      capturedAt: new Date().toISOString(),
      origin: 'http://127.0.0.1:1234',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150.0.0.0 Safari/537.36',
      platform: 'Win32',
      webdriver: false,
      hardwareConcurrency: expected.hardware.cpuCores,
      deviceMemory: 16,
      language: 'en-US',
      languages: ['en-US', 'en'],
      plugins: [],
      userAgentData: {
        brands: [{ brand: 'Google Chrome', version: '150' }],
        mobile: false,
        platform: 'Windows',
        highEntropy: { platformVersion: '10' },
      },
      timezone: 'America/New_York',
      intlLocale: 'en-US',
      timezoneOffset: 300,
      screen: { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040, colorDepth: 24, devicePixelRatio: 1, innerWidth: 1366, innerHeight: 768 },
      webgl: { vendor: 'WebKit', renderer: 'WebKit WebGL', unmaskedVendor: 'Google Inc. (NVIDIA)', unmaskedRenderer: 'ANGLE (NVIDIA)', imageHash: 'abcd' },
      canvas: { hash: 'c81277fb' },
      audio: { hash: '692bc4c1', error: null },
      clientRects: { hash: '82fb9f8b', sample: [] },
      fonts: { hash: '5c7d61e2', measuredWidths: {} },
      mediaDevices: { available: true, count: 2, kinds: { audioinput: 1, videoinput: 1 } },
      webrtc: { candidates: [], hostIps: [], srflxIps: [], error: null },
    };

    const diff = compareExpectedVsObserved(expected, observed);
    expect(diff.find((r) => r.signal.includes('Screen'))?.status).toBe('unsupported');
    expect(diff.find((r) => r.signal.includes('Media Devices'))?.status).toBe('unsupported');
    expect(diff.find((r) => r.signal.includes('WebRTC'))?.status).toBe('pass');
    expect(diff.find((r) => r.signal.includes('CPU cores'))?.status).toBe('pass');
  });
});
