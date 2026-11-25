"use client";

import React from "react";
import { Label as FluentLabel } from "@fluentui/react-components";
import { cn } from "@/lib/utils";

export function Label({
  className,
  ...props
}: React.ComponentProps<typeof FluentLabel>): React.ReactElement {
  return (
    <FluentLabel
      className={cn("inline-flex items-center gap-2 text-foreground", className)}
      data-slot="label"
      {...props}
    />
  );
}
