"use client";

import { Spinner as FluentSpinner } from "@fluentui/react-components";
import type React from "react";
import { cn } from "@/lib/utils";

export function Spinner({
  className,
  ...props
}: React.ComponentProps<typeof FluentSpinner>): React.ReactElement {
  return (
    <FluentSpinner
      role="status"
      aria-label="Loading"
      style={{ color: "inherit" }}
      className={cn("relative inline-block shrink-0", className)}
      {...props}
    />
  );
}
