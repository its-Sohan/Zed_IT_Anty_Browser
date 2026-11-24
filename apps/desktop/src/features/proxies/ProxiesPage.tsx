import { useState } from 'react';
import {
  Copy,
  Eye,
  MoreHorizontal,
  Network,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import type { DensityPreference, ProxyProtocol, ProxySummary } from '@zita/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { RouteEmptyArt } from '@/components/ui/empty-art';
import { Frame, FramePanel } from '@/components/ui/frame';
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { toastManager } from '@/components/ui/toast';
import { zitaIpc } from '@/lib/ipc';
import { ProxyDialog } from './ProxyDialog';

export interface ProxiesPageProps {
  proxies: ProxySummary[];
  isLoading: boolean;
  density: DensityPreference;
  onRefresh: () => void;
}

const PROTOCOL_ITEMS: Array<{ value: ProxyProtocol; label: string }> = [
  { value: 'socks5', label: 'SOCKS5' },
  { value: 'http', label: 'HTTP' },
  { value: 'https', label: 'HTTPS' },
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ProxiesPage({ proxies, isLoading, density, onRefresh }: ProxiesPageProps) {
  const [testingIds, setTestingIds] = useState<Set<string>>(new Set());
  const [checkAllProgress, setCheckAllProgress] = useState<{ done: number; total: number } | null>(
    null,
  );

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingProxy, setEditingProxy] = useState<ProxySummary | null>(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkProto, setBulkProto] = useState<ProxyProtocol>('http');
  const [bulkText, setBulkText] = useState('');

  const [revealedPassword, setRevealedPassword] = useState<{ label: string; value: string } | null>(
    null,
  );

  const rowHeight = density === 'compact' ? 'h-8' : 'h-10';

  const openCreateModal = () => {
    setEditingProxy(null);
    setEditModalOpen(true);
  };

  const openEditModal = (proxy: ProxySummary) => {
    setEditingProxy(proxy);
    setEditModalOpen(true);
  };

  const handleTestOne = async (id: string) => {
    setTestingIds((prev) => new Set(prev).add(id));
    try {
      const res = await zitaIpc.testProxy(id);
      onRefresh();
      toastManager.add({
        title: res.ok ? `Proxy OK (${res.latencyMs} ms)` : 'Proxy check failed',
        description: res.ok
          ? `${res.exitIp ?? 'Connected'} • ${[res.city, res.country].filter(Boolean).join(', ')}`
          : res.error ?? 'Connection failed',
        type: res.ok ? 'success' : 'error',
      });
    } finally {
      setTestingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const handleCheckAll = async () => {
    if (proxies.length === 0) return;
    setCheckAllProgress({ done: 0, total: proxies.length });
    for (let i = 0; i < proxies.length; i++) {
      await handleTestOne(proxies[i]!.id);
      setCheckAllProgress({ done: i + 1, total: proxies.length });
    }
    setCheckAllProgress(null);
  };

  const handleBulkImport = async () => {
    try {
      const res = await zitaIpc.bulkAddProxies({ rawText: bulkText, defaultProtocol: bulkProto });
      toastManager.add({
        title: `Added ${res.createdCount} proxies`,
        description: `${res.duplicatesCount} duplicates, ${res.errors.length} invalid lines.`,
        type: 'success',
      });
      setBulkOpen(false);
      setBulkText('');
      onRefresh();
    } catch (err) {
      toastManager.add({
        title: 'Bulk add failed',
        description: err instanceof Error ? err.message : 'Error',
        type: 'error',
      });
    }
  };

  return (
    <Page>
      <PageHeader>
        <PageHeading>
          <PageTitle>Proxies</PageTitle>
          <Badge variant="secondary" className="type-numeric">
            {proxies.length}
          </Badge>
          {checkAllProgress && (
            <Badge variant="info" className="type-numeric">
              Checking {checkAllProgress.done} / {checkAllProgress.total}
            </Badge>
          )}
        </PageHeading>

        <PageActions>
          <Button
            size="sm"
            variant="outline"
            disabled={proxies.length === 0 || Boolean(checkAllProgress)}
            onClick={() => void handleCheckAll()}
          >
            <RefreshCw className="size-3.5" strokeWidth={1.5} />
            Check all
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setBulkOpen(true)}>
            <Upload className="size-3.5" strokeWidth={1.5} />
            Bulk add
          </Button>
          <Button size="sm" variant="default" onClick={openCreateModal}>
            <Plus className="size-3.5" strokeWidth={1.5} />
            Add proxy
          </Button>
        </PageActions>
      </PageHeader>

      <ScrollArea className="min-h-0 flex-1">
        <PageBody>
          {isLoading ? (
            <Frame>
              <FramePanel className="space-y-3 p-4">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-5 w-1/2" />
              </FramePanel>
            </Frame>
          ) : proxies.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="default">
                  <RouteEmptyArt icon={Network} badge={Plus} tone="teal" />
                </EmptyMedia>
                <EmptyTitle>No proxies configured</EmptyTitle>
                <EmptyDescription>
                  Authenticated HTTP, HTTPS, and SOCKS5 proxies run through an isolated loopback
                  SOCKS5 bridge with encrypted credentials at rest.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="flex-row justify-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => setBulkOpen(true)}>
                  Bulk add proxies
                </Button>
                <Button size="sm" variant="default" onClick={openCreateModal}>
                  Add first proxy
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Frame>
              <FramePanel className="overflow-hidden p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={density === 'compact' ? 'h-8 px-3' : 'px-3'}>Label</TableHead>
                      <TableHead className={density === 'compact' ? 'h-8 px-3' : 'px-3'}>Endpoint</TableHead>
                      <TableHead className={density === 'compact' ? 'h-8 px-3' : 'px-3'}>Health / Geo</TableHead>
                      <TableHead className={density === 'compact' ? 'h-8 px-3 text-right' : 'px-3 text-right'}>Traffic</TableHead>
                      <TableHead className={density === 'compact' ? 'h-8 px-3 text-right' : 'px-3 text-right'}>Profiles</TableHead>
                      <TableHead className={density === 'compact' ? 'h-8 px-3 text-right' : 'px-3 text-right'}>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {proxies.map((proxy) => {
                      const testing = testingIds.has(proxy.id);
                      const check = proxy.lastCheck;
                      return (
                        <TableRow key={proxy.id} className={rowHeight}>
                          <TableCell className="px-3 font-medium">
                            <div className="flex items-center gap-2">
                              <span>{proxy.label}</span>
                              {proxy.hasAuth && <Badge variant="secondary">Auth</Badge>}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono-tabular px-3 text-xs">
                            <span className="text-muted-foreground uppercase">{proxy.protocol}</span>{' '}
                            {proxy.host}:{proxy.port}
                          </TableCell>
                          <TableCell className="px-3 text-xs">
                            {check ? (
                              check.ok ? (
                                <Badge variant="success">
                                  <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                                  {proxy.country ?? 'OK'} • {check.latencyMs ?? 0}ms
                                </Badge>
                              ) : (
                                <Badge variant="error">
                                  <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                                  Failed
                                </Badge>
                              )
                            ) : (
                              <span className="text-muted-foreground">Unchecked</span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono-tabular px-3 text-right text-xs text-muted-foreground">
                            ↑ {formatBytes(proxy.bytesUpTotal)} / ↓ {formatBytes(proxy.bytesDownTotal)}
                          </TableCell>
                          <TableCell className="font-mono-tabular px-3 text-right text-muted-foreground">
                            {proxy.assignedCount}
                          </TableCell>
                          <TableCell className="px-3">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={testing}
                                onClick={() => void handleTestOne(proxy.id)}
                              >
                                <Play className="size-3" strokeWidth={1.5} />
                                {testing ? 'Testing...' : 'Test'}
                              </Button>
                              <Menu>
                                <MenuTrigger
                                  render={
                                    <Button
                                      size="icon-sm"
                                      variant="ghost"
                                      aria-label="More actions"
                                    />
                                  }
                                >
                                  <MoreHorizontal className="size-3.5" strokeWidth={1.5} />
                                </MenuTrigger>
                                <MenuPopup align="end">
                                  {proxy.hasAuth && (
                                    <MenuItem
                                      onClick={async () => {
                                        const res = await zitaIpc.revealProxyPassword(proxy.id);
                                        setRevealedPassword({
                                          label: proxy.label,
                                          value: res.password ?? '(no password set)',
                                        });
                                      }}
                                    >
                                      <Eye className="size-3.5" strokeWidth={1.5} />
                                      Reveal password
                                    </MenuItem>
                                  )}
                                  <MenuItem onClick={() => openEditModal(proxy)}>
                                    <Pencil className="size-3.5" strokeWidth={1.5} />
                                    Edit proxy
                                  </MenuItem>
                                  <MenuItem
                                    onClick={async () => {
                                      await zitaIpc.duplicateProxy(proxy.id);
                                      onRefresh();
                                    }}
                                  >
                                    <Copy className="size-3.5" strokeWidth={1.5} />
                                    Duplicate proxy
                                  </MenuItem>
                                  <MenuSeparator />
                                  <MenuItem
                                    variant="destructive"
                                    onClick={async () => {
                                      await zitaIpc.deleteProxy(proxy.id);
                                      onRefresh();
                                    }}
                                  >
                                    <Trash2 className="size-3.5" strokeWidth={1.5} />
                                    Delete proxy
                                  </MenuItem>
                                </MenuPopup>
                              </Menu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </FramePanel>
            </Frame>
          )}
        </PageBody>
      </ScrollArea>

      <ProxyDialog
        open={editModalOpen}
        onOpenChange={setEditModalOpen}
        editingProxy={editingProxy}
        onSaved={() => onRefresh()}
      />

      {/* Bulk Add Dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogPopup className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk add proxies</DialogTitle>
            <DialogDescription>
              Paste one proxy per line: <code className="font-mono-tabular">host:port:user:pass</code>{' '}
              or <code className="font-mono-tabular">socks5://user:pass@host:port</code>.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Default protocol:</span>
              <Select
                items={PROTOCOL_ITEMS}
                value={bulkProto}
                onValueChange={(val) => {
                  if (val) setBulkProto(val as ProxyProtocol);
                }}
              >
                <SelectTrigger size="sm" className="w-32 min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  {PROTOCOL_ITEMS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
            <Textarea
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={'203.0.113.10:1080:user1:pass1\nsocks5://user2:pass2@203.0.113.11:1080'}
              className="font-mono-tabular [&_textarea]:h-40 [&_textarea]:text-xs"
            />
          </DialogPanel>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="default"
              disabled={!bulkText.trim()}
              onClick={() => void handleBulkImport()}
            >
              Import proxies
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      {/* Reveal Password Dialog */}
      <Dialog
        open={Boolean(revealedPassword)}
        onOpenChange={(o) => !o && setRevealedPassword(null)}
      >
        <DialogPopup className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Password for {revealedPassword?.label}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div className="font-mono-tabular rounded-md border bg-muted/40 px-3 py-2 text-sm select-all">
              {revealedPassword?.value}
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (revealedPassword) void navigator.clipboard.writeText(revealedPassword.value);
                toastManager.add({ title: 'Password copied', type: 'info' });
              }}
            >
              Copy
            </Button>
            <Button size="sm" variant="default" onClick={() => setRevealedPassword(null)}>
              Done
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </Page>
  );
}
