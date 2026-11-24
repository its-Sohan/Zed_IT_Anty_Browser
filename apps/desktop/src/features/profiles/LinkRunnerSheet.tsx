import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Link2,
  Loader2,
  Play,
  Square,
  XCircle,
} from 'lucide-react';
import type { LinkRunItemStatus, LinkRunState, ProfileSummary } from '@zita/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Frame, FramePanel } from '@/components/ui/frame';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toastManager } from '@/components/ui/toast';
import { zitaIpc } from '@/lib/ipc';

export interface LinkRunnerSheetProps {
  profile: ProfileSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLaunchProfile: (profileId: string) => Promise<void>;
}

const STORAGE_PREFIX = 'zita-link-runner-v1:';

interface SavedDraft {
  rawLinks: string;
  loadTimeoutSec: number;
  hangTimeoutSec: number;
  dwellAfterLoadSec: number;
  loop: boolean;
}

const DEFAULT_DRAFT: SavedDraft = {
  rawLinks: '',
  loadTimeoutSec: 25,
  hangTimeoutSec: 8,
  dwellAfterLoadSec: 1,
  loop: false,
};

function parseLinks(rawText: string): { valid: string[]; invalidLines: number[] } {
  const valid: string[] = [];
  const invalidLines: number[] = [];
  const lines = rawText.split(/\r?\n/);

  lines.forEach((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        valid.push(parsed.toString());
      } else {
        invalidLines.push(idx + 1);
      }
    } catch {
      invalidLines.push(idx + 1);
    }
  });

  return { valid, invalidLines };
}

function statusBadge(status: LinkRunItemStatus): { label: string; variant: BadgeProps['variant'] } {
  switch (status) {
    case 'pending':
      return { label: 'Queued', variant: 'secondary' };
    case 'loading':
      return { label: 'Loading', variant: 'info' };
    case 'loaded':
      return { label: 'Loaded & closed', variant: 'success' };
    case 'crashed':
      return { label: 'Snapped (closed)', variant: 'error' };
    case 'stuttered':
      return { label: 'Stuttered (closed)', variant: 'warning' };
    case 'timeout':
      return { label: 'Timed out (closed)', variant: 'warning' };
    case 'error':
      return { label: 'Error (closed)', variant: 'error' };
    case 'skipped':
      return { label: 'Stopped', variant: 'outline' };
  }
}

function StatusIcon({ status }: { status: LinkRunItemStatus }) {
  switch (status) {
    case 'loading':
      return <Loader2 className="size-3.5 shrink-0 animate-spin text-info" strokeWidth={1.75} />;
    case 'loaded':
      return <CheckCircle2 className="size-3.5 shrink-0 text-success" strokeWidth={1.75} />;
    case 'crashed':
    case 'error':
      return <XCircle className="size-3.5 shrink-0 text-destructive" strokeWidth={1.75} />;
    case 'stuttered':
    case 'timeout':
      return <AlertTriangle className="size-3.5 shrink-0 text-warning" strokeWidth={1.75} />;
    default:
      return <Clock className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />;
  }
}

