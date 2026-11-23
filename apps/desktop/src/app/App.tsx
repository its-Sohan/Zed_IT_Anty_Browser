import { Component, useEffect, useMemo, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import type { UpdateSettingsInput } from '@zita/shared';
import { CommandPalette, type CommandAction } from '@/app/CommandPalette';
import { AppSidebar, type NavSection, type ProfileView } from '@/app/Sidebar';
import { StatusBar } from '@/app/StatusBar';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { ToastProvider } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ActivityPage } from '@/features/activity/ActivityPage';
import { LabPage } from '@/features/lab/LabPage';
import { OnboardingWizard } from '@/features/onboarding/OnboardingWizard';
import { ProfileEditorPage } from '@/features/profiles/ProfileEditorPage';
import { ProfilesPage } from '@/features/profiles/ProfilesPage';
import { ProxiesPage } from '@/features/proxies/ProxiesPage';
import { SettingsPage, type SettingsTab } from '@/features/settings/SettingsPage';
import { zitaIpc } from '@/lib/ipc';
import { applyThemePreference } from '@/lib/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

interface PageErrorBoundaryProps {
  children: ReactNode;
}

interface PageErrorBoundaryState {
  error: Error | null;
}

class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  state: PageErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PageErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('View render error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center p-6">
          <Alert variant="error" className="max-w-lg">
            <AlertTriangle className="size-4" strokeWidth={1.5} />
            <AlertTitle>Failed to render this view</AlertTitle>
            <AlertDescription>{this.state.error.message}</AlertDescription>
            <AlertAction>
              <Button
                size="xs"
                variant="outline"
                onClick={() => this.setState({ error: null })}
              >
                Retry view
              </Button>
            </AlertAction>
          </Alert>
        </div>
      );
    }
    return this.props.children;
  }
}

