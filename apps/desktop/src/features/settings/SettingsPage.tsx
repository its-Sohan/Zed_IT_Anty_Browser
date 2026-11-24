import { useEffect, useState } from 'react';
import {
  Download,
  ExternalLink,
  Monitor,
  Moon,
  ShieldAlert,
  Sun,
} from 'lucide-react';
import type {
  AppInfo,
  AppSettings,
  DensityPreference,
  EngineStatus,
  ThemePreference,
  UpdateSettingsInput,
} from '@zita/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from '@/components/ui/card';
import { CodeBlock, MetaRow } from '@/components/ui/meta';
import {
  Page,
  PageBody,
  PageHeading,
  PageHeader,
  PageTitle,
} from '@/components/ui/page';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SegmentedControl, SegmentedControlItem } from '@/components/ui/segmented-control';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs';
import { toastManager } from '@/components/ui/toast';
import { useMediaQuery } from '@/hooks/use-media-query';
import { zitaIpc } from '@/lib/ipc';
import { getSystemColorScheme } from '@/lib/theme';

export type SettingsTab = 'general' | 'engine' | 'appearance' | 'about';

export interface SettingsPageProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  settings: AppSettings | undefined;
  appInfo: AppInfo | undefined;
  engine: EngineStatus | undefined;
  onUpdateSettings: (patch: UpdateSettingsInput) => void;
  isSaving: boolean;
  onOpenExternal: (url: string) => void;
}