export function LinkRunnerSheet({
  profile,
  open,
  onOpenChange,
  onLaunchProfile,
}: LinkRunnerSheetProps) {
  const [draft, setDraft] = useState<SavedDraft>(DEFAULT_DRAFT);
  const [runState, setRunState] = useState<LinkRunState | null>(null);
  const [busy, setBusy] = useState(false);

  const profileId = profile?.id ?? null;

  useEffect(() => {
    if (!open || !profileId) return;

    try {
      const saved = localStorage.getItem(`${STORAGE_PREFIX}${profileId}`);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<SavedDraft>;
        setDraft({
          rawLinks: typeof parsed.rawLinks === 'string' ? parsed.rawLinks : '',
          loadTimeoutSec: typeof parsed.loadTimeoutSec === 'number' ? parsed.loadTimeoutSec : 25,
          hangTimeoutSec: typeof parsed.hangTimeoutSec === 'number' ? parsed.hangTimeoutSec : 8,
          dwellAfterLoadSec:
            typeof parsed.dwellAfterLoadSec === 'number' ? parsed.dwellAfterLoadSec : 1,
          loop: Boolean(parsed.loop),
        });
      } else {
        setDraft(DEFAULT_DRAFT);
      }
    } catch {
      setDraft(DEFAULT_DRAFT);
    }

    let cancelled = false;
    void zitaIpc
      .getLinkRunStatus(profileId)
      .then((state) => {
        if (!cancelled) setRunState(state);
      })
      .catch(() => {
        // ignore initial status fetch errors
      });

    const unsub = window.zita.events.onLinkRunnerUpdated((next) => {
      if (next.profileId === profileId) {
        setRunState(next);
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [open, profileId]);

  useEffect(() => {
    if (!profileId || !open) return;
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${profileId}`, JSON.stringify(draft));
    } catch {
      // ignore storage errors
    }
  }, [draft, profileId, open]);

  const parsed = useMemo(() => parseLinks(draft.rawLinks), [draft.rawLinks]);
  const isRunning = runState?.status === 'running';

  const handleStart = async () => {
    if (!profile) return;
    if (parsed.valid.length === 0) {
      toastManager.add({
        title: 'Add at least one valid link',
        description: 'Paste one URL per line (e.g. https://example.com).',
        type: 'warning',
      });
      return;
    }

    setBusy(true);
    try {
      const loadTimeoutMs = Math.min(120, Math.max(3, Math.round(draft.loadTimeoutSec || 25))) * 1000;
      const hangTimeoutMs = Math.min(60, Math.max(2, Math.round(draft.hangTimeoutSec || 8))) * 1000;
      const dwellAfterLoadMs =
        Math.min(60, Math.max(0, Math.round(draft.dwellAfterLoadSec || 0))) * 1000;

      const state = await zitaIpc.startLinkRun({
        profileId: profile.id,
        urls: parsed.valid,
        loadTimeoutMs,
        hangTimeoutMs,
        dwellAfterLoadMs,
        loop: draft.loop,
      });
      setRunState(state);
      toastManager.add({
        title: 'Link runner started',
        description: `Opening ${parsed.valid.length} link${parsed.valid.length === 1 ? '' : 's'} sequentially.`,
        type: 'success',
      });
    } catch (err) {
      toastManager.add({
        title: 'Could not start link runner',
        description: err instanceof Error ? err.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    if (!profile) return;
    setBusy(true);
    try {
      const state = await zitaIpc.stopLinkRun(profile.id);
      setRunState(state);
      toastManager.add({ title: 'Link runner stopped', type: 'info' });
    } catch (err) {
      toastManager.add({
        title: 'Stop failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetPopup side="right" className="sm:max-w-lg">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <Link2 className="size-4 text-primary" strokeWidth={1.5} />
            <SheetTitle>Link Runner</SheetTitle>
            {isRunning && (
              <Badge variant="info" size="sm">
                Running
              </Badge>
            )}
          </div>
          <SheetDescription>
            {profile ? (
              <>
                Queue links for <span className="font-medium text-foreground">{profile.name}</span>.
                Each link opens in a new tab and automatically closes once finished loading or if it
                snaps, stutters, or times out.
              </>
            ) : (
              'Select a profile to run links.'
            )}
          </SheetDescription>
        </SheetHeader>

        <SheetPanel className="space-y-4">
          {profile && !profile.running && (
            <Alert variant="warning">
              <AlertTriangle className="size-4" strokeWidth={1.5} />
              <AlertDescription className="flex items-center justify-between gap-2">
                <span>Start this browser profile before running links.</span>
                <Button
                  size="xs"
                  variant="default"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await onLaunchProfile(profile.id);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Play className="size-3" strokeWidth={1.5} />
                  Start profile
                </Button>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="link-runner-urls">Links (one per line, up to 50)</Label>
              <span className="font-mono-tabular text-xs text-muted-foreground">
                {parsed.valid.length} valid
                {parsed.invalidLines.length > 0 ? ` • ${parsed.invalidLines.length} invalid` : ''}
              </span>
            </div>
            <Textarea
              id="link-runner-urls"
              disabled={isRunning}
              placeholder={'https://example.com/page-1\nhttps://example.com/page-2\nhttps://example.com/page-3'}
              value={draft.rawLinks}
              onChange={(e) => setDraft((prev) => ({ ...prev, rawLinks: e.target.value }))}
              className="font-mono-tabular [&_textarea]:h-36 [&_textarea]:text-xs"
            />
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="space-y-1">
              <Label htmlFor="link-runner-load-timeout" className="text-xs">
                Load timeout (s)
              </Label>
              <Input
                id="link-runner-load-timeout"
                type="number"
                min={3}
                max={120}
                disabled={isRunning}
                value={draft.loadTimeoutSec}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    loadTimeoutSec: Number(e.target.value) || 25,
                  }))
                }
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="link-runner-hang-timeout" className="text-xs">
                Stutter limit (s)
              </Label>
              <Input
                id="link-runner-hang-timeout"
                type="number"
                min={2}
                max={60}
                disabled={isRunning}
                value={draft.hangTimeoutSec}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    hangTimeoutSec: Number(e.target.value) || 8,
                  }))
                }
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="link-runner-dwell" className="text-xs">
                Close delay (s)
              </Label>
              <Input
                id="link-runner-dwell"
                type="number"
                min={0}
                max={60}
                disabled={isRunning}
                value={draft.dwellAfterLoadSec}
                onChange={(e) =>
                  setDraft((prev) => ({
                    ...prev,
                    dwellAfterLoadSec: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
            <div>
              <div className="text-xs font-medium text-foreground">Loop list continuously</div>
              <div className="text-xs text-muted-foreground">
                Restart from the first link after finishing the queue
              </div>
            </div>
            <Switch
              checked={draft.loop}
              disabled={isRunning}
              onCheckedChange={(checked) => setDraft((prev) => ({ ...prev, loop: Boolean(checked) }))}
            />
          </div>

          {runState && runState.items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">
                  Run progress {runState.cycleCount > 1 ? `(Cycle ${runState.cycleCount})` : ''}
                </span>
                <span className="font-mono-tabular text-muted-foreground">
                  {runState.items.filter((i) => i.status === 'loaded').length}/{runState.items.length}{' '}
                  loaded
                </span>
              </div>
              <Frame>
                <FramePanel className="divide-y divide-border/60 p-0">
                  {runState.items.map((item) => {
                    const badge = statusBadge(item.status);
                    return (
                      <div
                        key={`${item.index}-${item.url}`}
                        className="flex items-start justify-between gap-2 px-3 py-2 text-xs"
                      >
                        <div className="flex min-w-0 items-start gap-2">
                          <div className="mt-0.5">
                            <StatusIcon status={item.status} />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-mono-tabular text-foreground">
                              {item.url}
                            </div>
                            {item.reason && (
                              <div className="text-xs text-muted-foreground">{item.reason}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {item.durationMs !== null && (
                            <span className="font-mono-tabular text-xs text-muted-foreground">
                              {(item.durationMs / 1000).toFixed(1)}s
                            </span>
                          )}
                          <Badge size="sm" variant={badge.variant}>
                            {badge.label}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </FramePanel>
              </Frame>
            </div>
          )}
        </SheetPanel>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {isRunning ? (
            <Button variant="destructive-outline" disabled={busy} onClick={() => void handleStop()}>
              <Square className="size-3.5" strokeWidth={1.5} />
              Stop runner
            </Button>
          ) : (
            <Button
              disabled={busy || !profile?.running || parsed.valid.length === 0}
              onClick={() => void handleStart()}
            >
              <Play className="size-3.5" strokeWidth={1.5} />
              Run {parsed.valid.length > 0 ? `${parsed.valid.length} links` : 'links'}
            </Button>
          )}
        </SheetFooter>
      </SheetPopup>
    </Sheet>
  );
}
