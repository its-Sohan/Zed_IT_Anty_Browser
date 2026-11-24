import type { LicensePlan, LicenseState } from '@zita/shared';
import type { SecretBox } from '../crypto/secrets.js';
import type { ZitaDatabase } from '../db/index.js';
import { getMachineHash } from './machine.js';

export const UNLIMITED_PROFILES = 999999;

export const PLAN_LIMITS: Record<LicensePlan, { profiles: number; devices: number; concurrent: number }> = {
  trial: { profiles: UNLIMITED_PROFILES, devices: UNLIMITED_PROFILES, concurrent: UNLIMITED_PROFILES },
  starter: { profiles: UNLIMITED_PROFILES, devices: UNLIMITED_PROFILES, concurrent: UNLIMITED_PROFILES },
  pro: { profiles: UNLIMITED_PROFILES, devices: UNLIMITED_PROFILES, concurrent: UNLIMITED_PROFILES },
  agency: { profiles: UNLIMITED_PROFILES, devices: UNLIMITED_PROFILES, concurrent: UNLIMITED_PROFILES },
  enterprise: { profiles: UNLIMITED_PROFILES, devices: UNLIMITED_PROFILES, concurrent: UNLIMITED_PROFILES },
};

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
 * Licensing has been removed: the app is fully unlocked.
 * This class is kept only as a compatibility stub so existing IPC
 * channels / call sites keep working. Every check passes and every
 * method returns an unlimited, active state. No network calls.
 */
export class LicenseService {
  constructor(private readonly opts: LicenseServiceOptions) {}

  getMachineHash(): string {
    return getMachineHash(this.opts.storageRoot);
  }

  getState(): LicenseState {
    return {
      status: 'active',
      plan: 'enterprise',
      maxProfiles: UNLIMITED_PROFILES,
      maxDevices: UNLIMITED_PROFILES,
      expiresAt: null,
      offlineDaysRemaining: UNLIMITED_PROFILES,
      keyMasked: null,
      canLaunch: true,
      aupAccepted: true,
      machineHashPrefix: this.getMachineHash().slice(0, 18),
    };
  }

  startTrial(_aupAccepted?: boolean): LicenseState {
    return this.getState();
  }

  async activate(_input: { key: string; aupAccepted: boolean; serverUrl?: string; appVersion?: string }): Promise<LicenseState> {
    return this.getState();
  }

  async revalidate(_serverUrl?: string): Promise<LicenseState> {
    return this.getState();
  }

  async deactivate(_serverUrl?: string): Promise<LicenseState> {
    return this.getState();
  }

  assertCanCreateProfile(_currentStoredCount?: number): void {
    // No limits.
  }

  assertCanLaunch(): { allowed: boolean; reason?: string } {
    return { allowed: true };
  }
}
