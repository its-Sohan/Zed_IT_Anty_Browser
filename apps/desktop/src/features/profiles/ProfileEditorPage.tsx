import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Dices,
  FlaskConical,
  Play,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  Brand,
  FingerprintConfig,
  HardwareTablePresetDto,
  Platform,
  ProfilesOverview,
  ProxyProtocol,
  ProxySummary,
} from '@zita/shared';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardDescription,
  CardHeader,
  CardPanel,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Frame, FramePanel } from '@/components/ui/frame';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toastManager } from '@/components/ui/toast';
import { zitaIpc } from '@/lib/ipc';
import { cn } from '@/lib/utils';

type EditorSection = 'general' | 'fingerprint' | 'cookies' | 'advanced';

export interface ProfileEditorPageProps {
  profileId: string | null; // null = create mode
  overview: ProfilesOverview | undefined;
  proxies: ProxySummary[];
  onBack: () => void;
  onSaved: (profileId: string) => void;
  onProxyCreated?: () => void;
  onOpenLab: (profileId: string) => void;
}

const NONE_VALUE = '__none__';

const PROXY_PROTOCOL_ITEMS: Array<{ value: ProxyProtocol; label: string }> = [
  { value: 'socks5', label: 'SOCKS5' },
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
];

const OS_ITEMS: Array<{ value: Platform; label: string }> = [
  { value: 'windows', label: 'Windows' },
  { value: 'macos', label: 'macOS' },
  { value: 'linux', label: 'Linux' },
];

const BRAND_ITEMS: Array<{ value: Brand; label: string }> = [
  { value: 'Chrome', label: 'Chrome' },
  { value: 'Edge', label: 'Edge' },
  { value: 'Opera', label: 'Opera' },
  { value: 'Vivaldi', label: 'Vivaldi' },
  { value: 'Chromium', label: 'Chromium' },
];

const TZ_MODE_ITEMS: Array<{ value: 'auto' | 'manual'; label: string }> = [
  { value: 'auto', label: 'Auto from proxy geo' },
  { value: 'manual', label: 'Manual override' },
];

const WEBRTC_ITEMS: Array<{ value: 'proxied' | 'disabled' | 'real'; label: string }> = [
  { value: 'proxied', label: 'Proxied (non-proxied UDP disabled)' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'real', label: 'Real (not recommended)' },
];

const DEFAULT_FP: FingerprintConfig = {
  schemaVersion: 1,
  seed: 1287349192,
  platform: 'windows',
  platformVersion: '10',
  brand: 'Chrome',
  brandVersion: '150',
  hardware: {
    cpuCores: 8,
    memoryGb: 16,
    gpuVendor: 'Google Inc. (NVIDIA)',
    gpuRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  },
  screen: { mode: 'host', width: 1920, height: 1080, deviceScaleFactor: 1 },
  timezone: { mode: 'auto', value: null },
  locale: { mode: 'auto', value: 'en-US', acceptLanguage: 'en-US,en' },
  geolocation: { mode: 'auto', latitude: null, longitude: null },
  webrtc: { mode: 'proxied' },
  spoofing: { canvas: true, audio: true, fonts: true, clientRects: true, gpu: true },
  extras: { doNotTrack: false, blockedPorts: [] },
};

