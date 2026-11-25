"use client";

import React from "react";
import { Divider } from "@fluentui/react-components";
import { cn } from "@/lib/utils";

export function Separator({
  className,
  orientation = "horizontal",
  ...props
}: Omit<React.ComponentProps<typeof Divider>, "vertical"> & {
  orientation?: "horizontal" | "vertical";
}): React.ReactElement {
  return (
    <Divider
      vertical={orientation === "vertical"}
      className={cn("shrink-0", className)}
      data-slot="separator"
      {...props}
    />
  );
}
