import { cn } from "../lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

const statusDot = cva("shrink-0 rounded-full", {
  variants: {
    color: {
      success: "bg-success",
      warning: "bg-warning",
      danger: "bg-destructive",
      muted: "bg-muted-foreground",
      info: "bg-blue-500",
    },
    size: {
      xs: "size-1",
      sm: "size-1.5",
      md: "size-2",
      lg: "size-2.5",
    },
  },
  defaultVariants: {
    color: "success",
    size: "sm",
  },
});

type StatusDotProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof statusDot> & {
    pulse?: boolean;
  };

export function StatusDot({
  className,
  color,
  size,
  pulse = false,
  ...rest
}: StatusDotProps) {
  if (pulse) {
    return (
      <span className={cn("relative inline-flex", className)} {...rest}>
        <span
          className={cn(
            statusDot({ color, size }),
            "absolute inline-flex size-full animate-ping opacity-75 motion-reduce:animate-none"
          )}
        />
        <span className={cn(statusDot({ color, size }), "relative inline-flex")} />
      </span>
    );
  }

  return <span className={cn(statusDot({ color, size }), className)} {...rest} />;
}
