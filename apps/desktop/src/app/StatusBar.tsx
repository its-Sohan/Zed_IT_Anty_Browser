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

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t bg-card px-2 text-xs text-muted-foreground select-none">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="xs"
          onClick={onOpenEngineSettings}
          className="gap-1.5 font-mono-tabular text-xs text-muted-foreground hover:text-foreground"
        >
          <span
            aria-hidden="true"
            className="size-1.5 rounded-full"
            style={{ backgroundColor: appInfo?.engineInstalled ? '#22C55E' : '#F59E0B' }}
          />
          {appInfo?.engineInstalled
            ? `Engine ${appInfo.engineVersion} ready`
            : `Engine ${appInfo?.engineVersion ?? '150.0.7871.186'} missing`}
        </Button>

        <Separator orientation="vertical" className="h-3.5" />

        <Button
          variant="ghost"
          size="xs"
          onClick={onOpenLicenseSettings}
          className="font-mono-tabular text-xs text-muted-foreground hover:text-foreground"
        >
          {planLabel} • {totalProfiles}/{maxProfiles} profiles • {runningProfiles} running
          {license && (license.status === 'active' || license.status === 'trial')
            ? ` • ${license.offlineDaysRemaining}d grace`
            : ''}
        </Button>
      </div>

      <Button
        variant="ghost"
        size="xs"
        onClick={onOpenCommandPalette}
        className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
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