function Shell() {
  const qc = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [section, setSection] = useState<NavSection>('profiles');
  const [profileView, setProfileView] = useState<ProfileView>('all');
  const [editingProfileId, setEditingProfileId] = useState<string | null | undefined>(undefined);
  const [labInitialProfileId, setLabInitialProfileId] = useState<string | undefined>();
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const [folderId, setFolderId] = useState<string | undefined>();
  const [statusId, setStatusId] = useState<string | undefined>();
  const [tagId, setTagId] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const appInfoQuery = useQuery({ queryKey: ['appInfo'], queryFn: zitaIpc.getAppInfo });
  const engineQuery = useQuery({ queryKey: ['engineStatus'], queryFn: zitaIpc.getEngineStatus });
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: zitaIpc.getSettings });
  const licenseQuery = useQuery({ queryKey: ['licenseState'], queryFn: zitaIpc.getLicenseState });
  const proxiesQuery = useQuery({ queryKey: ['proxiesList'], queryFn: zitaIpc.listProxies });

  useEffect(() => {
    if (settingsQuery.data?.theme) {
      applyThemePreference(settingsQuery.data.theme);
    }
  }, [settingsQuery.data?.theme]);

  const overviewQuery = useQuery({
    queryKey: ['profilesOverview', profileView, folderId, statusId, tagId, search],
    queryFn: () =>
      zitaIpc.getProfilesOverview({
        view: profileView,
        folderId,
        statusId,
        tagId,
        search,
      }),
  });

  const activityQuery = useQuery({
    queryKey: ['activityList'],
    queryFn: () => zitaIpc.listActivity(100),
    enabled: section === 'activity',
  });

  useEffect(() => {
    if (typeof window.zita?.events?.onProfileStatusChanged !== 'function') return;
    return window.zita.events.onProfileStatusChanged(() => {
      void qc.invalidateQueries({ queryKey: ['profilesOverview'] });
      void qc.invalidateQueries({ queryKey: ['proxiesList'] });
      void qc.invalidateQueries({ queryKey: ['activityList'] });
    });
  }, [qc]);

  const refreshAll = () => {
    void qc.invalidateQueries({ queryKey: ['profilesOverview'] });
    void qc.invalidateQueries({ queryKey: ['proxiesList'] });
    void qc.invalidateQueries({ queryKey: ['licenseState'] });
    void qc.invalidateQueries({ queryKey: ['activityList'] });
  };

  const updateSettingsMutation = useMutation({
    mutationFn: (patch: UpdateSettingsInput) => zitaIpc.updateSettings(patch),
    onSuccess: (next) => {
      qc.setQueryData(['settings'], next);
      applyThemePreference(next.theme);
    },
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
        return;
      }

      if (
        e.key === '/' &&
        !paletteOpen &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        e.preventDefault();
        setSection('profiles');
        setEditingProfileId(undefined);
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paletteOpen]);

  const commandActions: CommandAction[] = useMemo(
    () => [
      {
        id: 'nav-profiles-all',
        label: 'Go to All profiles',
        group: 'Navigation',
        run: () => {
          setSection('profiles');
          setEditingProfileId(undefined);
          setProfileView('all');
          setFolderId(undefined);
          setStatusId(undefined);
          setTagId(undefined);
        },
      },
      {
        id: 'new-profile',
        label: 'Create new profile',
        group: 'Profiles',
        run: () => {
          setSection('profiles');
          setEditingProfileId(null);
        },
      },
      {
        id: 'nav-profiles-running',
        label: 'Go to Running profiles',
        group: 'Navigation',
        run: () => {
          setSection('profiles');
          setEditingProfileId(undefined);
          setProfileView('running');
        },
      },
      {
        id: 'nav-proxies',
        label: 'Go to Proxies',
        group: 'Navigation',
        run: () => {
          setEditingProfileId(undefined);
          setSection('proxies');
        },
      },
      {
        id: 'nav-lab',
        label: 'Go to Fingerprint Lab',
        group: 'Navigation',
        run: () => {
          setEditingProfileId(undefined);
          setSection('lab');
        },
      },
      {
        id: 'nav-activity',
        label: 'Go to Activity log',
        group: 'Navigation',
        run: () => {
          setEditingProfileId(undefined);
          setSection('activity');
        },
      },
      {
        id: 'nav-settings-license',
        label: 'Settings: License & Activation',
        group: 'Settings',
        run: () => {
          setEditingProfileId(undefined);
          setSection('settings');
          setSettingsTab('license');
        },
      },
      {
        id: 'nav-settings-appearance',
        label: 'Settings: Appearance & Theme',
        group: 'Settings',
        run: () => {
          setEditingProfileId(undefined);
          setSection('settings');
          setSettingsTab('appearance');
        },
      },
      {
        id: 'toggle-sidebar',
        label: sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar',
        group: 'View',
        shortcut: 'Ctrl+B',
        run: () => setSidebarOpen((o) => !o),
      },
    ],
    [sidebarOpen],
  );

  const lic = licenseQuery.data;
  const isReadOnlyBanner =
    lic && (lic.status === 'expired' || lic.status === 'revoked' || lic.status === 'clock_tampered');
  const showOnboarding = Boolean(lic && lic.status === 'unactivated' && !onboardingDismissed);

  return (
    <div
      data-testid="app-shell"
      className="flex h-svh w-full overflow-hidden bg-background text-foreground"
    >
      <SidebarProvider
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
        className="h-full min-h-0 overflow-hidden"
      >
        <AppSidebar
          section={section}
          profileView={profileView}
          activeFolderId={folderId}
          activeStatusId={statusId}
          activeTagId={tagId}
          overview={overviewQuery.data}
          onSelectProfiles={(view, opts) => {
            setEditingProfileId(undefined);
            setSection('profiles');
            setProfileView(view);
            setFolderId(opts?.folderId);
            setStatusId(opts?.statusId);
            setTagId(opts?.tagId);
          }}
          onSelectSection={(next) => {
            setEditingProfileId(undefined);
            setSection(next);
          }}
          onRefresh={refreshAll}
        />

        <SidebarInset className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {isReadOnlyBanner && (
            <Alert variant="error" className="rounded-none border-x-0 border-t-0">
              <AlertTriangle className="size-4" strokeWidth={1.5} />
              <AlertDescription>
                License status is <strong>{lic.status}</strong> — app is in read-only mode (profile launches blocked; metadata remains editable and exportable).
              </AlertDescription>
              <AlertAction>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => {
                    setEditingProfileId(undefined);
                    setSection('settings');
                    setSettingsTab('license');
                  }}
                >
                  Manage license
                </Button>
              </AlertAction>
            </Alert>
          )}

          <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-background">
            <PageErrorBoundary key={`${section}:${profileView}:${editingProfileId ?? ''}`}>
              {section === 'profiles' && editingProfileId !== undefined ? (
                <ProfileEditorPage
                  profileId={editingProfileId}
                  overview={overviewQuery.data}
                  proxies={proxiesQuery.data ?? []}
                  onBack={() => setEditingProfileId(undefined)}
                  onSaved={() => {
                    setEditingProfileId(undefined);
                    refreshAll();
                  }}
                  onProxyCreated={() => void qc.invalidateQueries({ queryKey: ['proxiesList'] })}
                  onOpenLab={(id) => {
                    setEditingProfileId(undefined);
                    setLabInitialProfileId(id);
                    setSection('lab');
                  }}
                />
              ) : section === 'profiles' ? (
                <ProfilesPage
                  overview={overviewQuery.data}
                  proxies={proxiesQuery.data ?? []}
                  isLoading={overviewQuery.isLoading}
                  view={profileView}
                  search={search}
                  onSearchChange={setSearch}
                  searchInputRef={searchInputRef}
                  density={settingsQuery.data?.density ?? 'comfortable'}
                  activeFolderId={folderId}
                  activeStatusId={statusId}
                  activeTagId={tagId}
                  onClearFilters={() => {
                    setSearch('');
                    setFolderId(undefined);
                    setStatusId(undefined);
                    setTagId(undefined);
                  }}
                  onRefresh={refreshAll}
                  onNewProfile={() => setEditingProfileId(null)}
                  onEditProfile={(id) => setEditingProfileId(id)}
                  onOpenLab={(id) => {
                    setLabInitialProfileId(id);
                    setSection('lab');
                  }}
                  onEditProxies={() => setSection('proxies')}
                />
              ) : null}

              {section === 'proxies' && (
                <ProxiesPage
                  proxies={proxiesQuery.data ?? []}
                  isLoading={proxiesQuery.isLoading}
                  density={settingsQuery.data?.density ?? 'comfortable'}
                  onRefresh={refreshAll}
                />
              )}

              {section === 'lab' && (
                <LabPage
                  engine={engineQuery.data}
                  overview={overviewQuery.data}
                  proxies={proxiesQuery.data ?? []}
                  initialProfileId={labInitialProfileId}
                />
              )}

              {section === 'activity' && (
                <ActivityPage items={activityQuery.data} isLoading={activityQuery.isLoading} />
              )}

              {section === 'settings' && (
                <SettingsPage
                  activeTab={settingsTab}
                  onTabChange={setSettingsTab}
                  settings={settingsQuery.data}
                  appInfo={appInfoQuery.data}
                  engine={engineQuery.data}
                  license={licenseQuery.data}
                  profileCount={overviewQuery.data?.counts.all ?? 0}
                  onUpdateSettings={(patch) => updateSettingsMutation.mutate(patch)}
                  onRefreshLicense={refreshAll}
                  isSaving={updateSettingsMutation.isPending}
                  onOpenExternal={(url) => void zitaIpc.openExternal(url)}
                />
              )}
            </PageErrorBoundary>
          </div>

          <StatusBar
            appInfo={appInfoQuery.data}
            overview={overviewQuery.data}
            license={licenseQuery.data}
            onOpenCommandPalette={() => setPaletteOpen(true)}
            onOpenEngineSettings={() => {
              setEditingProfileId(undefined);
              setSection('settings');
              setSettingsTab('engine');
            }}
            onOpenLicenseSettings={() => {
              setEditingProfileId(undefined);
              setSection('settings');
              setSettingsTab('license');
            }}
          />
        </SidebarInset>
      </SidebarProvider>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        actions={commandActions}
      />

      <OnboardingWizard
        open={showOnboarding}
        onOpenChange={(open) => !open && setOnboardingDismissed(true)}
        license={licenseQuery.data}
        engine={engineQuery.data}
        onCompleted={refreshAll}
      />
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <TooltipProvider>
          <Shell />
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}
