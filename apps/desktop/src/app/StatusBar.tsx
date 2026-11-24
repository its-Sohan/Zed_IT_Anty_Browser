import type { AppInfo, ProfilesOverview } from '@zita/shared';
import { Button } from '@/components/ui/button';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { Separator } from '@/components/ui/separator';

export interface StatusBarProps {
  appInfo: AppInfo | undefined;
  overview: ProfilesOverview | undefined;
  onOpenCommandPalette: () => void;
  onOpenEngineSettings: () => void;
}

export function StatusBar({ appInfo, overview, onOpenCommandPalette, onOpenEngineSettings }: StatusBarProps) {
  const totalProfiles = overview?.counts.all ?? 0;
  const runningProfiles = overview?.counts.running ?? 0;
  const statusButton = 'gap-1.5 px-2 text-xs font-normal text-muted-foreground hover:text-foreground';
  return (
    <footer className="flex h-9 shrink-0 items-center justify-between gap-2 border-t border-border/80 bg-background px-3 text-xs text-muted-foreground select-none">
      <div className="flex min-w-0 items-center gap-1">
        <Button variant="ghost" size="xs" onClick={onOpenEngineSettings} className={`${statusButton} max-w-56`}>
          <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${appInfo?.engineInstalled ? 'bg-success' : 'bg-warning'}`} />
          <span className="truncate">
            {appInfo?.engineInstalled ? `Engine ${appInfo.engineVersion} ready` : `Engine ${appInfo?.engineVersion ?? '150.0.7871.186'} missing`}
          </span>
        </Button>
        <Separator orientation="vertical" className="h-3.5 opacity-60" />
        <span className="type-numeric flex items-center gap-1.5 truncate px-2">
          {totalProfiles} profiles
          <span aria-hidden="true" className="text-muted-foreground/40">·</span>
          {runningProfiles} running
        </span>
      </div>
      <Button variant="ghost" size="xs" onClick={onOpenCommandPalette} className={statusButton}>
        <span>Command palette</span>
        <KbdGroup><Kbd>Ctrl</Kbd><Kbd>K</Kbd></KbdGroup>
      </Button>
    </footer>
  );
}
