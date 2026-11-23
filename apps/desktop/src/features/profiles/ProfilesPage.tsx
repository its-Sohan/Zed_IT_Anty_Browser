import { useEffect, useMemo, useState, type RefObject } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  FileSpreadsheet,
  FlaskConical,
  FolderPlus,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Square,
  Trash2,
  Zap,
} from 'lucide-react';
import type { DensityPreference, ProfilesOverview, ProfileSummary, ProxySummary } from '@zita/shared';
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Frame, FramePanel } from '@/components/ui/frame';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { Kbd } from '@/components/ui/kbd';
import { Label } from '@/components/ui/label';
import { Popover, PopoverPopup, PopoverTrigger } from '@/components/ui/popover';
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
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toastManager } from '@/components/ui/toast';
import { IpcClientError, zitaIpc } from '@/lib/ipc';
import { cn } from '@/lib/utils';
import { CsvImportDialog } from './CsvImportDialog';

export interface ProfilesPageProps {
  overview: ProfilesOverview | undefined;
  proxies: ProxySummary[];
  isLoading: boolean;
  view: 'all' | 'running' | 'trash';
  search: string;
  onSearchChange: (val: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  density: DensityPreference;
  activeFolderId?: string;
  activeStatusId?: string;
  activeTagId?: string;
  onClearFilters: () => void;
  onRefresh: () => void;
  onNewProfile: () => void;
  onEditProfile: (profileId: string) => void;
  onOpenLab: (profileId: string) => void;
  onEditProxies: () => void;
}

const COLUMN_STORAGE_KEY = 'zita-profiles-columns-v1';
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const colHelper = createColumnHelper<ProfileSummary>();

export function ProfilesPage({
  overview,
  proxies,
  isLoading,
  view,
  search,
  onSearchChange,
  searchInputRef,
  density,
  activeFolderId,
  activeStatusId,
  activeTagId,
  onClearFilters,
  onRefresh,
  onNewProfile,
  onEditProfile,
  onOpenLab,
  onEditProxies,
}: ProfilesPageProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [sortCol, setSortCol] = useState<'name' | 'os' | 'launchCount' | 'lastStartedAt'>('name');
  const [sortDir, setSortDir] = useState<'ascending' | 'descending'>('ascending');
  const [sortStatusMsg, setSortStatusMsg] = useState('');
  const [csvOpen, setCsvOpen] = useState(false);
  const [proxyFailPrompt, setProxyFailPrompt] = useState<{
    profileId: string;
    message: string;
  } | null>(null);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    try {
      const saved = localStorage.getItem(COLUMN_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as VisibilityState) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(columnVisibility));
    } catch {
      // ignore
    }
  }, [columnVisibility]);

  const rawProfiles = overview?.profiles ?? [];

  const sortedProfiles = useMemo(() => {
    const factor = sortDir === 'ascending' ? 1 : -1;
    return [...rawProfiles].sort((a, b) => {
      if (sortCol === 'launchCount') {
        return factor * (a.launchCount - b.launchCount);
      }
      if (sortCol === 'lastStartedAt') {
        return factor * collator.compare(a.lastStartedAt ?? '', b.lastStartedAt ?? '');
      }
      if (sortCol === 'os') {
        return factor * collator.compare(`${a.os} ${a.osVersion}`, `${b.os} ${b.osVersion}`);
      }
      return factor * collator.compare(a.name, b.name);
    });
  }, [rawProfiles, sortCol, sortDir]);

  const proxyById = useMemo(() => new Map(proxies.map((p) => [p.id, p])), [proxies]);
  const statusById = useMemo(
    () => new Map((overview?.statuses ?? []).map((s) => [s.id, s])),
    [overview?.statuses],
  );
  const folderById = useMemo(
    () => new Map((overview?.folders ?? []).map((f) => [f.id, f])),
    [overview?.folders],
  );

  const toggleSort = (col: typeof sortCol, label: string) => {
    const nextDir = sortCol === col && sortDir === 'ascending' ? 'descending' : 'ascending';
    setSortCol(col);
    setSortDir(nextDir);
    setSortStatusMsg(`Sorted by ${label}, ${nextDir}, ${sortedProfiles.length} rows`);
  };

  const handleLaunch = async (
    profileId: string,
    opts?: { allowWithoutProxy?: boolean; skipProxyCheck?: boolean },
  ) => {
    setBusyIds((prev) => new Set(prev).add(profileId));
    try {
      await zitaIpc.launchProfile({ id: profileId, ...opts });
      toastManager.add({ title: 'Profile launched', type: 'success' });
      onRefresh();
    } catch (err) {
      if (err instanceof IpcClientError && err.code === 'PROXY_CHECK_FAILED') {
        setProxyFailPrompt({ profileId, message: err.message });
      } else {
        toastManager.add({
          title: 'Launch failed',
          description: err instanceof Error ? err.message : 'Unable to start browser',
          type: 'error',
        });
      }
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(profileId);
        return next;
      });
    }
  };

  const handleStop = async (profileId: string) => {
    setBusyIds((prev) => new Set(prev).add(profileId));
    try {
      await zitaIpc.stopProfile(profileId);
      toastManager.add({ title: 'Profile stopped', type: 'info' });
      onRefresh();
    } catch (err) {
      toastManager.add({
        title: 'Stop failed',
        description: err instanceof Error ? err.message : 'Error stopping browser',
        type: 'error',
      });
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(profileId);
        return next;
      });
    }
  };

  // Keyboard shortcuts: S start, X stop on single selected row
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (selectedIds.size !== 1) return;
      const targetId = Array.from(selectedIds)[0]!;
      const prof = rawProfiles.find((p) => p.id === targetId);
      if (!prof) return;
      if (e.key.toLowerCase() === 's' && !prof.running) {
        e.preventDefault();
        void handleLaunch(targetId);
      } else if (e.key.toLowerCase() === 'x' && prof.running) {
        e.preventDefault();
        void handleStop(targetId);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onEditProfile(targetId);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedIds, rawProfiles]);

  const handleQuickProfile = async () => {
    try {
      await zitaIpc.quickCreateProfile('windows');
      toastManager.add({ title: 'Quick profile created', type: 'success' });
      onRefresh();
    } catch (err) {
      toastManager.add({
        title: 'Cannot create profile',
        description: err instanceof Error ? err.message : 'Check license limits',
        type: 'error',
      });
    }
  };

  const handleCopy = async (id: string) => {
    try {
      await zitaIpc.copyProfile({ id, randomizeSeed: true });
      toastManager.add({ title: 'Profile duplicated with new seed', type: 'success' });
      onRefresh();
    } catch (err) {
      toastManager.add({
        title: 'Copy failed',
        description: err instanceof Error ? err.message : 'Error',
        type: 'error',
      });
    }
  };

  const columns = useMemo(
    () => [
      colHelper.display({
        id: 'select',
        header: () => (
          <Checkbox
            aria-label="Select all visible profiles"
            checked={sortedProfiles.length > 0 && selectedIds.size === sortedProfiles.length}
            indeterminate={selectedIds.size > 0 && selectedIds.size < sortedProfiles.length}
            onCheckedChange={(checked) => {
              if (checked) {
                setSelectedIds(new Set(sortedProfiles.map((p) => p.id)));
              } else {
                setSelectedIds(new Set());
              }
            }}
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={`Select ${row.original.name}`}
            checked={selectedIds.has(row.original.id)}
            onCheckedChange={(checked) => {
              setSelectedIds((prev) => {
                const next = new Set(prev);
                if (checked) next.add(row.original.id);
                else next.delete(row.original.id);
                return next;
              });
            }}
          />
        ),
      }),
      colHelper.accessor('name', {
        header: 'Profile',
        cell: ({ row }) => {
          const st = row.original.statusId ? statusById.get(row.original.statusId) : undefined;
          return (
            <div className="flex min-w-0 items-center gap-2">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{
                  backgroundColor: row.original.running ? '#22C55E' : st?.color ?? '#9A9AA3',
                }}
              />
              <Button
                variant="link"
                size="xs"
                onClick={() => onEditProfile(row.original.id)}
                className="h-auto truncate p-0 text-left font-medium text-foreground"
              >
                {row.original.name}
              </Button>
              {row.original.running && (
                <Badge variant="success">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                  Running
                </Badge>
              )}
            </div>
          );
        },
      }),
      colHelper.display({
        id: 'proxy',
        header: 'Proxy',
        cell: ({ row }) => {
          const p = row.original.proxyId ? proxyById.get(row.original.proxyId) : undefined;
          if (!p) return <span className="text-muted-foreground">Direct</span>;
          return (
            <span className="font-mono-tabular text-xs">
              {p.country ? `[${p.country}] ` : ''}
              {p.host}:{p.port}
            </span>
          );
        },
      }),
      colHelper.display({
        id: 'folder',
        header: 'Folder',
        cell: ({ row }) => {
          const f = row.original.folderId ? folderById.get(row.original.folderId) : undefined;
          return <span className="text-muted-foreground">{f?.name ?? '—'}</span>;
        },
      }),
      colHelper.accessor('os', {
        header: 'Fingerprint',
        cell: ({ row }) => (
          <span className="font-mono-tabular text-xs text-muted-foreground">
            {row.original.os} {row.original.osVersion} • {String(row.original.seed).slice(0, 6)}
          </span>
        ),
      }),
      colHelper.accessor('launchCount', {
        header: 'Launches',
        cell: ({ row }) => (
          <span className="font-mono-tabular text-muted-foreground">{row.original.launchCount}</span>
        ),
      }),
      colHelper.display({
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const p = row.original;
          const busy = busyIds.has(p.id);
          if (view === 'trash') {
            return (
              <div className="flex items-center justify-end gap-1">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={async () => {
                    await zitaIpc.restoreProfile(p.id);
                    onRefresh();
                  }}
                >
                  <RotateCcw className="size-3.5" strokeWidth={1.5} />
                  Restore
                </Button>
                <Button
                  size="xs"
                  variant="destructive"
                  onClick={async () => {
                    await zitaIpc.permanentDeleteProfile(p.id);
                    onRefresh();
                  }}
                >
                  Delete forever
                </Button>
              </div>
            );
          }

          return (
            <div className="flex items-center justify-end gap-1">
              {p.running ? (
                <Button
                  size="xs"
                  variant="destructive"
                  disabled={busy}
                  onClick={() => void handleStop(p.id)}
                >
                  <Square className="size-3" strokeWidth={1.5} />
                  Stop
                </Button>
              ) : (
                <Button
                  size="xs"
                  variant="default"
                  disabled={busy}
                  onClick={() => void handleLaunch(p.id)}
                >
                  <Play className="size-3" strokeWidth={1.5} />
                  Start
                </Button>
              )}
              <Button
                size="icon-sm"
                variant="ghost"
                title="Edit profile"
                aria-label="Edit profile"
                onClick={() => onEditProfile(p.id)}
              >
                <Pencil className="size-3.5" strokeWidth={1.5} />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                title="Copy with new seed"
                aria-label="Copy with new seed"
                onClick={() => void handleCopy(p.id)}
              >
                <Copy className="size-3.5" strokeWidth={1.5} />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                title="Check in Fingerprint Lab"
                aria-label="Check in Fingerprint Lab"
                onClick={() => onOpenLab(p.id)}
              >
                <FlaskConical className="size-3.5" strokeWidth={1.5} />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                title="Move to Trash"
                aria-label="Move to Trash"
                disabled={p.running}
                onClick={async () => {
                  try {
                    await zitaIpc.softDeleteProfile(p.id);
                    onRefresh();
                  } catch (err) {
                    toastManager.add({
                      title: 'Delete failed',
                      description: err instanceof Error ? err.message : 'Error',
                      type: 'error',
                    });
                  }
                }}
              >
                <Trash2 className="size-3.5" strokeWidth={1.5} />
              </Button>
            </div>
          );
        },
      }),
    ],
    [sortedProfiles, selectedIds, busyIds, view, proxyById, statusById, folderById],
  );

  const table = useReactTable({
    data: sortedProfiles,
    columns,
    state: { columnVisibility },
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
  });

  const hasFilters = Boolean(search.trim() || activeFolderId || activeStatusId || activeTagId);
  const rowHeight = density === 'compact' ? 'h-8' : 'h-10';
  const viewTitle =
    view === 'running' ? 'Running profiles' : view === 'trash' ? 'Trash' : 'All profiles';

  const bulkProxyItems = useMemo(
    () => [
      { value: '__none__', label: 'Direct (No proxy)' },
      ...proxies.map((p) => ({ value: p.id, label: p.label })),
    ],
    [proxies],
  );

  const bulkStatusItems = useMemo(
    () => (overview?.statuses ?? []).map((s) => ({ value: s.id, label: s.name })),
    [overview?.statuses],
  );

  const runBulk = async (action: Parameters<typeof zitaIpc.bulkProfileAction>[0]) => {
    try {
      await zitaIpc.bulkProfileAction(action);
      setSelectedIds(new Set());
      onRefresh();
      toastManager.add({ title: 'Bulk action completed', type: 'success' });
    } catch (err) {
      toastManager.add({
        title: 'Bulk action failed',
        description: err instanceof Error ? err.message : 'Error',
        type: 'error',
      });
    }
  };

  return (
    <div className="relative flex h-full flex-col">
      <div role="status" className="visually-hidden">
        {sortStatusMsg}
      </div>

      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-card px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h1 className="text-[15px] font-semibold">{viewTitle}</h1>
          <Badge variant="secondary">{sortedProfiles.length}</Badge>
          {hasFilters && (
            <Button size="xs" variant="ghost" onClick={onClearFilters}>
              Clear filters
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="w-60">
            <InputGroup>
              <InputGroupAddon align="inline-start">
                <Search className="size-4" strokeWidth={1.5} />
              </InputGroupAddon>
              <InputGroupInput
                ref={searchInputRef}
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Search profiles, proxies, tags..."
                aria-label="Search profiles"
              />
              <InputGroupAddon align="inline-end">
                <Kbd>/</Kbd>
              </InputGroupAddon>
            </InputGroup>
          </div>

          <Popover>
            <PopoverTrigger render={<Button size="sm" variant="outline" />}>
              <SlidersHorizontal className="size-3.5" strokeWidth={1.5} />
              Columns
            </PopoverTrigger>
            <PopoverPopup align="end" className="w-48 p-2">
              <div className="space-y-1">
                {table
                  .getAllLeafColumns()
                  .filter((c) => c.id !== 'select' && c.id !== 'actions')
                  .map((col) => (
                    <Label
                      key={col.id}
                      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-normal hover:bg-accent"
                    >
                      <Checkbox
                        checked={col.getIsVisible()}
                        onCheckedChange={(checked) => col.toggleVisibility(Boolean(checked))}
                      />
                      <span className="capitalize">{col.id}</span>
                    </Label>
                  ))}
              </div>
            </PopoverPopup>
          </Popover>

          <Button size="sm" variant="outline" onClick={() => setCsvOpen(true)}>
            <FileSpreadsheet className="size-3.5" strokeWidth={1.5} />
            Import CSV
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void handleQuickProfile()}>
            <Zap className="size-3.5" strokeWidth={1.5} />
            Quick profile
          </Button>
          <Button size="sm" variant="default" onClick={onNewProfile}>
            <Plus className="size-3.5" strokeWidth={1.5} />
            New profile
          </Button>
        </div>
      </div>

      {/* Table / Empty State */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4 pb-20">
          {isLoading ? (
            <Frame>
              <FramePanel className="space-y-3 p-4">
                <Skeleton className="h-5 w-1/3" />
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-5 w-1/2" />
              </FramePanel>
            </Frame>
          ) : sortedProfiles.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  {view === 'trash' ? (
                    <Trash2 strokeWidth={1.5} />
                  ) : (
                    <FolderPlus strokeWidth={1.5} />
                  )}
                </EmptyMedia>
                <EmptyTitle>
                  {hasFilters
                    ? 'No profiles match your filters'
                    : view === 'trash'
                      ? 'Trash is empty'
                      : view === 'running'
                        ? 'No profiles are currently running'
                        : 'No browser profiles yet'}
                </EmptyTitle>
                <EmptyDescription>
                  {hasFilters
                    ? 'Clear the search query or sidebar filters to view all local profiles.'
                    : view === 'trash'
                      ? 'Soft-deleted profiles remain recoverable for 48 hours before permanent deletion.'
                      : view === 'running'
                        ? 'Launch any profile from All profiles to see it here.'
                        : 'Create a clean profile with a coherent fingerprint and optional proxy in under two clicks.'}
                </EmptyDescription>
              </EmptyHeader>
              {(hasFilters || view === 'all') && (
                <EmptyContent className="flex-row justify-center gap-2">
                  {hasFilters ? (
                    <Button size="sm" variant="secondary" onClick={onClearFilters}>
                      Reset filters
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="secondary" onClick={() => void handleQuickProfile()}>
                        Quick profile
                      </Button>
                      <Button size="sm" variant="default" onClick={onNewProfile}>
                        Create first profile
                      </Button>
                    </>
                  )}
                </EmptyContent>
              )}
            </Empty>
          ) : (
            <Frame>
              <FramePanel className="p-0">
                <Table className="min-w-[760px]">
                  <TableCaption className="sr-only">Browser Profiles</TableCaption>
                  <TableHeader>
                    {table.getHeaderGroups().map((hg) => (
                      <TableRow key={hg.id}>
                        {hg.headers.map((header) => {
                          const sortableMap: Record<
                            string,
                            { col: typeof sortCol; label: string }
                          > = {
                            name: { col: 'name', label: 'Profile' },
                            os: { col: 'os', label: 'Fingerprint' },
                            launchCount: { col: 'launchCount', label: 'Launches' },
                          };
                          const sortMeta = sortableMap[header.column.id];
                          const isSorted = sortMeta && sortCol === sortMeta.col;

                          return (
                            <TableHead
                              key={header.id}
                              scope="col"
                              aria-sort={isSorted ? sortDir : undefined}
                              className={cn(
                                sortMeta ? 'p-0' : 'px-3',
                                header.column.id === 'actions' && 'text-right',
                              )}
                            >
                              {sortMeta ? (
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  onClick={() => toggleSort(sortMeta.col, sortMeta.label)}
                                  className="h-9 w-full justify-start gap-1.5 rounded-none px-3 font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground"
                                >
                                  <span>{sortMeta.label}</span>
                                  {isSorted &&
                                    (sortDir === 'ascending' ? (
                                      <ArrowUp aria-hidden="true" className="size-3" />
                                    ) : (
                                      <ArrowDown aria-hidden="true" className="size-3" />
                                    ))}
                                </Button>
                              ) : (
                                flexRender(header.column.columnDef.header, header.getContext())
                              )}
                            </TableHead>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        data-state={selectedIds.has(row.original.id) ? 'selected' : undefined}
                        className={rowHeight}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id} className="px-3">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </FramePanel>
            </Frame>
          )}
        </div>
      </ScrollArea>

      {/* Bulk Bar (§8.3) */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-12 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl border bg-popover px-3 py-2 shadow-lg/5">
          <Badge variant="default">{selectedIds.size} selected</Badge>
          {view !== 'trash' ? (
            <>
              <Button
                size="xs"
                variant="default"
                onClick={() => void runBulk({ action: 'launch', ids: Array.from(selectedIds) })}
              >
                Start
              </Button>
              <Button
                size="xs"
                variant="secondary"
                onClick={() => void runBulk({ action: 'stop', ids: Array.from(selectedIds) })}
              >
                Stop
              </Button>
              <Select
                items={bulkProxyItems}
                value={null}
                onValueChange={(val) => {
                  if (!val) return;
                  void runBulk({
                    action: 'assign_proxy',
                    ids: Array.from(selectedIds),
                    proxyId: val === '__none__' ? null : val,
                  });
                }}
              >
                <SelectTrigger size="sm" className="w-40" aria-label="Bulk assign proxy">
                  <SelectValue placeholder="Assign proxy..." />
                </SelectTrigger>
                <SelectPopup>
                  {bulkProxyItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <Select
                items={bulkStatusItems}
                value={null}
                onValueChange={(val) => {
                  if (val) {
                    void runBulk({
                      action: 'set_status',
                      ids: Array.from(selectedIds),
                      statusId: val,
                    });
                  }
                }}
              >
                <SelectTrigger size="sm" className="w-36 min-w-0" aria-label="Bulk set status">
                  <SelectValue placeholder="Set status..." />
                </SelectTrigger>
                <SelectPopup>
                  {bulkStatusItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <Button
                size="xs"
                variant="destructive"
                onClick={() =>
                  void runBulk({ action: 'soft_delete', ids: Array.from(selectedIds) })
                }
              >
                Trash
              </Button>
            </>
          ) : (
            <Button
              size="xs"
              variant="secondary"
              onClick={() => void runBulk({ action: 'restore', ids: Array.from(selectedIds) })}
            >
              Restore selected
            </Button>
          )}
          <Button size="xs" variant="ghost" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <CsvImportDialog open={csvOpen} onOpenChange={setCsvOpen} onImported={onRefresh} />

      <AlertDialog
        open={Boolean(proxyFailPrompt)}
        onOpenChange={(o) => !o && setProxyFailPrompt(null)}
      >
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Proxy check failed</AlertDialogTitle>
            <AlertDialogDescription>
              {proxyFailPrompt?.message}. Launching without a working proxy exposes your host IP
              address.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button size="sm" variant="outline" />}>
              Cancel
            </AlertDialogClose>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setProxyFailPrompt(null);
                onEditProxies();
              }}
            >
              Edit proxies
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                const target = proxyFailPrompt?.profileId;
                setProxyFailPrompt(null);
                if (target) void handleLaunch(target, { allowWithoutProxy: true });
              }}
            >
              Launch without proxy
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  );
}
