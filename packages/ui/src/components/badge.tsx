import { cn } from "../lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

const badge = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full font-medium leading-none",
  {
    variants: {
      variant: {
        default: "bg-secondary text-foreground",
        primary: "bg-primary text-primary-foreground",
        success: "bg-success/15 text-success dark:bg-success/10",
        warning: "bg-warning/15 text-warning dark:bg-warning/10",
        destructive: "bg-destructive/15 text-destructive dark:bg-destructive/10",
        muted: "bg-secondary text-muted-foreground",
      },
      size: {
        sm: "px-1.5 py-0.5 text-[10px]",
        md: "px-2 py-0.5 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>;

export function Badge({ className, variant, size, ...rest }: BadgeProps) {
  return <span className={cn(badge({ variant, size }), className)} {...rest} />;
}

interface PercentageBadgeProps {
  className?: string;
  percentage: number;
}

function percentageVariant(
  pct: number
): "success" | "primary" | "warning" | "muted" {
  if (pct >= 50) {
    return "success";
  }
  if (pct >= 25) {
    return "primary";
  }
  if (pct >= 10) {
    return "warning";
  }
  return "muted";
}

export function PercentageBadge({
  percentage,
  className,
}: PercentageBadgeProps) {
  const safePercentage =
    percentage == null || Number.isNaN(percentage) ? 0 : percentage;

  return (
    <Badge
      className={cn("tabular-nums", className)}
      variant={percentageVariant(safePercentage)}
    >
      {safePercentage.toFixed(1)}%
    </Badge>
  );
}