function downloadTextFile(filename: string, content: string, mime = 'application/json') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function SettingsPage({
  activeTab,
  onTabChange,
  settings,
  appInfo,
  engine,
  onUpdateSettings,
  isSaving,
  onOpenExternal,
}: SettingsPageProps) {
  const isWide = useMediaQuery({ min: 1100 });
  const [systemScheme, setSystemScheme] = useState<'dark' | 'light'>(() => getSystemColorScheme());
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemScheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const currentTheme: ThemePreference = settings?.theme ?? 'system';
  const currentDensity: DensityPreference = settings?.density ?? 'comfortable';

  const themeOptions: Array<{ value: ThemePreference; label: string; icon: typeof Monitor }> = [
    { value: 'system', label: `System (Currently ${systemScheme})`, icon: Monitor },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'light', label: 'Light', icon: Sun },
  ];

  const handleExportData = async (format: 'json' | 'csv') => {
    try {
      const res = await zitaIpc.exportProfilesData(format);
      downloadTextFile(
        res.filename,
        res.content,
        format === 'json' ? 'application/json' : 'text/csv',
      );
      toastManager.add({ title: `Exported ${res.filename}`, type: 'success' });
    } catch (err) {
      toastManager.add({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Error',
        type: 'error',
      });
    }
  };

  const handleExportDiagnostics = async () => {
    try {
      const res = await zitaIpc.exportDiagnostics();
      downloadTextFile(res.filename, res.content, 'application/json');
      toastManager.add({ title: 'Redacted diagnostics exported', type: 'success' });
    } catch (err) {
      toastManager.add({
        title: 'Diagnostics failed',
        description: err instanceof Error ? err.message : 'Error',
        type: 'error',
      });
    }
  };

  return (
    <Page>
      <PageHeader>
        <PageHeading>
          <PageTitle>Settings</PageTitle>
          {isSaving && <Badge variant="info">Saving...</Badge>}
        </PageHeading>
      </PageHeader>

      <ScrollArea className="min-h-0 flex-1">
        <PageBody className="mx-auto max-w-4xl">
          <Tabs
            orientation={isWide ? 'vertical' : 'horizontal'}
            value={activeTab}
            onValueChange={(val) => onTabChange(val as SettingsTab)}
            className={isWide ? 'gap-6' : 'gap-2'}
          >
            <TabsList className={isWide ? 'w-44 shrink-0 self-start' : 'mb-4'}>
              <TabsTab value="general">General</TabsTab>
              <TabsTab value="engine">Engine</TabsTab>
              <TabsTab value="appearance">Appearance</TabsTab>
              <TabsTab value="about">About / Legal</TabsTab>
            </TabsList>

            <TabsPanel value="general">
              <Card>
                <CardHeader>
                  <CardTitle>Local Storage, Export & Diagnostics</CardTitle>
                  <CardDescription>
                    Browsing history, cookies, and encrypted proxy secrets remain strictly on this
                    machine.
                  </CardDescription>
                </CardHeader>
                <CardPanel className="flex flex-col gap-4">
                  <CodeBlock label="Storage root">
                    {appInfo?.storageRoot ?? 'Loading...'}
                  </CodeBlock>

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                    <div>
                      <div className="text-sm font-medium">Data export & diagnostics</div>
                      <div className="text-xs text-muted-foreground">
                        Export profile metadata (passwords omitted) or send redacted diagnostics to
                        support.
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => void handleExportData('json')}>
                        <Download className="size-3.5" strokeWidth={1.5} />
                        Export JSON
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void handleExportData('csv')}>
                        <Download className="size-3.5" strokeWidth={1.5} />
                        Export CSV
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void handleExportDiagnostics()}
                      >
                        Send diagnostics
                      </Button>
                    </div>
                  </div>

                </CardPanel>
              </Card>
            </TabsPanel>

            <TabsPanel value="engine">
              <Card>
                <CardHeader>
                  <CardTitle>Browser Engine</CardTitle>
                  <CardDescription>
                    Pinned ungoogled-chromium fingerprint engine managed with SHA-256 verification.
                  </CardDescription>
                </CardHeader>
                <CardPanel className="flex flex-col gap-3 text-sm">
                  <MetaRow label="Pinned version">
                    {engine?.pinnedVersion ?? '150.0.7871.186'} ({engine?.platform ?? 'linux-x64'})
                  </MetaRow>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant={engine?.installed ? 'success' : 'warning'}>
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                      {engine?.installed ? 'Installed & verified' : 'Not installed'}
                    </Badge>
                  </div>
                  <CodeBlock label="SHA-256" className="break-all">
                    {engine?.sha256 ?? 'Not recorded'}
                  </CodeBlock>
                  <CodeBlock label="Executable path" className="break-all">
                    {engine?.executablePath ?? 'Run pnpm engine:fetch to install'}
                  </CodeBlock>
                </CardPanel>
              </Card>
            </TabsPanel>

            <TabsPanel value="appearance">
              <Card>
                <CardHeader>
                  <CardTitle>Theme & Density</CardTitle>
                  <CardDescription>
                    Theme follows your OS color scheme by default or pins Light / Dark across
                    restarts.
                  </CardDescription>
                </CardHeader>
                <CardPanel className="flex flex-col gap-5">
                  <div>
                    <div className="mb-2 text-sm font-medium">Color scheme</div>
                    <SegmentedControl aria-label="Color scheme">
                      {themeOptions.map((opt) => {
                        const Icon = opt.icon;
                        return (
                          <SegmentedControlItem
                            key={opt.value}
                            data-checked={currentTheme === opt.value ? '' : undefined}
                            onClick={() => onUpdateSettings({ theme: opt.value })}
                          >
                            <Icon className="size-4" strokeWidth={1.5} />
                            {opt.label}
                          </SegmentedControlItem>
                        );
                      })}
                    </SegmentedControl>
                  </div>

                  <div className="border-t pt-4">
                    <div className="mb-2 text-sm font-medium">Table density</div>
                    <SegmentedControl aria-label="Table density">
                      {(
                        [
                          { value: 'comfortable', label: 'Comfortable (40 px rows)' },
                          { value: 'compact', label: 'Compact (32 px rows)' },
                        ] as const
                      ).map((opt) => (
                        <SegmentedControlItem
                          key={opt.value}
                          data-checked={currentDensity === opt.value ? '' : undefined}
                          onClick={() => onUpdateSettings({ density: opt.value })}
                        >
                          {opt.label}
                        </SegmentedControlItem>
                      ))}
                    </SegmentedControl>
                  </div>
                </CardPanel>
              </Card>
            </TabsPanel>

            <TabsPanel value="about">
              <Card>
                <CardHeader>
                  <CardTitle>Zed IT Anti Browser</CardTitle>
                  <CardDescription>Blend in. Scale out. Built by ZED IT Bangladesh.</CardDescription>
                </CardHeader>
                <CardPanel className="flex flex-col gap-3 text-sm">
                  <MetaRow label="App version">{appInfo?.version ?? '0.1.0'}</MetaRow>
                  <MetaRow label="Electron / Node">
                    {appInfo?.electronVersion ?? '-'} / {appInfo?.nodeVersion ?? '-'}
                  </MetaRow>
                  <Alert variant="warning">
                    <ShieldAlert className="size-4" strokeWidth={1.5} />
                    <AlertDescription>
                      Subject to ZED IT Acceptable Use Policy, Terms of Service, and Privacy Policy.
                    </AlertDescription>
                  </Alert>
                  <div className="flex items-center justify-between border-t pt-3">
                    <div>
                      <div className="font-medium">Upstream engine notice</div>
                      <div className="text-xs text-muted-foreground">
                        Uses fingerprint-chromium ({engine?.license ?? 'BSD-3-Clause'})
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        onOpenExternal(
                          engine?.upstreamRepo ?? 'https://github.com/adryfish/fingerprint-chromium',
                        )
                      }
                    >
                      View repo
                      <ExternalLink className="size-3.5" strokeWidth={1.5} />
                    </Button>
                  </div>
                </CardPanel>
              </Card>
            </TabsPanel>
          </Tabs>
        </PageBody>
      </ScrollArea>
    </Page>
  );
}
