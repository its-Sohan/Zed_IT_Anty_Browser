import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Page shell primitives.
 *
 * Every route used to hand-roll `border-b bg-card px-4 py-2.5` + `text-[15px]`.
 * One shell keeps band heights, gutters, type roles and elevation identical
 * across routes.
 */

export function Page({
  className,
  ...props
}: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      className={cn('relative flex h-full min-h-0 flex-col bg-background', className)}
      data-slot="page"
      {...props}
    />
  );
}

export function PageHeader({
  className,
  ...props
}: React.ComponentProps<'header'>): React.ReactElement {
  return (
    <header
      className={cn(
        'sticky top-0 z-20 flex min-h-13 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2',
        'border-b border-border/80 bg-background/85 px-5 py-2',
        'supports-[backdrop-filter]:bg-background/72 backdrop-blur-xl',
        className,
      )}
      data-slot="page-header"
      {...props}
    />
  );
}

export function PageHeading({
  className,
  ...props
}: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      className={cn('flex min-w-0 flex-wrap items-center gap-2.5', className)}
      data-slot="page-heading"
      {...props}
    />
  );
}

export function PageTitle({
  className,
  ...props
}: React.ComponentProps<'h1'>): React.ReactElement {
  return (
    <h1
      className={cn('type-page-title m-0 truncate text-foreground', className)}
      data-slot="page-title"
      {...props}
    />
  );
}

export function PageDescription({
  className,
  ...props
}: React.ComponentProps<'p'>): React.ReactElement {
  return (
    <p
      className={cn('m-0 min-w-0 truncate text-xs text-muted-foreground', className)}
      data-slot="page-description"
      {...props}
    />
  );
}

export function PageActions({
  className,
  ...props
}: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-1.5', className)}
      data-slot="page-actions"
      {...props}
    />
  );
}

export function PageBody({
  className,
  ...props
}: React.ComponentProps<'div'>): React.ReactElement {
  return (
    <div
      className={cn('flex min-h-0 w-full flex-1 flex-col px-5 py-4', className)}
      data-slot="page-body"
      {...props}
    />
  );
}
