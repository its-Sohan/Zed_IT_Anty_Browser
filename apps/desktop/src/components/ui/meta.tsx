import type * as React from 'react';
import { cn } from '@/lib/utils';
import { FieldLabel } from '@/components/ui/field';

/**
 * Small read-only data primitives shared by Settings and the profile editor:
 * a label + monospace value box, and a label/value row. Replaces the
 * hand-rolled `rounded-md border bg-muted/40 px-3 py-2` blocks.
 */
export function CodeBlock({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div>
      <FieldLabel className="text-xs font-medium text-muted-foreground">{label}</FieldLabel>
      <div
        className={cn(
          'font-mono-tabular mt-1 rounded-md border bg-muted/40 px-3 py-2 text-xs',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function MetaRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div className={cn('flex items-center justify-between gap-4', className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono-tabular text-right font-medium">{children}</span>
    </div>
  );
}
