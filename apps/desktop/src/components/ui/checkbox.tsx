"use client";

import React from "react";
import { Checkbox as FluentCheckbox } from "@fluentui/react-components";
import { cn } from "@/lib/utils";

export interface CheckboxProps {
  checked?: boolean;
  indeterminate?: boolean;
  onCheckedChange?: (checked: boolean, event: unknown) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
  [key: string]: unknown;
}

export function Checkbox({
  className,
  checked,
  indeterminate,
  onCheckedChange,
  ...props
}: CheckboxProps): React.ReactElement {
  return (
    <FluentCheckbox
      className={cn("inline-flex shrink-0", className)}
      checked={indeterminate ? "mixed" : (checked ?? false)}
      onChange={(event, data) => onCheckedChange?.(data.checked === true, event)}
      {...props}
    />
  );
}
