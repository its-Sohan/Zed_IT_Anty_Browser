"use client";

import React from "react";
import { Button as FluentButton } from "@fluentui/react-components";
import { cva } from "class-variance-authority";
import type { useRender } from "@base-ui/react/use-render";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

/**
 * Fluent 2 button. The public API mirrors the previous component
 * (variant/size/loading/render) so call sites stay untouched; the visuals
 * come from Fluent UI v9 web themes.
 */
const fluentAppearanceByVariant = {
  default: "primary",
  secondary: "secondary",
  outline: "secondary",
  destructive: "primary",
  "destructive-outline": "secondary",
  ghost: "subtle",
  link: "transparent",
} as const;

const fluentSizeBySize = {
  default: "medium",
  sm: "small",
  xs: "small",
  lg: "large",
  xl: "large",
  icon: "medium",
  "icon-sm": "small",
  "icon-xs": "small",
  "icon-lg": "medium",
  "icon-xl": "large",
} as const;

const sizeClasses = {
  default: "",
  sm: "h-7! px-2.5! gap-1.5",
  xs: "h-6! gap-1 px-2! text-xs! rounded-sm!",
  lg: "h-9! px-3.5!",
  xl: "h-10! px-4! text-base! [&_svg]:size-5",
  icon: "size-8! min-w-0! px-0!",
  "icon-sm": "size-7! min-w-0! px-0!",
  "icon-xs": "size-6! min-w-0! px-0! rounded-sm!",
  "icon-lg": "size-9! min-w-0! px-0! [&_svg]:size-4.5",
  "icon-xl": "size-10! min-w-0! px-0! [&_svg]:size-5",
} as const;

const variantClasses = {
  default: "",
  secondary: "",
  outline: "",
  ghost: "",
  link: "text-primary! underline underline-offset-4 hover:underline",
  destructive: "bg-destructive! border-destructive! text-white! hover:bg-destructive/90!",
  "destructive-outline": "text-destructive-foreground!",
} as const;

export const buttonVariants = cva("", {
  defaultVariants: { size: "default", variant: "default" },
  variants: {
    size: sizeClasses,
    variant: variantClasses,
  },
});

export interface ButtonProps extends useRender.ComponentProps<"button"> {
  variant?: keyof typeof fluentAppearanceByVariant;
  size?: keyof typeof sizeClasses;
  loading?: boolean;
}

type RenderElement = React.ReactElement<{ className?: string }>;

function baseClasses(
  variant: ButtonProps["variant"],
  size: ButtonProps["size"],
  className?: string,
) {
  return cn(buttonVariants({ size, variant }), className);
}

export function Button({
  className,
  variant = "default",
  size = "default",
  render,
  children,
  loading = false,
  disabled: disabledProp,
  ...props
}: ButtonProps): React.ReactElement {
  const isDisabled = Boolean(loading || disabledProp);

  if (render) {
    const fallbackProps = {
      ...props,
      children: (
        <>
          {children}
          {loading && (
            <Spinner
              className="pointer-events-none absolute"
              data-slot="button-loading-indicator"
            />
          )}
        </>
      ),
      className: baseClasses(variant, size, className),
      type: "button" as const,
      "aria-disabled": loading || undefined,
      "data-loading": loading ? "" : undefined,
      "data-slot": "button",
      disabled: isDisabled,
    };

    if (typeof render === "function") {
      return (
        render as unknown as (props: typeof fallbackProps) => React.ReactElement
      )(fallbackProps);
    }

    const element = render as RenderElement;
    return React.cloneElement(element, {
      ...fallbackProps,
      className: cn(baseClasses(variant, size, className), element.props.className),
    });
  }

  return (
    <FluentButton
      appearance={fluentAppearanceByVariant[variant]}
      size={fluentSizeBySize[size]}
      className={cn("relative", sizeClasses[size], variantClasses[variant], className)}
      aria-disabled={loading || undefined}
      data-loading={loading ? "" : undefined}
      data-slot="button"
      disabled={isDisabled}
      icon={loading ? <Spinner size="extra-tiny" style={{ color: "inherit" }} /> : undefined}
      {...props}
    >
      {children}
    </FluentButton>
  );
}
