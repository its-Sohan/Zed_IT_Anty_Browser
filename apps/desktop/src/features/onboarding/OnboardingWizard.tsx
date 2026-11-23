import { useState } from 'react';
import { CheckCircle2, KeyRound, ShieldCheck } from 'lucide-react';
import type { EngineStatus, LicenseState } from '@zita/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { toastManager } from '@/components/ui/toast';
import { zitaIpc } from '@/lib/ipc';

export interface OnboardingWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  license: LicenseState | undefined;
  engine: EngineStatus | undefined;
  onCompleted: () => void;
}

export function OnboardingWizard({
  open,
  onOpenChange,
  license,
  engine,
  onCompleted,
}: OnboardingWizardProps) {
  const [aupAccepted, setAupAccepted] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartTrial = async () => {
    setError(null);
    setBusy(true);
    try {
      await zitaIpc.startTrial(aupAccepted);
      toastManager.add({
        title: '7-day trial activated',
        description: 'Up to 5 local profiles unlocked. Create your first profile now.',
        type: 'success',
      });
      onCompleted();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start trial');
    } finally {
      setBusy(false);
    }
  };

  const handleActivateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await zitaIpc.activateLicense({
        key: licenseKey,
        aupAccepted,
        serverUrl: serverUrl.trim() || undefined,
      });
      toastManager.add({
        title: 'License activated',
        description: 'Device bound and signed token stored locally.',
        type: 'success',
      });
      onCompleted();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'License activation failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <ShieldCheck className="size-4.5" strokeWidth={1.5} />
            </div>
            <div>
              <DialogTitle>Welcome to Zed IT Anti Browser</DialogTitle>
              <DialogDescription>
                Blend in. Scale out. Start your 7-day trial or activate a license key.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogPanel className="space-y-4">
          <div className="space-y-2 rounded-lg border bg-muted/40 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Browser engine</span>
              <Badge variant={engine?.installed ? 'success' : 'warning'}>
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-current"
                />
                {engine?.installed ? `Chromium ${engine.pinnedVersion} ready` : 'Not installed'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Device fingerprint ID</span>
              <span className="font-mono-tabular text-foreground">
                {license?.machineHashPrefix ?? 'sha256:...'}
              </span>
            </div>
          </div>

          <Field>
            <FieldLabel className="w-full cursor-pointer items-start gap-2.5 rounded-lg border bg-muted/30 p-3 text-xs leading-relaxed font-normal text-muted-foreground">
              <Checkbox
                checked={aupAccepted}
                onCheckedChange={(checked) => setAupAccepted(Boolean(checked))}
                className="mt-0.5"
              />
              <span>
                I accept the <strong className="font-medium text-foreground">Acceptable Use Policy</strong>: this tool is for legitimate multi-account operations, QA, ad verification, and privacy — never fraud, account takeover, or spam.
              </span>
            </FieldLabel>
          </Field>

          {error && (
            <Alert variant="error">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleActivateKey} className="space-y-2.5 border-t pt-4">
            <Field>
              <FieldLabel htmlFor="onboard-key">Have a license key?</FieldLabel>
              <div className="flex w-full gap-2">
                <Input
                  id="onboard-key"
                  value={licenseKey}
                  onChange={(e) => setLicenseKey(e.target.value)}
                  placeholder="ZITA-7F3K-9Q2M-XB4T"
                  pattern="^ZITA-[0-9A-Za-z]{4}-[0-9A-Za-z]{4}-[0-9A-Za-z]{4}$"
                  className="font-mono-tabular uppercase"
                />
                <Button type="submit" variant="secondary" disabled={busy || !licenseKey.trim()}>
                  <KeyRound className="size-3.5" strokeWidth={1.5} />
                  Activate
                </Button>
              </div>
            </Field>
            <Input
              size="sm"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="License server URL (optional, default https://license.zedit.app)"
              aria-label="License server URL"
            />
          </form>
        </DialogPanel>

        <DialogFooter variant="bare" className="justify-between border-t">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Explore read-only
          </Button>
          <Button variant="default" disabled={busy || !aupAccepted} onClick={handleStartTrial}>
            <CheckCircle2 className="size-4" strokeWidth={1.5} />
            Start 7-day trial (5 profiles)
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
