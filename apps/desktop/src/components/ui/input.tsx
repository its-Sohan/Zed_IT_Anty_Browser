"use client";

import { Input as FluentInput } from "@fluentui/react-components";
import type * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = Omit<
  React.ComponentProps<typeof FluentInput> & React.RefAttributes<HTMLInputElement>,
  "size" | "onChange" | "min" | "max" | "value"
> & {
  size?: "sm" | "default" | "lg" | number;
  unstyled?: boolean;
  nativeInput?: boolean;
  onChange?: React.ChangeEventHandler<HTMLInputElement>;
  min?: string | number;
  max?: string | number;
  value?: string | number | readonly string[] | undefined;
};

export function Input({
  className,
  size = "default",
  unstyled = false,
  nativeInput = false,
  style,
  ...props
}: InputProps): React.ReactElement {
  const fluentSize = size === "sm" ? "small" : size === "lg" ? "large" : "medium";

  if (nativeInput) {
    const inputClassName = cn(
      "w-full min-w-0 rounded-md border border-input bg-popover px-3 text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus-visible:ring-2 focus-visible:ring-ring sm:text-sm",
      size === "sm" && "h-7.5 px-2.5 text-xs sm:h-6.5",
      size === "lg" && "h-9.5 sm:h-8.5",
      size === "default" && "h-8.5 sm:h-7.5",
      className,
    );

    return (
      <span className="contents" data-slot="input-control">
        <input
          className={inputClassName}
          data-slot="input"
          size={typeof size === "number" ? size : undefined}
          style={typeof style === "function" ? undefined : style}
          {...props}
        />
      </span>
    );
  }

  return (
    <span
      className={cn("relative inline-flex w-full", className) || undefined}
      data-size={size}
      data-slot="input-control"
    >
      <FluentInput
        className={cn(
          "w-full min-w-0",
          unstyled && "border-0! bg-transparent! shadow-none!",
        )}
        data-slot="input"
        size={fluentSize}
        style={style}
        {...(props as React.ComponentProps<typeof FluentInput>)}
      />
    </span>
  );
}
