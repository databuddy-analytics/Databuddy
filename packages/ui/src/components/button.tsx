import { cn } from "../lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { Spinner } from "./spinner";

const button = cva(
  [
    "inline-flex items-center justify-center gap-1.5",
    "select-none whitespace-nowrap font-medium",
    "rounded-md",
    "transition-[background-color,color,opacity,transform,filter,box-shadow] duration-(--duration-quick) ease-(--ease-smooth)",
    "motion-reduce:transition-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
    "active:scale-[0.98]",
    "motion-reduce:active:scale-100",
    "disabled:pointer-events-none disabled:opacity-50",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-xs hover:brightness-[1.15] active:brightness-[0.9] dark:active:brightness-[0.75] dark:hover:brightness-[0.85]",
        secondary:
          "bg-secondary text-foreground hover:bg-interactive-hover active:bg-interactive-active",
        ghost:
          "bg-transparent text-muted-foreground hover:bg-interactive-hover hover:text-foreground active:bg-interactive-active active:text-foreground",
      },
      tone: {
        neutral: "",
        danger: "",
      },
      size: {
        sm: "h-7 px-2.5 text-xs",
        md: "h-8 px-3 text-xs",
        lg: "h-9 px-4 text-sm",
      },
    },
    compoundVariants: [
      {
        variant: "primary",
        tone: "danger",
        class:
          "bg-destructive text-destructive-foreground hover:brightness-[1.15]",
      },
      {
        variant: "secondary",
        tone: "danger",
        class: "bg-destructive/10 text-destructive hover:bg-destructive/15",
      },
      {
        variant: "ghost",
        tone: "danger",
        class:
          "text-destructive hover:bg-destructive/10 hover:text-destructive",
      },
    ],
    defaultVariants: {
      variant: "primary",
      tone: "neutral",
      size: "md",
    },
  }
);

type CompatVariant =
  | NonNullable<VariantProps<typeof button>["variant"]>
  | "default"
  | "destructive"
  | "outline";
type CompatSize =
  | NonNullable<VariantProps<typeof button>["size"]>
  | "default"
  | "icon"
  | "icon-sm";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  Omit<VariantProps<typeof button>, "variant" | "size"> & {
    asChild?: boolean;
    loading?: boolean;
    size?: CompatSize;
    variant?: CompatVariant;
  };

function resolveButtonVariant(variant?: CompatVariant) {
  switch (variant) {
    case "default":
      return { variant: "primary" as const };
    case "destructive":
      return { tone: "danger" as const, variant: "primary" as const };
    case "outline":
      return { variant: "secondary" as const };
    default:
      return { variant };
  }
}

function resolveButtonSize(size?: CompatSize) {
  switch (size) {
    case "default":
      return { size: "md" as const };
    case "icon":
      return { className: "aspect-square px-0", size: "md" as const };
    case "icon-sm":
      return { className: "aspect-square px-0", size: "sm" as const };
    default:
      return { size };
  }
}

export function buttonVariants({
  className,
  size,
  tone,
  variant,
}: {
  className?: string;
  size?: CompatSize;
  tone?: VariantProps<typeof button>["tone"];
  variant?: CompatVariant;
} = {}) {
  const resolvedVariant = resolveButtonVariant(variant);
  const resolvedSize = resolveButtonSize(size);

  return cn(
    button({
      size: resolvedSize.size,
      tone: resolvedVariant.tone ?? tone,
      variant: resolvedVariant.variant,
    }),
    resolvedSize.className,
    className
  );
}

export function Button({
  asChild = false,
  className,
  variant,
  tone,
  size,
  type = "button",
  loading,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={buttonVariants({ className, size, tone, variant })}
      disabled={disabled || loading}
      type={type}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner size="sm" />
          {children}
        </>
      ) : (
        children
      )}
    </Comp>
  );
}
