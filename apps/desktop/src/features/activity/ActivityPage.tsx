import { useMemo, useState } from 'react';
import { Activity, Clock, Search } from 'lucide-react';
import type { ActivityLogItem } from '@zita/shared';
import { Badge } from '@/components/ui/badge';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { RouteEmptyArt } from '@/components/ui/empty-art';
import { Frame, FramePanel } from '@/components/ui/frame';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import {
  Page,
  PageActions,
  PageBody,
  PageHeading,
  PageHeader,
  PageTitle,
} from '@/components/ui/page';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';

export interface ActivityPageProps {
  items: ActivityLogItem[] | undefined;
  isLoading: boolean;
}

export function ActivityPage({ items, isLoading }: ActivityPageProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const list = items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (i) =>
        i.action.toLowerCase().includes(q) ||
        (i.profileId ?? '').toLowerCase().includes(q) ||
        (i.metaJson ?? '').toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <Page>
      <PageHeader>
        <PageHeading>
          <PageTitle>Activity</PageTitle>
          <Badge variant="secondary" className="type-numeric">
            {filtered.length}
          </Badge>
        </PageHeading>
        <PageActions>
          <div className="w-52 shrink-0">
            <InputGroup>
              <InputGroupAddon align="inline-start">
                <Search className="size-4" strokeWidth={1.5} />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter actions or profile IDs..."
                aria-label="Filter activity log"
              />
            </InputGroup>
          </div>
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
          ) : filtered.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="default">
                  <RouteEmptyArt icon={Activity} badge={Clock} tone="indigo" />
                </EmptyMedia>
                <EmptyTitle>No recorded activity</EmptyTitle>
                <EmptyDescription>
                  Profile creates, launches, stops, and imports appear here with credentials redacted.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Frame>
              <FramePanel className="overflow-hidden p-0">
                <ul className="divide-y">
                  {filtered.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Badge variant="outline">{entry.action}</Badge>
                        {entry.profileId && (
                          <span className="font-mono-tabular text-xs text-muted-foreground">
                            {entry.profileId}
                          </span>
                        )}
                        {entry.metaJson && (
                          <span className="font-mono-tabular truncate text-xs text-muted-foreground">
                            {entry.metaJson}
                          </span>
                        )}
                      </div>
                      <span className="font-mono-tabular shrink-0 text-xs text-muted-foreground">
                        {entry.createdAt}
                      </span>
                    </li>
                  ))}
                </ul>
              </FramePanel>
            </Frame>
          )}
        </PageBody>
      </ScrollArea>
    </Page>
  );
}
