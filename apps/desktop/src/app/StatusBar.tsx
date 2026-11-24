import type { AppInfo, LicenseState, ProfilesOverview } from '@zita/shared';
import { Button } from '@/components/ui/button';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';

export interface StatusBarProps {
  appInfo: AppInfo | undefined;
  overview: ProfilesOverview | undefined;
  license: LicenseState | undefined;
  onOpenCommandPalette: () => void;
  onOpenEngineSettings: () => void;
  onOpenLicenseSettings: () => void;
}

export function StatusBar({
  appInfo,
  overview,
  license,
  onOpenCommandPalette,
  onOpenEngineSettings,
  onOpenLicenseSettings,
}: StatusBarProps) {
  const totalProfiles = overview?.counts.all ?? 0;
  const runningProfiles = overview?.counts.running ?? 0;
  const maxProfiles = license?.maxProfiles ?? 5;
  const planLabel = license?.plan ? license.plan.toUpperCase() : 'UNACTIVATED';
  const hasGrace =
    license && (license.status === 'active' || license.status === 'trial')
      ? `${license.offlineDaysRemaining}d grace`
      : null;

  const statusButton =
    'gap-1.5 px-2 text-xs font-normal text-muted-foreground hover:text-foreground';

  return (
    <footer className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-border/80 bg-muted/40 px-2 text-xs text-muted-foreground select-none">
      <div className="flex min-w-0 items-center gap-1">
        <Button
          variant="ghost"
          size="xs"
          onClick={onOpenEngineSettings}
          className={statusButton}
        >
          <span
            aria-hidden="true"
            className={`size-1.5 rounded-full ${appInfo?.engineInstalled ? 'bg-success' : 'bg-warning'}`}
          />
          {appInfo?.engineInstalled
            ? `Engine ${appInfo.engineVersion} ready`
            : `Engine ${appInfo?.engineVersion ?? '150.0.7871.186'} missing`}
        </Button>

        <Separator orientation="vertical" className="h-3.5 opacity-60" />

        <Button
          variant="ghost"
          size="xs"
          onClick={onOpenLicenseSettings}
          className={`${statusButton} type-numeric`}
        >
          <span className="font-medium text-foreground/80">{planLabel}</span>
          <span aria-hidden="true" className="text-muted-foreground/40">
            ·
          </span>
          {totalProfiles}/{maxProfiles} profiles
          <span aria-hidden="true" className="text-muted-foreground/40">
            ·
          </span>
          {runningProfiles} running
          {hasGrace && (
            <>
              <span aria-hidden="true" className="text-muted-foreground/40">
                ·
              </span>
              {hasGrace}
            </>
          )}
        </Button>
      </div>

      <Button
        variant="ghost"
        size="xs"
        onClick={onOpenCommandPalette}
        className={statusButton}
      >
        <span>Command palette</span>
        <KbdGroup>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </Button>
    </footer>
  );
}
