import { EngineLaunchOptionsSchema, type EngineLaunchOptions } from '@zita/shared';

/**
 * Curated allowlist of extra Chromium CLI flags that callers or advanced profile settings may supply.
 */
export const ALLOWED_EXTRA_FLAGS = new Set([
  '--window-size',
  '--window-position',
  '--headless',
  '--proxy-bypass-list',
  '--disable-quic',
  '--force-device-scale-factor',
  '--mute-audio',
  '--no-sandbox',
]);

/**
 * Validates extra flags against {@link ALLOWED_EXTRA_FLAGS} and rejects unsafe or unknown switches.
 */
export function validateExtraFlags(flags: string[]): string[] {
  const validated: string[] = [];
  for (const raw of flags) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith('--')) {
      throw new Error(`Disallowed extra flag "${trimmed}": flags must start with "--".`);
    }
    const eqIndex = trimmed.indexOf('=');
    const flagName = eqIndex === -1 ? trimmed : trimmed.slice(0, eqIndex);
    if (!ALLOWED_EXTRA_FLAGS.has(flagName)) {
      throw new Error(
        `Disallowed extra flag "${flagName}". Allowed flags: ${Array.from(ALLOWED_EXTRA_FLAGS).join(', ')}`,
      );
    }
    validated.push(trimmed);
  }
  return validated;
}

/**
 * Composes deterministic fingerprint-chromium command-line flags from a typed launch configuration.
 */
export function composeEngineFlags(rawOptions: EngineLaunchOptions): string[] {
  const options = EngineLaunchOptionsSchema.parse(rawOptions);
  const { fingerprint } = options;

  // fingerprint-chromium only accepts windows|macos|linux; Android profiles fall back to linux here.
  const enginePlatform = fingerprint.platform === 'android' ? 'linux' : fingerprint.platform;

  const flags: string[] = [
    `--user-data-dir=${options.userDataDir}`,
    `--fingerprint=${fingerprint.seed}`,
    `--fingerprint-platform=${enginePlatform}`,
    `--fingerprint-platform-version=${fingerprint.platformVersion}`,
    `--fingerprint-brand=${fingerprint.brand}`,
    `--fingerprint-brand-version=${fingerprint.brandVersion}`,
    `--fingerprint-hardware-concurrency=${fingerprint.hardware.cpuCores}`,
  ];

  if (fingerprint.platform === 'android') {
    flags.push(
      `--user-agent=Mozilla/5.0 (Linux; Android ${fingerprint.platformVersion}; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${fingerprint.brandVersion}.0.0.0 Mobile Safari/537.36`,
    );
  }

  if (fingerprint.locale.value) {
    flags.push(`--lang=${fingerprint.locale.value}`);
  }
  if (fingerprint.locale.acceptLanguage) {
    flags.push(`--accept-lang=${fingerprint.locale.acceptLanguage}`);
  } else if (fingerprint.locale.value) {
    const baseLang = fingerprint.locale.value.split('-')[0];
    const acceptLang =
      baseLang && baseLang !== fingerprint.locale.value
        ? `${fingerprint.locale.value},${baseLang}`
        : fingerprint.locale.value;
    flags.push(`--accept-lang=${acceptLang}`);
  }

  if (fingerprint.timezone.value) {
    flags.push(`--timezone=${fingerprint.timezone.value}`);
  }

  if (options.proxyServer) {
    flags.push(`--proxy-server=${options.proxyServer}`);
  }

  if (fingerprint.webrtc.mode !== 'real') {
    flags.push('--disable-non-proxied-udp');
  }

  const disabledSpoofing: string[] = [];
  if (!fingerprint.spoofing.canvas) disabledSpoofing.push('canvas');
  if (!fingerprint.spoofing.audio) disabledSpoofing.push('audio');
  if (!fingerprint.spoofing.fonts) disabledSpoofing.push('font');
  if (!fingerprint.spoofing.clientRects) disabledSpoofing.push('clientrects');
  if (!fingerprint.spoofing.gpu) disabledSpoofing.push('gpu');
  if (disabledSpoofing.length > 0) {
    flags.push(`--disable-spoofing=${disabledSpoofing.join(',')}`);
  }

  flags.push(
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-crash-restore-bubble',
    '--disable-features=Translate,MediaRouter',
  );

  if (options.windowSize) {
    flags.push(`--window-size=${options.windowSize.width},${options.windowSize.height}`);
  }

  flags.push('--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1');

  const validatedExtra = validateExtraFlags(options.extraFlags);
  flags.push(...validatedExtra);

  for (const page of options.startPages) {
    flags.push(page);
  }

  return flags;
}
