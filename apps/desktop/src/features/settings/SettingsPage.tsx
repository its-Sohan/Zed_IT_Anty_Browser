import { useEffect, useState } from 'react';
import {
  Download,
  ExternalLink,
  KeyRound,
  Monitor,
  Moon,
  RefreshCw,
  ShieldAlert,
  Sun,
} from 'lucide-react';
import type {
  AppInfo,
  AppSettings,
  DensityPreference,
  EngineStatus,
  LanguagePreference,
  LicenseState,
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
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/ui/tabs';
import { toastManager } from '@/components/ui/toast';
import { zitaIpc } from '@/lib/ipc';
import { getSystemColorScheme } from '@/lib/theme';

export type SettingsTab = 'general' | 'engine' | 'license' | 'appearance' | 'about';

export interface SettingsPageProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  settings: AppSettings | undefined;
  appInfo: AppInfo | undefined;
  engine: EngineStatus | undefined;
  license: LicenseState | undefined;
  profileCount: number;
  onUpdateSettings: (patch: UpdateSettingsInput) => void;
  onRefreshLicense: () => void;
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
  license,
  profileCount,
  onUpdateSettings,
  onRefreshLicense,
  isSaving,
  onOpenExternal,
}: SettingsPageProps) {
  const [systemScheme, setSystemScheme] = useState<'dark' | 'light'>(() => getSystemColorScheme());
  const [licenseKey, setLicenseKey] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [aupAccepted, setAupAccepted] = useState(Boolean(license?.aupAccepted));
  const [licBusy, setLicBusy] = useState(false);

  useEffect(() => {
    setAupAccepted(Boolean(license?.aupAccepted));
  }, [license?.aupAccepted]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemScheme(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const currentTheme: ThemePreference = settings?.theme ?? 'system';
  const currentDensity: DensityPreference = settings?.density ?? 'comfortable';
  const currentLanguage: LanguagePreference = settings?.language ?? 'en';

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
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b bg-card px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h1 className="text-[15px] font-semibold">Settings</h1>
          {isSaving && <Badge variant="info">Saving...</Badge>}
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-4xl p-4">
          <Tabs value={activeTab} onValueChange={(val) => onTabChange(val as SettingsTab)}>
            <TabsList className="mb-4">
              <TabsTab value="general">General</TabsTab>
              <TabsTab value="engine">Engine</TabsTab>
              <TabsTab value="license">License</TabsTab>
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
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">Storage root</div>
                    <div className="font-mono-tabular mt-1 rounded-md border bg-muted/40 px-3 py-2 text-xs">
                      {appInfo?.storageRoot ?? 'Loading...'}
                    </div>
                  </div>

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

                  <div className="flex items-center justify-between gap-4 border-t pt-3">
                    <div>
                      <div className="text-sm font-medium">Language</div>
                      <div className="text-xs text-muted-foreground">
                        English at launch; Bangla support ready.
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {(['en', 'bn'] as const).map((lang) => (
                        <Button
                          key={lang}
                          size="sm"
                          variant={currentLanguage === lang ? 'default' : 'outline'}
                          onClick={() => onUpdateSettings({ language: lang })}
                        >
                          {lang === 'en' ? 'English' : 'বাংলা'}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-4 border-t pt-3">
                    <div>
                      <div className="text-sm font-medium">Telemetry</div>
                      <div className="text-xs text-muted-foreground">
                        Off by default. Zero browsing URLs, cookies, or credentials ever leave this
                        machine.
                      </div>
                    </div>
                    <Switch
                      checked={Boolean(settings?.telemetryOptIn)}
                      onCheckedChange={(checked) =>
                        onUpdateSettings({ telemetryOptIn: Boolean(checked) })
                      }
                      aria-label="Opt in to telemetry"
                    />
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
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Pinned version</span>
                    <span className="font-mono-tabular font-medium">
                      {engine?.pinnedVersion ?? '150.0.7871.186'} ({engine?.platform ?? 'linux-x64'})
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant={engine?.installed ? 'success' : 'warning'}>
                      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                      {engine?.installed ? 'Installed & verified' : 'Not installed'}
                    </Badge>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">SHA-256</div>
                    <div className="font-mono-tabular mt-1 break-all rounded-md border bg-muted/40 px-3 py-2 text-xs">
                      {engine?.sha256 ?? 'Not recorded'}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">Executable path</div>
                    <div className="font-mono-tabular mt-1 break-all rounded-md border bg-muted/40 px-3 py-2 text-xs">
                      {engine?.executablePath ?? 'Run pnpm engine:fetch to install'}
                    </div>
                  </div>
                </CardPanel>
              </Card>
            </TabsPanel>

            <TabsPanel value="license">
              <Card>
                <CardHeader>
                  <CardTitle>License & Device Activation</CardTitle>
                  <CardDescription>
                    Local-first key licensing with 14-day offline grace and ES256 signed tokens.
                  </CardDescription>
                </CardHeader>
                <CardPanel className="space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/40 p-3 sm:grid-cols-4">
                    <div>
                      <div className="text-xs text-muted-foreground">Status</div>
                      <Badge
                        className="mt-1 capitalize"
                        variant={
                          license?.status === 'active' || license?.status === 'trial'
                            ? 'success'
                            : license?.status === 'unactivated'
                              ? 'secondary'
                              : 'error'
                        }
                      >
                        {license?.status ?? 'unactivated'}
                      </Badge>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Plan</div>
                      <div className="mt-1 font-semibold uppercase">{license?.plan ?? 'None'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Profiles used</div>
                      <div className="font-mono-tabular mt-1 font-semibold">
                        {profileCount} / {license?.maxProfiles ?? 5}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Offline grace</div>
                      <div className="font-mono-tabular mt-1 font-semibold">
                        {license?.offlineDaysRemaining ?? 0} days
                      </div>
                    </div>
                  </div>

                  {license?.keyMasked && (
                    <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
                      <span className="font-mono-tabular text-xs">{license.keyMasked}</span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={licBusy}
                          onClick={async () => {
                            setLicBusy(true);
                            try {
                              await zitaIpc.revalidateLicense(serverUrl.trim() || undefined);
                              onRefreshLicense();
                              toastManager.add({ title: 'License revalidated', type: 'success' });
                            } catch (err) {
                              toastManager.add({
                                title: 'Revalidation failed',
                                description: err instanceof Error ? err.message : 'Error',
                                type: 'error',
                              });
                            } finally {
                              setLicBusy(false);
                            }
                          }}
                        >
                          <RefreshCw className="size-3.5" strokeWidth={1.5} />
                          Refresh
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={licBusy}
                          onClick={async () => {
                            setLicBusy(true);
                            try {
                              await zitaIpc.deactivateLicense(serverUrl.trim() || undefined);
                              onRefreshLicense();
                              toastManager.add({ title: 'Device deactivated', type: 'info' });
                            } finally {
                              setLicBusy(false);
                            }
                          }}
                        >
                          Deactivate device
                        </Button>
                      </div>
                    </div>
                  )}

                  <Field>
                    <FieldLabel className="w-full cursor-pointer items-start gap-2.5 rounded-lg border bg-muted/30 p-3 text-xs font-normal text-muted-foreground">
                      <Checkbox
                        checked={aupAccepted}
                        onCheckedChange={(checked) => setAupAccepted(Boolean(checked))}
                        className="mt-0.5"
                      />
                      <span>
                        I accept the Acceptable Use Policy (no fraud, carding, account takeover, or
                        spam).
                      </span>
                    </FieldLabel>
                  </Field>

                  <form
                    className="space-y-2.5 border-t pt-3"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setLicBusy(true);
                      try {
                        await zitaIpc.activateLicense({
                          key: licenseKey,
                          aupAccepted,
                          serverUrl: serverUrl.trim() || undefined,
                        });
                        setLicenseKey('');
                        onRefreshLicense();
                        toastManager.add({ title: 'License key activated', type: 'success' });
                      } catch (err) {
                        toastManager.add({
                          title: 'Activation failed',
                          description: err instanceof Error ? err.message : 'Error',
                          type: 'error',
                        });
                      } finally {
                        setLicBusy(false);
                      }
                    }}
                  >
                    <Field>
                      <FieldLabel htmlFor="lic-key-input">Activate license key</FieldLabel>
                      <div className="flex w-full gap-2">
                        <Input
                          id="lic-key-input"
                          required
                          pattern="^ZITA-[0-9A-Za-z]{4}-[0-9A-Za-z]{4}-[0-9A-Za-z]{4}$"
                          value={licenseKey}
                          onChange={(e) => setLicenseKey(e.target.value)}
                          placeholder="ZITA-7F3K-9Q2M-XB4T"
                          className="font-mono-tabular uppercase"
                        />
                        <Button
                          type="submit"
                          variant="default"
                          disabled={licBusy || !licenseKey.trim()}
                        >
                          <KeyRound className="size-3.5" strokeWidth={1.5} />
                          Activate
                        </Button>
                      </div>
                    </Field>
                    <Input
                      size="sm"
                      value={serverUrl}
                      onChange={(e) => setServerUrl(e.target.value)}
                      placeholder="License server URL (default https://license.zedit.app)"
                      aria-label="License server URL"
                    />
                  </form>

                  {license?.status === 'unactivated' && (
                    <div className="flex items-center justify-between border-t pt-3">
                      <span className="text-xs text-muted-foreground">
                        Need to evaluate first? Start a 7-day, 5-profile device trial.
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={licBusy || !aupAccepted}
                        onClick={async () => {
                          setLicBusy(true);
                          try {
                            await zitaIpc.startTrial(aupAccepted);
                            onRefreshLicense();
                            toastManager.add({ title: '7-day trial activated', type: 'success' });
                          } catch (err) {
                            toastManager.add({
                              title: 'Trial unavailable',
                              description: err instanceof Error ? err.message : 'Error',
                              type: 'error',
                            });
                          } finally {
                            setLicBusy(false);
                          }
                        }}
                      >
                        Start 7-day trial
                      </Button>
                    </div>
                  )}
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
                    <div className="flex flex-wrap gap-2">
                      {themeOptions.map((opt) => {
                        const Icon = opt.icon;
                        const active = currentTheme === opt.value;
                        return (
                          <Button
                            key={opt.value}
                            variant={active ? 'default' : 'outline'}
                            onClick={() => onUpdateSettings({ theme: opt.value })}
                          >
                            <Icon className="size-4" strokeWidth={1.5} />
                            {opt.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <div className="mb-2 text-sm font-medium">Table density</div>
                    <div className="flex gap-2">
                      {(
                        [
                          { value: 'comfortable', label: 'Comfortable (40 px rows)' },
                          { value: 'compact', label: 'Compact (32 px rows)' },
                        ] as const
                      ).map((opt) => (
                        <Button
                          key={opt.value}
                          size="sm"
                          variant={currentDensity === opt.value ? 'default' : 'outline'}
                          onClick={() => onUpdateSettings({ density: opt.value })}
                        >
                          {opt.label}
                        </Button>
                      ))}
                    </div>
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
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">App version</span>
                    <span className="font-mono-tabular">{appInfo?.version ?? '0.1.0'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Electron / Node</span>
                    <span className="font-mono-tabular">
                      {appInfo?.electronVersion ?? '-'} / {appInfo?.nodeVersion ?? '-'}
                    </span>
                  </div>
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
        </div>
      </ScrollArea>
    </div>
  );
}
