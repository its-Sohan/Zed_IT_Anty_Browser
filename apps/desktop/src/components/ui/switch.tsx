"use client";

import React from "react";
import { Switch as FluentSwitch } from "@fluentui/react-components";
import { cn } from "@/lib/utils";

export interface SwitchProps {
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean, event: unknown) => void;
  className?: string;
  id?: string;
  [key: string]: unknown;
}

export function Switch({
  className,
  checked,
  defaultChecked,
  onCheckedChange,
  ...props
}: SwitchProps): React.ReactElement {
  return (
    <FluentSwitch
      className={cn("inline-flex shrink-0", className)}
      checked={checked}
      defaultChecked={defaultChecked}
      onChange={(event, data) => onCheckedChange?.(data.checked, event)}
      {...props}
    />
  );
}
