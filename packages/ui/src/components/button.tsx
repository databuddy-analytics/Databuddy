"use client";

import { cn } from "../lib/utils";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import {
	createContext,
	useContext,
	type ButtonHTMLAttributes,
	useEffect,
	useRef,
	useState,
} from "react";
import { Spinner } from "./spinner";

const SubmitHintContext = createContext(false);
export const SubmitHintProvider = SubmitHintContext.Provider;

const button = cva(
  [
    "inline-flex items-center justify-center gap-2",
    "cursor-pointer select-none whitespace-nowrap font-semibold",
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
        destructive: "",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-3.5 text-sm",
        lg: "h-10 px-4 text-sm",
      },
    },
    compoundVariants: [
      {
        variant: "primary",
        tone: "destructive",
        class:
          "bg-destructive text-destructive-foreground hover:brightness-[1.15]",
      },
      {
        variant: "secondary",
        tone: "destructive",
        class: "bg-destructive/10 text-destructive hover:bg-destructive/15",
      },
      {
        variant: "ghost",
        tone: "destructive",
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

interface KeyboardShortcut {
  display: string;
  trigger: (e: KeyboardEvent) => boolean;
  callback: (e: KeyboardEvent) => void | Promise<void>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  Omit<VariantProps<typeof button>, "variant" | "size"> & {
    asChild?: boolean;
    keyboard?: KeyboardShortcut;
    loading?: boolean;
    size?: CompatSize;
    variant?: CompatVariant;
  };

function resolveButtonVariant(variant?: CompatVariant) {
  switch (variant) {
    case "default":
      return { variant: "primary" as const };
    case "destructive":
      return { tone: "destructive" as const, variant: "primary" as const };
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
  keyboard,
  children,
  ...rest
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  const ref = useRef<HTMLButtonElement>(null);
  const [lockedWidth, setLockedWidth] = useState<number>();
  const isClickDisabled = disabled || loading;
  const hasSubmitHint = useContext(SubmitHintContext);
  const showSubmitHint = hasSubmitHint && type === "submit" && !keyboard;

  useEffect(() => {
    if (loading && ref.current && !lockedWidth) {
      setLockedWidth(ref.current.offsetWidth);
    } else if (!loading) {
      setLockedWidth(undefined);
    }
  }, [loading, lockedWidth]);

  useEffect(() => {
    if (!keyboard || isClickDisabled) {
      return;
    }
    const handler = (e: KeyboardEvent) => {
      if (keyboard.trigger(e)) {
        e.preventDefault();
        keyboard.callback(e);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [keyboard, isClickDisabled]);

  if (asChild) {
    return (
      <Comp
        className={buttonVariants({ className, size, tone, variant })}
        disabled={disabled}
        type={type}
        {...rest}
      >
        {children}
      </Comp>
    );
  }

  return (
    <Comp
      className={buttonVariants({ className, size, tone, variant })}
      disabled={disabled}
      aria-disabled={isClickDisabled}
      aria-busy={loading}
      ref={ref}
      style={lockedWidth ? { width: lockedWidth } : undefined}
      type={type}
      onClick={loading ? undefined : rest.onClick}
      {...rest}
    >
      {loading ? (
        <Spinner size="sm" />
      ) : (
        <>
          {children}
          {keyboard && (
            <kbd className="ml-1 rounded border bg-black/5 px-1.5 py-0.5 font-mono text-[10px] dark:bg-white/10">
              {keyboard.display}
            </kbd>
          )}
          {showSubmitHint && (
            <kbd className="ml-1 hidden rounded bg-primary-foreground/20 px-1 py-px font-mono text-[10px] sm:inline">⌘↵</kbd>
          )}
        </>
      )}
    </Comp>
  );
}
