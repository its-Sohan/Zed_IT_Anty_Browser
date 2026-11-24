import { useMemo, useState } from 'react';
import { Copy, Download, FlaskConical, Play, ScanSearch } from 'lucide-react';
import type { EngineStatus, LabCheckResult, Platform, ProfilesOverview, ProxySummary } from '@zita/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RouteEmptyArt } from '@/components/ui/empty-art';
import {
  Card,
  CardAction,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from '@/components/ui/card';
import {
  Page,
  PageActions,
  PageBody,
  PageHeading,
  PageHeader,
  PageTitle,
} from '@/components/ui/page';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toastManager } from '@/components/ui/toast';
import { zitaIpc } from '@/lib/ipc';

export interface LabPageProps {
  engine: EngineStatus | undefined;
  overview: ProfilesOverview | undefined;
  proxies: ProxySummary[];
  initialProfileId?: string;
}

const TEMP_PROFILE_VALUE = '__temp__';
const DIRECT_PROXY_VALUE = '__direct__';

const OS_ITEMS: Array<{ value: Platform; label: string }> = [
  { value: 'windows', label: 'Windows' },
  { value: 'macos', label: 'macOS' },
  { value: 'linux', label: 'Linux' },
  { value: 'android', label: 'Android' },
];

export function LabPage({ engine, overview, proxies, initialProfileId }: LabPageProps) {
  const [selectedProfileId, setSelectedProfileId] = useState<string>(initialProfileId ?? '');
  const [tempOs, setTempOs] = useState<Platform>('windows');
  const [tempProxyId, setTempProxyId] = useState<string>('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LabCheckResult | null>(null);

  const profileItems = useMemo(
    () => [
      { value: TEMP_PROFILE_VALUE, label: 'Temporary lab config...' },
      ...(overview?.profiles ?? []).map((p) => ({
        value: p.id,
        label: `${p.name} (${p.os})`,
      })),
    ],
    [overview?.profiles],
  );

  const proxyItems = useMemo(
    () => [
      { value: DIRECT_PROXY_VALUE, label: 'Direct (No proxy)' },
      ...proxies.map((px) => ({ value: px.id, label: px.label })),
    ],
    [proxies],
  );

  const handleRunCheck = async () => {
    setRunning(true);
    try {
      let res: LabCheckResult;
      if (selectedProfileId) {
        res = await zitaIpc.runLabCheck({ profileId: selectedProfileId });
      } else {
        const fp = await zitaIpc.generateFingerprint({ os: tempOs });
        res = await zitaIpc.runLabCheck({
          fingerprint: fp,
          proxyId: tempProxyId || null,
        });
      }
      setResult(res);
      toastManager.add({
        title: `Lab capture complete (${res.launchDurationMs} ms)`,
        type: 'success',
      });
    } catch (err) {
      toastManager.add({
        title: 'Lab check failed',
        description: err instanceof Error ? err.message : 'Unable to launch lab browser',
        type: 'error',
      });
    } finally {
      setRunning(false);
    }
  };

  const handleCopyReport = () => {
    if (!result) return;
    void navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    toastManager.add({ title: 'Lab report JSON copied', type: 'info' });
  };

  const handleDownloadReport = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `zita-lab-report-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const statusVariant = (status: 'pass' | 'warn' | 'fail' | 'unsupported') => {
    if (status === 'pass') return 'success' as const;
    if (status === 'fail') return 'error' as const;
    if (status === 'warn') return 'warning' as const;
    return 'secondary' as const;
  };

  const statusLabel = (status: 'pass' | 'warn' | 'fail' | 'unsupported') => {
    if (status === 'unsupported') return 'Not spoofed in v1 engine';
    return status.toUpperCase();
  };

  return (
    <Page>
      <PageHeader>
        <PageHeading>
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <FlaskConical className="size-4" strokeWidth={1.5} />
          </span>
          <PageTitle>Fingerprint Lab</PageTitle>
          <Badge variant={engine?.installed ? 'success' : 'warning'}>
            <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
            {engine?.installed ? `Engine ${engine.pinnedVersion} ready` : 'Engine missing'}
          </Badge>
        </PageHeading>

        <PageActions>
          <Select
            items={profileItems}
            value={selectedProfileId || TEMP_PROFILE_VALUE}
            onValueChange={(val) =>
              setSelectedProfileId(val === TEMP_PROFILE_VALUE || !val ? '' : val)
            }
          >
            <SelectTrigger size="sm" className="w-44" aria-label="Target profile for lab check">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {profileItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>

          {!selectedProfileId && (
            <>
              <Select
                items={OS_ITEMS}
                value={tempOs}
                onValueChange={(val) => {
                  if (val) setTempOs(val as Platform);
                }}
              >
                <SelectTrigger size="sm" className="w-28 min-w-0" aria-label="Temporary OS">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {OS_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>

              <Select
                items={proxyItems}
                value={tempProxyId || DIRECT_PROXY_VALUE}
                onValueChange={(val) =>
                  setTempProxyId(val === DIRECT_PROXY_VALUE || !val ? '' : val)
                }
              >
                <SelectTrigger size="sm" className="w-36" aria-label="Temporary Proxy">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {proxyItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </>
          )}

          <Button
            size="sm"
            variant="default"
            disabled={running || !engine?.installed}
            onClick={() => void handleRunCheck()}
          >
            <Play className="size-3.5" strokeWidth={1.5} />
            {running ? 'Capturing...' : 'Run Lab Check'}
          </Button>
        </PageActions>
      </PageHeader>

      <ScrollArea className="min-h-0 flex-1">
        <PageBody className="mx-auto max-w-5xl gap-4">
          {result ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Expected vs Observed Capture</CardTitle>
                  <CardDescription>
                    Captured {result.capturedAt} in {result.launchDurationMs} ms (seed{' '}
                    {result.expected.seed}).
                  </CardDescription>
                </div>
                <CardAction className="gap-2">
                  <Button size="sm" variant="outline" onClick={handleCopyReport}>
                    <Copy className="size-3.5" strokeWidth={1.5} />
                    Copy JSON
                  </Button>
                  <Button size="sm" variant="secondary" onClick={handleDownloadReport}>
                    <Download className="size-3.5" strokeWidth={1.5} />
                    Export Report
                  </Button>
                </CardAction>
              </CardHeader>
              <CardPanel className="overflow-hidden border-t p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="px-3">Signal</TableHead>
                      <TableHead className="px-3">Expected</TableHead>
                      <TableHead className="px-3">Observed</TableHead>
                      <TableHead className="px-3">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.diff.map((row) => (
                      <TableRow key={row.signal} className="align-top">
                        <TableCell className="whitespace-normal px-3 py-2.5">
                          <div className="font-medium text-foreground">{row.signal}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {row.explanation}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono-tabular whitespace-normal px-3 py-2.5 text-xs text-muted-foreground">
                          {row.expected}
                        </TableCell>
                        <TableCell className="font-mono-tabular max-w-xs break-all whitespace-normal px-3 py-2.5 text-xs text-foreground">
                          {row.observed}
                        </TableCell>
                        <TableCell className="px-3 py-2.5">
                          <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardPanel>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>See what sites see</CardTitle>
                <CardDescription>
                  Click Run Lab Check to launch an isolated{' '}
                  {engine?.pinnedVersion ?? '150.0.7871.186'} browser against the local diagnostic
                  probe and compare expected vs observed values.
                </CardDescription>
              </CardHeader>
              <CardPanel className="space-y-5">
                <div className="flex justify-center">
                  <RouteEmptyArt icon={FlaskConical} badge={ScanSearch} tone="primary" />
                </div>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>
                    • Supported & verified: OS platform, Client Hints, CPU cores, timezone, language,
                    WebRTC host-IP block, and deterministic Canvas / Audio / ClientRects / Fonts
                    hashes.
                  </p>
                  <p>• Seed-derived in v1: WebGL vendor/renderer and Device Memory.</p>
                  <p>
                    • Explicitly unspoofed in v1 (shown honestly, never faked): host{' '}
                    <code className="font-mono-tabular">screen.*</code> and{' '}
                    <code className="font-mono-tabular">navigator.mediaDevices</code>.
                  </p>
                </div>
              </CardPanel>
            </Card>
          )}
        </PageBody>
      </ScrollArea>
    </Page>
  );
}
