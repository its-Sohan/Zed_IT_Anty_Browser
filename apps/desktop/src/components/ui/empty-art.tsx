import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Per-route Empty art. Coss `EmptyMedia variant="icon"` is a single 36px tile —
 * every route looked identical except for the glyph. This composes a larger
 * illustrated slot (dashed backdrop + card tile + optional badge) so each
 * route recognises itself, without new image assets.
 */
export function RouteEmptyArt({
  icon: Icon,
  badge: BadgeIcon,
  tone = 'primary',
  className,
}: {
  icon: LucideIcon;
  badge?: LucideIcon;
  tone?: 'primary' | 'teal' | 'indigo';
  className?: string;
}): React.ReactElement {
  return (
    <div aria-hidden="true" className={cn('relative size-16', className)}>
      <div className="absolute inset-0 rounded-2xl border border-dashed bg-muted/40" />
      <div
        className={cn(
          'absolute left-1/2 top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl border bg-card shadow-sm/5',
          tone === 'primary' && 'text-primary',
          tone === 'teal' && 'text-chart-2',
          tone === 'indigo' && 'text-chart-3',
        )}
      >
        <Icon className="size-5" strokeWidth={1.5} />
      </div>
      {BadgeIcon && (
        <div className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-lg border bg-background text-muted-foreground shadow-sm/5">
          <BadgeIcon className="size-3.5" strokeWidth={1.5} />
        </div>
      )}
    </div>
  );
}
