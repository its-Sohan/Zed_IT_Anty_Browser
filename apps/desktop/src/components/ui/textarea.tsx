"use client";

import React from "react";
import { Textarea as FluentTextarea } from "@fluentui/react-components";
import { cn } from "@/lib/utils";

export type TextareaProps = Omit<
  React.ComponentProps<typeof FluentTextarea> & React.RefAttributes<HTMLTextAreaElement>,
  "size" | "onChange"
> & {
  size?: "sm" | "default" | "lg";
  unstyled?: boolean;
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
};

export function Textarea({
  className,
  size = "default",
  unstyled = false,
  ...props
}: TextareaProps): React.ReactElement {
  const fluentSize = size === "sm" ? "small" : size === "lg" ? "large" : "medium";

  return (
    <span
      className={cn("relative inline-grid w-full", className) || undefined}
      data-size={size}
      data-slot="textarea-control"
    >
      <FluentTextarea
        className={cn(
          "field-sizing-content w-full",
          size === "default" && "min-h-17.5 max-sm:min-h-20.5",
          size === "sm" && "min-h-16.5 max-sm:min-h-19.5",
          size === "lg" && "min-h-18.5 max-sm:min-h-21.5",
          unstyled && "border-0! bg-transparent! shadow-none!",
        )}
        data-slot="textarea"
        size={fluentSize}
        {...props}
      />
    </span>
  );
}
