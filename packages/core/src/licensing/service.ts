import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { LicensePlan, LicenseState } from '@zita/shared';
import type { SecretBox } from '../crypto/secrets.js';
import { licenses, settings, type ZitaDatabase } from '../db/index.js';
import { verifyLicenseToken } from './jwt.js';
import { maskLicenseKey, normalizeLicenseKey, validateLicenseKey } from './keys.js';
import { getMachineHash } from './machine.js';

export const PLAN_LIMITS: Record<LicensePlan, { profiles: number; devices: number; concurrent: number }> = {
  trial: { profiles: 5, devices: 1, concurrent: 3 },
  starter: { profiles: 10, devices: 1, concurrent: 999 },
  pro: { profiles: 50, devices: 2, concurrent: 999 },
  agency: { profiles: 200, devices: 5, concurrent: 999 },
  enterprise: { profiles: 500, devices: 10, concurrent: 999 },
};

const OFFLINE_GRACE_MS = 14 * 24 * 60 * 60 * 1000;
const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export interface LicenseServiceOptions {
  database: ZitaDatabase;
  storageRoot: string;
  secretBox: SecretBox;
  publicKeyPem: string;
  defaultServerUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/**
 * Local-first license service managing 7-day device trials, ES256 signed keys, 14-day offline grace,
 * and clock rollback protection.
 */
export class LicenseService {
  private readonly now: () => number;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultServerUrl: string;

  constructor(private readonly opts: LicenseServiceOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.defaultServerUrl = opts.defaultServerUrl ?? 'https://license.zedit.app';
  }

  private getSetting(key: string): string | null {
    const row = this.opts.database.db.select().from(settings).where(eq(settings.key, key)).get();
    return row?.value ?? null;
  }

  private setSetting(key: string, value: string): void {
    const nowIso = new Date(this.now()).toISOString();
    this.opts.database.db
      .insert(settings)
      .values({ key, value, updatedAt: nowIso })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, updatedAt: nowIso },
      })
      .run();
  }

  private updateLastSeenTime(timestampMs: number): void {
    const prevRaw = this.getSetting('licenseLastSeenMs');
    const prev = prevRaw ? Number(prevRaw) : 0;
    if (timestampMs > prev) {
      this.setSetting('licenseLastSeenMs', String(timestampMs));
    }
  }

  private hasClockTamper(): boolean {
    const prevRaw = this.getSetting('licenseLastSeenMs');
    if (!prevRaw) return false;
    const prev = Number(prevRaw);
    // Allow 5-minute clock drift tolerance before flagging rollback
    return this.now() + 5 * 60 * 1000 < prev;
  }

  getMachineHash(): string {
    return getMachineHash(this.opts.storageRoot);
  }

  getState(): LicenseState {
    const machineHash = this.getMachineHash();
    const aupAccepted = this.getSetting('aupAccepted') === 'true';
    const currentMs = this.now();

    if (this.hasClockTamper()) {
      return {
        status: 'clock_tampered',
        plan: null,
        maxProfiles: 0,
        maxDevices: 0,
        expiresAt: null,
        offlineDaysRemaining: 0,
        keyMasked: null,
        canLaunch: false,
        aupAccepted,
        machineHashPrefix: machineHash.slice(0, 18),
      };
    }

    const cached = this.opts.database.db.select().from(licenses).limit(1).get();
    if (cached) {
      try {
        const token = this.opts.secretBox.decrypt(cached.tokenEnc);
        const claims = verifyLicenseToken(token, this.opts.publicKeyPem);
        if (claims.machine !== machineHash) {
          return {
            status: 'revoked',
            plan: null,
            maxProfiles: 0,
            maxDevices: 0,
            expiresAt: null,
            offlineDaysRemaining: 0,
            keyMasked: claims.key,
            canLaunch: false,
            aupAccepted,
            machineHashPrefix: machineHash.slice(0, 18),
          };
        }

        const expiresMs = claims.exp * 1000;
        const lastValidatedMs = Date.parse(cached.lastValidatedAt);
        const graceUntilMs = lastValidatedMs + OFFLINE_GRACE_MS;
        const offlineDaysRemaining = Math.max(0, Math.ceil((graceUntilMs - currentMs) / (24 * 60 * 60 * 1000)));
        const expired = currentMs >= expiresMs || currentMs >= graceUntilMs;

        this.updateLastSeenTime(currentMs);
        const plan = (claims.plan as LicensePlan) in PLAN_LIMITS ? (claims.plan as LicensePlan) : 'pro';

        return {
          status: expired ? 'expired' : 'active',
          plan,
          maxProfiles: claims.profiles,
          maxDevices: claims.devices,
          expiresAt: new Date(expiresMs).toISOString(),
          offlineDaysRemaining,
          keyMasked: claims.key,
          canLaunch: !expired,
          aupAccepted,
          machineHashPrefix: machineHash.slice(0, 18),
        };
      } catch {
        return {
          status: 'revoked',
          plan: null,
          maxProfiles: 0,
          maxDevices: 0,
          expiresAt: null,
          offlineDaysRemaining: 0,
          keyMasked: null,
          canLaunch: false,
          aupAccepted,
          machineHashPrefix: machineHash.slice(0, 18),
        };
      }
    }

    const trialStartedRaw = this.getSetting('trialStartedAt');
    if (trialStartedRaw) {
      const trialExpiresMs = Date.parse(trialStartedRaw) + TRIAL_DURATION_MS;
      const expired = currentMs >= trialExpiresMs;
      const daysLeft = Math.max(0, Math.ceil((trialExpiresMs - currentMs) / (24 * 60 * 60 * 1000)));
      this.updateLastSeenTime(currentMs);
      return {
        status: expired ? 'expired' : 'trial',
        plan: 'trial',
        maxProfiles: PLAN_LIMITS.trial.profiles,
        maxDevices: PLAN_LIMITS.trial.devices,
        expiresAt: new Date(trialExpiresMs).toISOString(),
        offlineDaysRemaining: daysLeft,
        keyMasked: null,
        canLaunch: !expired,
        aupAccepted,
        machineHashPrefix: machineHash.slice(0, 18),
      };
    }

    return {
      status: 'unactivated',
      plan: null,
      maxProfiles: PLAN_LIMITS.trial.profiles,
      maxDevices: 1,
      expiresAt: null,
      offlineDaysRemaining: 0,
      keyMasked: null,
      canLaunch: false,
      aupAccepted,
      machineHashPrefix: machineHash.slice(0, 18),
    };
  }

  startTrial(aupAccepted: boolean): LicenseState {
    if (!aupAccepted) {
      throw new Error('You must accept the Acceptable Use Policy to start a trial');
    }
    const existing = this.getSetting('trialStartedAt');
    if (existing) {
      throw new Error('A free trial has already been used on this device');
    }
    const nowIso = new Date(this.now()).toISOString();
    this.setSetting('aupAccepted', 'true');
    this.setSetting('trialStartedAt', nowIso);
    this.updateLastSeenTime(this.now());
    return this.getState();
  }

  async activate(input: {
    key: string;
    aupAccepted: boolean;
    serverUrl?: string;
    appVersion?: string;
  }): Promise<LicenseState> {
    if (!input.aupAccepted) {
      throw new Error('You must accept the Acceptable Use Policy before activating');
    }
    const normalizedKey = normalizeLicenseKey(input.key);
    if (!validateLicenseKey(normalizedKey)) {
      throw new Error('Invalid license key checksum. Check for typos and try again.');
    }

    const machineHash = this.getMachineHash();
    const baseUrl = (input.serverUrl ?? this.defaultServerUrl).replace(/\/+$/, '');

    const res = await this.fetchImpl(`${baseUrl}/v1/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key: normalizedKey,
        machineHash,
        appVersion: input.appVersion ?? '0.1.0',
        os: process.platform,
      }),
    });

    const data = (await res.json()) as { token?: string; error?: string };
    if (!res.ok || !data.token) {
      throw new Error(data.error ?? `Activation failed (HTTP ${res.status})`);
    }

    const claims = verifyLicenseToken(data.token, this.opts.publicKeyPem);
    if (claims.machine !== machineHash) {
      throw new Error('Activated token machine hash does not match this device');
    }

    const keyHash = createHash('sha256').update(normalizedKey).digest('hex');
    const nowIso = new Date(this.now()).toISOString();
    const tokenEnc = this.opts.secretBox.encrypt(data.token);

    this.opts.database.db.delete(licenses).run();
    this.opts.database.db
      .insert(licenses)
      .values({
        keyHash,
        tokenEnc,
        plan: claims.plan,
        expiresAt: new Date(claims.exp * 1000).toISOString(),
        lastValidatedAt: nowIso,
        machineHash,
        updatedAt: nowIso,
      })
      .run();

    this.setSetting('aupAccepted', 'true');
    this.setSetting('activeLicenseKeyMask', maskLicenseKey(normalizedKey));
    this.updateLastSeenTime(this.now());
    return this.getState();
  }

  async revalidate(serverUrl?: string): Promise<LicenseState> {
    const cached = this.opts.database.db.select().from(licenses).limit(1).get();
    if (!cached) {
      return this.getState();
    }
    const token = this.opts.secretBox.decrypt(cached.tokenEnc);
    const machineHash = this.getMachineHash();
    const baseUrl = (serverUrl ?? this.defaultServerUrl).replace(/\/+$/, '');

    const res = await this.fetchImpl(`${baseUrl}/v1/validate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token, machineHash }),
    });

    const data = (await res.json()) as { token?: string; revoked?: boolean; error?: string };
    if (res.status === 403 || data.revoked) {
      this.opts.database.db.delete(licenses).run();
      throw new Error(data.error ?? 'License has been revoked');
    }
    if (!res.ok || !data.token) {
      throw new Error(data.error ?? `Validation failed (HTTP ${res.status})`);
    }

    const claims = verifyLicenseToken(data.token, this.opts.publicKeyPem);
    const nowIso = new Date(this.now()).toISOString();
    this.opts.database.db
      .update(licenses)
      .set({
        tokenEnc: this.opts.secretBox.encrypt(data.token),
        plan: claims.plan,
        expiresAt: new Date(claims.exp * 1000).toISOString(),
        lastValidatedAt: nowIso,
        updatedAt: nowIso,
      })
      .where(eq(licenses.keyHash, cached.keyHash))
      .run();

    this.updateLastSeenTime(this.now());
    return this.getState();
  }

  async deactivate(serverUrl?: string): Promise<LicenseState> {
    const cached = this.opts.database.db.select().from(licenses).limit(1).get();
    if (cached) {
      const token = this.opts.secretBox.decrypt(cached.tokenEnc);
      const machineHash = this.getMachineHash();
      const baseUrl = (serverUrl ?? this.defaultServerUrl).replace(/\/+$/, '');
      try {
        await this.fetchImpl(`${baseUrl}/v1/deactivate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token, machineHash }),
        });
      } catch {
        // Allow local cleanup even if server is unreachable
      }
      this.opts.database.db.delete(licenses).where(eq(licenses.keyHash, cached.keyHash)).run();
    }
    return this.getState();
  }

  assertCanCreateProfile(currentStoredCount: number): void {
    const state = this.getState();
    if (state.status === 'unactivated') {
      throw new Error('Activate a license or start your 7-day trial before creating profiles.');
    }
    if (state.status === 'expired' || state.status === 'revoked' || state.status === 'clock_tampered') {
      throw new Error(`License status "${state.status}" is read-only. Renew or reactivate to create profiles.`);
    }
    if (currentStoredCount >= state.maxProfiles) {
      throw new Error(`Profile limit reached (${currentStoredCount}/${state.maxProfiles} on ${state.plan} plan).`);
    }
  }

  assertCanLaunch(): { allowed: boolean; reason?: string } {
    const state = this.getState();
    if (!state.canLaunch) {
      return {
        allowed: false,
        reason:
          state.status === 'unactivated'
            ? 'Start a 7-day trial or activate a license key to launch browser profiles.'
            : `Launching is disabled (${state.status}). Renew or revalidate your license in Settings.`,
      };
    }
    return { allowed: true };
  }
}
