import { describe, expect, it } from 'vitest';
import { composeEngineFlags, validateExtraFlags } from './flags.js';
import type { EngineLaunchOptions } from '@zita/shared';

function baseOptions(overrides: Partial<EngineLaunchOptions> = {}): EngineLaunchOptions {
  return {
    userDataDir: '/tmp/zita-profile-1',
    fingerprint: {
      schemaVersion: 1,
      seed: 1287349192,
      platform: 'windows',
      platformVersion: '10',
      brand: 'Chrome',
      brandVersion: '150',
      hardware: {
        cpuCores: 8,
      },
      screen: { mode: 'host', width: null, height: null, deviceScaleFactor: null },
      timezone: { mode: 'manual', value: 'America/New_York' },
      locale: { mode: 'manual', value: 'en-US', acceptLanguage: 'en-US,en' },
      geolocation: { mode: 'auto', latitude: null, longitude: null },
      webrtc: { mode: 'proxied' },
      spoofing: {
        canvas: true,
        audio: true,
        fonts: true,
        clientRects: true,
        gpu: true,
      },
      extras: { doNotTrack: false, blockedPorts: [] },
    },
    extraFlags: [],
    startPages: [],
    ...overrides,
  };
}

describe('composeEngineFlags', () => {
  it('emits standard fingerprint-chromium flags for a valid config', () => {
    const flags = composeEngineFlags(
      baseOptions({
        proxyServer: 'socks5://127.0.0.1:45123',
        windowSize: { width: 1366, height: 768 },
        startPages: ['https://example.com'],
      }),
    );

    expect(flags).toContain('--user-data-dir=/tmp/zita-profile-1');
    expect(flags).toContain('--fingerprint=1287349192');
    expect(flags).toContain('--fingerprint-platform=windows');
    expect(flags).toContain('--fingerprint-platform-version=10');
    expect(flags).toContain('--fingerprint-brand=Chrome');
    expect(flags).toContain('--fingerprint-brand-version=150');
    expect(flags).toContain('--fingerprint-hardware-concurrency=8');
    expect(flags).toContain('--lang=en-US');
    expect(flags).toContain('--accept-lang=en-US,en');
    expect(flags).toContain('--timezone=America/New_York');
    expect(flags).toContain('--proxy-server=socks5://127.0.0.1:45123');
    expect(flags).toContain('--disable-non-proxied-udp');
    expect(flags).toContain('--window-size=1366,768');
    expect(flags).toContain('--remote-debugging-port=0');
    expect(flags).toContain('--remote-debugging-address=127.0.0.1');
    expect(flags.at(-1)).toBe('https://example.com');
    expect(flags.some((f) => f.startsWith('--disable-spoofing='))).toBe(false);
  });

  it('sends Android profiles to the engine as linux, since the engine has no android platform', () => {
    const opts = baseOptions();
    opts.fingerprint.platform = 'android';
    opts.fingerprint.platformVersion = '14';

    const flags = composeEngineFlags(opts);
    expect(flags).toContain('--fingerprint-platform=linux');
    expect(flags).toContain('--fingerprint-platform-version=14');
    expect(flags).not.toContain('--fingerprint-platform=android');
    expect(flags).toContain(
      '--user-agent=Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',
    );
  });

  it('maps disabled spoofing toggles to upstream --disable-spoofing values', () => {
    const opts = baseOptions();
    opts.fingerprint.spoofing = {
      canvas: false,
      audio: true,
      fonts: false,
      clientRects: false,
      gpu: false,
    };

    const flags = composeEngineFlags(opts);
    expect(flags).toContain('--disable-spoofing=canvas,font,clientrects,gpu');
  });

  it('omits --disable-non-proxied-udp when webrtc mode is real', () => {
    const opts = baseOptions();
    opts.fingerprint.webrtc.mode = 'real';

    const flags = composeEngineFlags(opts);
    expect(flags).not.toContain('--disable-non-proxied-udp');
  });

  it('rejects disallowed extra flags', () => {
    expect(() => validateExtraFlags(['--disable-web-security'])).toThrow(/Disallowed extra flag/);
    expect(() => validateExtraFlags(['--user-data-dir=/etc'])).toThrow(/Disallowed extra flag/);
    expect(() => validateExtraFlags(['not-a-flag'])).toThrow(/must start with "--"/);
    expect(validateExtraFlags(['--disable-quic', '--proxy-bypass-list=<-loopback>'])).toEqual([
      '--disable-quic',
      '--proxy-bypass-list=<-loopback>',
    ]);
  });
});