export function ProfileEditorPage({
  profileId,
  overview,
  proxies,
  onBack,
  onSaved,
  onProxyCreated,
  onOpenLab,
}: ProfileEditorPageProps) {
  const [section, setSection] = useState<EditorSection>('general');
  const [loading, setLoading] = useState(Boolean(profileId));
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [folderId, setFolderId] = useState<string>('');
  const [statusId, setStatusId] = useState<string>('');
  const [proxyId, setProxyId] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [startPagesText, setStartPagesText] = useState('');
  const [extraFlagsText, setExtraFlagsText] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [fp, setFp] = useState<FingerprintConfig>(DEFAULT_FP);
  const [userDataDir, setUserDataDir] = useState<string>('');
  const [pendingCookieCount, setPendingCookieCount] = useState(0);
  const [observedSummary, setObservedSummary] = useState<string | null>(null);
  const [hardwareTables, setHardwareTables] = useState<Record<Platform, HardwareTablePresetDto> | null>(
    null,
  );

  const [cookieText, setCookieText] = useState('');
  const [confirmClearCookies, setConfirmClearCookies] = useState(false);

  const [addProxyOpen, setAddProxyOpen] = useState(false);
  const [pxLabel, setPxLabel] = useState('');
  const [pxProto, setPxProto] = useState<ProxyProtocol>('socks5');
  const [pxHost, setPxHost] = useState('');
  const [pxPort, setPxPort] = useState('1080');
  const [pxUser, setPxUser] = useState('');
  const [pxPass, setPxPass] = useState('');
  const [pxBusy, setPxBusy] = useState(false);

  const handleCreateInlineProxy = async (e: React.FormEvent) => {
    e.preventDefault();
    setPxBusy(true);
    try {
      const created = await zitaIpc.createProxy({
        label: pxLabel,
        protocol: pxProto,
        host: pxHost,
        port: Number.parseInt(pxPort, 10),
        username: pxUser || null,
        password: pxPass || null,
      });
      setProxyId(created.id);
      setAddProxyOpen(false);
      setPxLabel('');
      setPxProto('socks5');
      setPxHost('');
      setPxPort('1080');
      setPxUser('');
      setPxPass('');
      onProxyCreated?.();
      toastManager.add({ title: 'Proxy added and assigned', type: 'success' });
    } catch (err) {
      toastManager.add({
        title: 'Failed to add proxy',
        description: err instanceof Error ? err.message : 'Invalid input',
        type: 'error',
      });
    } finally {
      setPxBusy(false);
    }
  };

  useEffect(() => {
    void zitaIpc.getHardwarePresets().then(setHardwareTables).catch(() => null);
  }, []);

  useEffect(() => {
    let active = true;
    if (!profileId) {
      setLoading(true);
      void zitaIpc
        .generateFingerprint({ os: 'windows' })
        .then((generated) => {
          if (!active) return;
          setFp(generated);
          setName(`Profile ${(overview?.counts.all ?? 0) + 1}`);
          const defStatus = overview?.statuses.find((s) => s.isDefault);
          if (defStatus) setStatusId(defStatus.id);
        })
        .finally(() => active && setLoading(false));
      return () => {
        active = false;
      };
    }

    setLoading(true);
    void zitaIpc
      .getProfile(profileId)
      .then((detail) => {
        if (!active) return;
        setName(detail.name);
        setFolderId(detail.folderId ?? '');
        setStatusId(detail.statusId ?? '');
        setProxyId(detail.proxyId ?? '');
        setNotes(detail.notes ?? '');
        setStartPagesText(detail.startPages.join('\n'));
        setExtraFlagsText(detail.extraFlags.join('\n'));
        setTagIds(detail.tagIds);
        setFp(detail.fingerprint);
        setUserDataDir(detail.userDataDir);
        setPendingCookieCount(detail.pendingCookieCount);
        setObservedSummary(
          detail.observedFingerprint
            ? `Captured ${detail.observedFingerprint.capturedAt} — ${detail.observedFingerprint.webgl.unmaskedRenderer ?? 'WebGL n/a'}`
            : null,
        );
      })
      .catch((err) => {
        toastManager.add({
          title: 'Failed to load profile',
          description: err instanceof Error ? err.message : 'Unknown error',
          type: 'error',
        });
        onBack();
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [profileId]);

  const handleRerollFingerprint = async (nextOs?: Platform) => {
    try {
      const next = await zitaIpc.generateFingerprint({
        os: nextOs ?? fp.platform,
        osVersion: nextOs && nextOs !== fp.platform ? undefined : fp.platformVersion,
        brand: fp.brand,
        timezone: fp.timezone.mode === 'manual' ? fp.timezone.value : null,
        locale: fp.locale.mode === 'manual' ? fp.locale.value : null,
      });
      setFp({
        ...next,
        webrtc: fp.webrtc,
        spoofing: fp.spoofing,
      });
    } catch (err) {
      toastManager.add({
        title: 'Failed to generate fingerprint',
        description: err instanceof Error ? err.message : 'Error',
        type: 'error',
      });
    }
  };

  const handleSave = async (andStart = false) => {
    setSaving(true);
    try {
      const startPages = startPagesText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      const extraFlags = extraFlagsText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);

      const saved = profileId
        ? await zitaIpc.updateProfile({
            id: profileId,
            name,
            folderId: folderId || null,
            statusId: statusId || null,
            proxyId: proxyId || null,
            notes: notes || null,
            fingerprint: fp,
            startPages,
            extraFlags,
            tagIds,
          })
        : await zitaIpc.createProfile({
            name,
            folderId: folderId || null,
            statusId: statusId || null,
            proxyId: proxyId || null,
            notes: notes || null,
            fingerprint: fp,
            startPages,
            extraFlags,
            tagIds,
          });

      if (cookieText.trim()) {
        const res = await zitaIpc.importCookies({ profileId: saved.id, rawText: cookieText });
        setPendingCookieCount((c) => c + res.validCount);
        setCookieText('');
        toastManager.add({
          title: `Staged ${res.validCount} cookies`,
          description:
            res.skipped.length > 0
              ? `${res.skipped.length} invalid cookies skipped.`
              : 'Will seed on next launch.',
          type: 'info',
        });
      }

      toastManager.add({ title: 'Profile saved', description: saved.name, type: 'success' });

      if (andStart) {
        await zitaIpc.launchProfile({ id: saved.id, skipProxyCheck: false });
        toastManager.add({ title: 'Profile launched', description: saved.name, type: 'success' });
      }
      onSaved(saved.id);
    } catch (err) {
      toastManager.add({
        title: 'Save or launch failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleStageCookiesNow = async () => {
    if (!profileId || !cookieText.trim()) return;
    try {
      const res = await zitaIpc.importCookies({ profileId, rawText: cookieText });
      setPendingCookieCount((c) => c + res.validCount);
      setCookieText('');
      toastManager.add({
        title: `Imported ${res.validCount} ${res.format} cookies`,
        description: `${res.skipped.length} entries skipped.`,
        type: 'success',
      });
    } catch (err) {
      toastManager.add({
        title: 'Cookie import failed',
        description: err instanceof Error ? err.message : 'Invalid cookies',
        type: 'error',
      });
    }
  };

  const handleClearCookies = async () => {
    if (!profileId) return;
    try {
      await zitaIpc.clearCookies(profileId);
      setPendingCookieCount(0);
      setConfirmClearCookies(false);
      toastManager.add({ title: 'Cookies cleared', type: 'success' });
    } catch (err) {
      toastManager.add({
        title: 'Failed to clear cookies',
        description: err instanceof Error ? err.message : 'Stop profile first',
        type: 'error',
      });
    }
  };

  const selectedProxy = proxies.find((p) => p.id === proxyId);
  const currentOsPresets = hardwareTables?.[fp.platform];

  const folderItems = useMemo(
    () => [
      { value: NONE_VALUE, label: 'No folder' },
      ...(overview?.folders ?? []).map((f) => ({ value: f.id, label: f.name })),
    ],
    [overview?.folders],
  );

  const statusItems = useMemo(
    () => (overview?.statuses ?? []).map((s) => ({ value: s.id, label: s.name })),
    [overview?.statuses],
  );

  const proxyItems = useMemo(
    () => [
      { value: NONE_VALUE, label: 'Direct (No proxy)' },
      ...proxies.map((p) => ({
        value: p.id,
        label: `${p.label} (${p.protocol.toUpperCase()} ${p.host}:${p.port}${p.country ? ` • ${p.country}` : ''})`,
      })),
    ],
    [proxies],
  );

  const osVersionItems = useMemo(
    () =>
      (currentOsPresets?.osVersions ?? [fp.platformVersion]).map((v) => ({
        value: v,
        label: v,
      })),
    [currentOsPresets?.osVersions, fp.platformVersion],
  );

  const hardwareItems = useMemo(
    () =>
      (currentOsPresets?.hardware ?? [fp.hardware]).map((h) => ({
        value: String(h.cpuCores),
        label: `${h.cpuCores} cores • ${h.memoryGb} GB RAM (${h.gpuVendor})`,
      })),
    [currentOsPresets?.hardware, fp.hardware],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Sticky Header (§8.3) */}
      <div className="flex items-center justify-between gap-3 border-b bg-card px-4 py-2.5">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="ghost" onClick={onBack}>
            <ArrowLeft className="size-4" strokeWidth={1.5} />
            Profiles
          </Button>
          <Separator orientation="vertical" className="h-4" />
          <h1 className="text-[15px] font-semibold">
            {profileId ? name || 'Edit profile' : 'New profile'}
          </h1>
          <Badge variant="secondary" className="font-mono-tabular">
            Seed {fp.seed}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={saving || loading || !name.trim()}
            onClick={() => void handleSave(false)}
          >
            <Save className="size-3.5" strokeWidth={1.5} />
            Save
          </Button>
          <Button
            size="sm"
            variant="default"
            disabled={saving || loading || !name.trim()}
            onClick={() => void handleSave(true)}
          >
            <Play className="size-3.5" strokeWidth={1.5} />
            Save & Start
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3 p-6">
          <Skeleton className="h-6 w-1/4" />
          <Skeleton className="h-32 w-full max-w-2xl" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Left Section Nav */}
          <nav
            aria-label="Profile editor sections"
            className="flex w-44 shrink-0 flex-col gap-1 border-r bg-card p-2.5"
          >
            {(
              [
                { id: 'general', label: 'General' },
                { id: 'fingerprint', label: 'Fingerprint' },
                { id: 'cookies', label: 'Cookies' },
                { id: 'advanced', label: 'Advanced' },
              ] as const
            ).map((item) => (
              <Button
                key={item.id}
                size="sm"
                variant={section === item.id ? 'secondary' : 'ghost'}
                onClick={() => setSection(item.id)}
                className={cn(
                  'w-full justify-start',
                  section === item.id &&
                    'border-l-2 border-primary bg-primary/10 font-medium text-foreground',
                )}
              >
                {item.label}
              </Button>
            ))}
          </nav>

          {/* Center Form */}
          <ScrollArea className="min-w-0 flex-1">
            <div className="mx-auto max-w-2xl space-y-4 p-5">
              {section === 'general' && (
                <Card>
                  <CardHeader>
                    <CardTitle>General Identity</CardTitle>
                    <CardDescription>
                      Profile organization, proxy assignment, and startup pages.
                    </CardDescription>
                  </CardHeader>
                  <CardPanel className="space-y-4">
                    <Field>
                      <FieldLabel htmlFor="prof-name">Profile name</FieldLabel>
                      <Input
                        id="prof-name"
                        required
                        maxLength={120}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Client A — Facebook 01"
                      />
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                      <Field>
                        <FieldLabel>Folder</FieldLabel>
                        <Select
                          items={folderItems}
                          value={folderId || NONE_VALUE}
                          onValueChange={(val) =>
                            setFolderId(val === NONE_VALUE || !val ? '' : val)
                          }
                        >
                          <SelectTrigger className="min-w-0">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectPopup>
                            {folderItems.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectPopup>
                        </Select>
                      </Field>

                      <Field>
                        <FieldLabel>Status</FieldLabel>
                        <Select
                          items={statusItems}
                          value={statusId || null}
                          onValueChange={(val) => setStatusId(val ?? '')}
                        >
                          <SelectTrigger className="min-w-0">
                            <SelectValue placeholder="Select status..." />
                          </SelectTrigger>
                          <SelectPopup>
                            {statusItems.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectPopup>
                        </Select>
                      </Field>
                    </div>

                    <Field>
                      <FieldLabel>Proxy</FieldLabel>
                      <div className="flex w-full items-center gap-2">
                        <Select
                          items={proxyItems}
                          value={proxyId || NONE_VALUE}
                          onValueChange={(val) =>
                            setProxyId(val === NONE_VALUE || !val ? '' : val)
                          }
                        >
                          <SelectTrigger className="flex-1">
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
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setAddProxyOpen(true)}
                        >
                          <Plus className="size-3.5" strokeWidth={1.5} />
                          Add proxy
                        </Button>
                      </div>
                      <FieldDescription>
                        Supports HTTP, HTTPS, and SOCKS5 (routed via local loopback bridge with
                        encrypted credentials). Manage or bulk-import proxies anytime from the
                        Proxies tab.
                      </FieldDescription>
                    </Field>

                    {overview && overview.tags.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-sm font-medium">Tags</div>
                        <div className="flex flex-wrap gap-1.5">
                          {overview.tags.map((t) => {
                            const active = tagIds.includes(t.id);
                            return (
                              <Button
                                key={t.id}
                                size="xs"
                                variant={active ? 'default' : 'outline'}
                                onClick={() =>
                                  setTagIds((prev) =>
                                    active ? prev.filter((x) => x !== t.id) : [...prev, t.id],
                                  )
                                }
                              >
                                #{t.name}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <Field>
                      <FieldLabel htmlFor="prof-pages">Start pages (one URL per line)</FieldLabel>
                      <Textarea
                        id="prof-pages"
                        value={startPagesText}
                        onChange={(e) => setStartPagesText(e.target.value)}
                        placeholder="https://example.com"
                        className="font-mono-tabular [&_textarea]:text-xs"
                      />
                    </Field>

                    <Field>
                      <FieldLabel htmlFor="prof-notes">Notes</FieldLabel>
                      <Textarea
                        id="prof-notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Account warm-up notes, recovery info..."
                      />
                    </Field>
                  </CardPanel>
                </Card>
              )}

              {section === 'fingerprint' && (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle>Platform & Hardware</CardTitle>
                      <CardDescription>
                        Deterministic values derived from seed and coherent OS hardware tables.
                      </CardDescription>
                    </CardHeader>
                    <CardPanel className="space-y-4">
                      <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                        <div>
                          <div className="text-xs text-muted-foreground">Fingerprint Seed</div>
                          <div className="font-mono-tabular text-sm font-semibold">{fp.seed}</div>
                        </div>
                        <div className="flex gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              void navigator.clipboard.writeText(String(fp.seed));
                              toastManager.add({ title: 'Seed copied', type: 'info' });
                            }}
                          >
                            <Copy className="size-3.5" strokeWidth={1.5} />
                            Copy
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => void handleRerollFingerprint()}
                          >
                            <Dices className="size-3.5" strokeWidth={1.5} />
                            New fingerprint
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <Field>
                          <FieldLabel>OS</FieldLabel>
                          <Select
                            items={OS_ITEMS}
                            value={fp.platform}
                            onValueChange={(val) => {
                              if (val) void handleRerollFingerprint(val as Platform);
                            }}
                          >
                            <SelectTrigger className="min-w-0">
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
                        </Field>

                        <Field>
                          <FieldLabel>OS Version</FieldLabel>
                          <Select
                            items={osVersionItems}
                            value={fp.platformVersion}
                            onValueChange={(val) => {
                              if (val) setFp({ ...fp, platformVersion: val });
                            }}
                          >
                            <SelectTrigger className="min-w-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectPopup>
                              {osVersionItems.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectPopup>
                          </Select>
                        </Field>

                        <Field>
                          <FieldLabel>Brand</FieldLabel>
                          <Select
                            items={BRAND_ITEMS}
                            value={fp.brand}
                            onValueChange={(val) => {
                              if (val) setFp({ ...fp, brand: val as Brand });
                            }}
                          >
                            <SelectTrigger className="min-w-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectPopup>
                              {BRAND_ITEMS.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectPopup>
                          </Select>
                        </Field>
                      </div>

                      <Field>
                        <FieldLabel>Coherent Hardware Preset (CPU / RAM)</FieldLabel>
                        <Select
                          items={hardwareItems}
                          value={String(fp.hardware.cpuCores)}
                          onValueChange={(val) => {
                            const cores = Number(val);
                            const preset = currentOsPresets?.hardware.find(
                              (h) => h.cpuCores === cores,
                            );
                            if (preset) {
                              setFp({ ...fp, hardware: preset });
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectPopup>
                            {hardwareItems.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectPopup>
                        </Select>
                      </Field>

                      <div className="grid grid-cols-2 gap-3 border-t pt-3">
                        <Field>
                          <FieldLabel>Timezone</FieldLabel>
                          <Select
                            items={TZ_MODE_ITEMS}
                            value={fp.timezone.mode}
                            onValueChange={(val) => {
                              if (!val) return;
                              const mode = val as 'auto' | 'manual';
                              setFp({
                                ...fp,
                                timezone: {
                                  mode,
                                  value:
                                    mode === 'manual'
                                      ? fp.timezone.value ?? 'America/New_York'
                                      : null,
                                },
                              });
                            }}
                          >
                            <SelectTrigger className="min-w-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectPopup>
                              {TZ_MODE_ITEMS.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectPopup>
                          </Select>
                          {fp.timezone.mode === 'manual' && (
                            <Input
                              size="sm"
                              value={fp.timezone.value ?? ''}
                              onChange={(e) =>
                                setFp({
                                  ...fp,
                                  timezone: { mode: 'manual', value: e.target.value },
                                })
                              }
                              placeholder="America/New_York"
                            />
                          )}
                          {fp.timezone.mode === 'manual' &&
                            selectedProxy?.timezone &&
                            fp.timezone.value &&
                            fp.timezone.value !== selectedProxy.timezone && (
                              <FieldDescription className="text-warning-foreground">
                                Warning: differs from proxy timezone ({selectedProxy.timezone})
                              </FieldDescription>
                            )}
                        </Field>

                        <Field>
                          <FieldLabel>WebRTC Policy</FieldLabel>
                          <Select
                            items={WEBRTC_ITEMS}
                            value={fp.webrtc.mode}
                            onValueChange={(val) => {
                              if (val) {
                                setFp({
                                  ...fp,
                                  webrtc: { mode: val as 'proxied' | 'disabled' | 'real' },
                                });
                              }
                            }}
                          >
                            <SelectTrigger className="min-w-0">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectPopup>
                              {WEBRTC_ITEMS.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectPopup>
                          </Select>
                        </Field>
                      </div>
                    </CardPanel>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle>Spoofing Controls & Honest Limits</CardTitle>
                      <CardDescription>
                        Screen resolution and media devices are not spoofed in the v1 engine.
                      </CardDescription>
                    </CardHeader>
                    <CardPanel className="space-y-3">
                      {(
                        [
                          ['canvas', 'Canvas noise'],
                          ['audio', 'AudioContext noise'],
                          ['fonts', 'Font enumeration protection'],
                          ['clientRects', 'ClientRects noise'],
                          ['gpu', 'Seed-derived WebGL metadata & image noise'],
                        ] as const
                      ).map(([key, label]) => (
                        <div key={key} className="flex items-center justify-between text-sm">
                          <Label htmlFor={`fp-sp-${key}`} className="font-normal">
                            {label}
                          </Label>
                          <Switch
                            id={`fp-sp-${key}`}
                            checked={fp.spoofing[key]}
                            onCheckedChange={(checked) =>
                              setFp({
                                ...fp,
                                spoofing: { ...fp.spoofing, [key]: Boolean(checked) },
                              })
                            }
                          />
                        </div>
                      ))}

                      {observedSummary && (
                        <Alert variant="info">
                          <AlertDescription>
                            <strong>Last read-back:</strong> {observedSummary}
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardPanel>
                  </Card>
                </div>
              )}

              {section === 'cookies' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Cookies (Netscape & JSON)</CardTitle>
                    <CardDescription>
                      Cookies are validated and seeded on{' '}
                      <code className="font-mono-tabular">about:blank</code> via CDP before start
                      pages load.
                    </CardDescription>
                  </CardHeader>
                  <CardPanel className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Badge variant={pendingCookieCount > 0 ? 'info' : 'secondary'}>
                        {pendingCookieCount} pending cookies queued for next launch
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        render={<label className="cursor-pointer" />}
                      >
                        <Upload className="size-3.5" strokeWidth={1.5} />
                        Load .txt / .json
                        <input
                          type="file"
                          accept=".txt,.json,text/plain,application/json"
                          className="sr-only"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) setCookieText(await f.text());
                          }}
                        />
                      </Button>
                    </div>

                    <Textarea
                      value={cookieText}
                      onChange={(e) => setCookieText(e.target.value)}
                      placeholder="Paste Netscape cookies.txt or JSON cookie array..."
                      className="font-mono-tabular [&_textarea]:h-44 [&_textarea]:text-xs"
                    />

                    <div className="flex items-center justify-between pt-2">
                      {profileId ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setConfirmClearCookies(true)}
                        >
                          <Trash2 className="size-3.5" strokeWidth={1.5} />
                          Clear profile cookies
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Cookies will stage when you click Save.
                        </span>
                      )}

                      {profileId && (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!cookieText.trim()}
                          onClick={() => void handleStageCookiesNow()}
                        >
                          Import & Queue Now
                        </Button>
                      )}
                    </div>
                  </CardPanel>
                </Card>
              )}

              {section === 'advanced' && (
                <Card>
                  <CardHeader>
                    <CardTitle>Advanced Engine Settings</CardTitle>
                    <CardDescription>
                      Only curated allowlisted Chromium flags are accepted.
                    </CardDescription>
                  </CardHeader>
                  <CardPanel className="space-y-4">
                    <Field>
                      <FieldLabel htmlFor="adv-flags">
                        Extra allowlisted CLI flags (one per line)
                      </FieldLabel>
                      <Textarea
                        id="adv-flags"
                        value={extraFlagsText}
                        onChange={(e) => setExtraFlagsText(e.target.value)}
                        placeholder="--disable-quic"
                        className="font-mono-tabular [&_textarea]:text-xs"
                      />
                      <FieldDescription>
                        Allowed: --window-size, --window-position, --headless, --proxy-bypass-list,
                        --disable-quic, --force-device-scale-factor, --mute-audio, --no-sandbox.
                      </FieldDescription>
                    </Field>

                    {userDataDir && (
                      <div>
                        <div className="text-xs font-medium text-muted-foreground">
                          Profile data directory
                        </div>
                        <div className="font-mono-tabular mt-1 break-all rounded-md border bg-muted/40 px-3 py-2 text-xs">
                          {userDataDir}
                        </div>
                      </div>
                    )}
                  </CardPanel>
                </Card>
              )}
            </div>
          </ScrollArea>

          {/* Right Live Summary Rail (§8.3) */}
          <aside className="w-72 shrink-0 space-y-3 border-l bg-card p-4">
            <div className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Identity Summary
            </div>
            <Frame>
              <FramePanel className="space-y-2 p-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">OS</span>
                  <span className="font-medium">
                    {fp.platform} {fp.platformVersion}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Hardware</span>
                  <span className="font-mono-tabular">
                    {fp.hardware.cpuCores}c / {fp.hardware.memoryGb ?? 16} GB
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Seed</span>
                  <span className="font-mono-tabular">{fp.seed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Proxy</span>
                  <span className="truncate pl-2 font-medium">
                    {selectedProxy ? selectedProxy.label : 'Direct'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">WebRTC</span>
                  <span>{fp.webrtc.mode}</span>
                </div>
              </FramePanel>
            </Frame>

            {profileId && (
              <Button variant="outline" className="w-full" onClick={() => onOpenLab(profileId)}>
                <FlaskConical className="size-4" strokeWidth={1.5} />
                Check in Lab
              </Button>
            )}
          </aside>
        </div>
      )}

      <AlertDialog open={confirmClearCookies} onOpenChange={setConfirmClearCookies}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear profile cookies?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes Chromium&apos;s stored cookie files and any queued import cookies for
              this profile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button size="sm" variant="outline" />}>
              Cancel
            </AlertDialogClose>
            <Button size="sm" variant="destructive" onClick={() => void handleClearCookies()}>
              Clear cookies
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      <Dialog open={addProxyOpen} onOpenChange={setAddProxyOpen}>
        <DialogPopup className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add proxy</DialogTitle>
            <DialogDescription>
              Add an HTTP, HTTPS, or SOCKS5 proxy and assign it to this profile.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateInlineProxy} className="contents">
            <DialogPanel className="space-y-3">
              <Field>
                <FieldLabel htmlFor="inline-px-label">Label</FieldLabel>
                <Input
                  id="inline-px-label"
                  required
                  value={pxLabel}
                  onChange={(e) => setPxLabel(e.target.value)}
                  placeholder="US Residential 01"
                />
              </Field>
              <div className="grid grid-cols-3 gap-2">
                <Field>
                  <FieldLabel>Protocol</FieldLabel>
                  <Select
                    items={PROXY_PROTOCOL_ITEMS}
                    value={pxProto}
                    onValueChange={(val) => {
                      if (val) setPxProto(val as ProxyProtocol);
                    }}
                  >
                    <SelectTrigger className="min-w-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      {PROXY_PROTOCOL_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="inline-px-host">Host</FieldLabel>
                  <Input
                    id="inline-px-host"
                    required
                    value={pxHost}
                    onChange={(e) => setPxHost(e.target.value)}
                    placeholder="203.0.113.10"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="inline-px-port">Port</FieldLabel>
                  <Input
                    id="inline-px-port"
                    required
                    type="number"
                    min={1}
                    max={65535}
                    value={pxPort}
                    onChange={(e) => setPxPort(e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field>
                  <FieldLabel htmlFor="inline-px-user">Username (optional)</FieldLabel>
                  <Input
                    id="inline-px-user"
                    value={pxUser}
                    onChange={(e) => setPxUser(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="inline-px-pass">Password (optional)</FieldLabel>
                  <Input
                    id="inline-px-pass"
                    type="password"
                    value={pxPass}
                    onChange={(e) => setPxPass(e.target.value)}
                  />
                </Field>
              </div>
            </DialogPanel>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAddProxyOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="default" disabled={pxBusy}>
                <CheckCircle2 className="size-3.5" strokeWidth={1.5} />
                {pxBusy ? 'Saving...' : 'Save & assign'}
              </Button>
            </DialogFooter>
          </form>
        </DialogPopup>
      </Dialog>
    </div>
  );
}
