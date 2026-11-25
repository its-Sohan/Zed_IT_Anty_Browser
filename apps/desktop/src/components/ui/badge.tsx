"use client";

import React from "react";
import { Badge as FluentBadge } from "@fluentui/react-components";
import { cn } from "@/lib/utils";

const fluentAppearanceByVariant = {
  default: { appearance: "filled", color: "brand" },
  secondary: { appearance: "tint", color: "subtle" },
  outline: { appearance: "outline", color: "subtle" },
  destructive: { appearance: "filled", color: "danger" },
  error: { appearance: "tint", color: "danger" },
  info: { appearance: "tint", color: "informative" },
  success: { appearance: "tint", color: "success" },
  warning: { appearance: "tint", color: "severe" },
} as const;

const fluentSizeBySize = {
  sm: "small",
  default: "medium",
  lg: "large",
} as const;

export interface BadgeProps extends Omit<React.ComponentProps<typeof FluentBadge>, "size"> {
  variant?: keyof typeof fluentAppearanceByVariant;
  size?: keyof typeof fluentSizeBySize;
}

export function Badge({
  className,
  variant = "default",
  size = "default",
  ...props
}: BadgeProps): React.ReactElement {
  const appearance = fluentAppearanceByVariant[variant];

  return (
    <FluentBadge
      appearance={appearance.appearance}
      color={appearance.color}
      size={fluentSizeBySize[size]}
      className={cn("inline-flex shrink-0 items-center", className)}
      data-slot="badge"
      {...props}
    />
  );
}
