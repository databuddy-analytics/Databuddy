import { cn } from "../lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";

const wrapper = cva("relative inline-flex items-center justify-center", {
  variants: {
    size: {
      sm: "size-3.5",
      md: "size-5",
      lg: "size-8",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const DOT_COUNT = 8;
const dots = Array.from({ length: DOT_COUNT });

type SpinnerProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof wrapper>;

export function Spinner({ className, size, ...rest }: SpinnerProps) {
  return (
    <div
      aria-label="Loading"
      className={cn(wrapper({ size }), className)}
      role="status"
      {...rest}
    >
      <svg
        className="size-full animate-spin motion-reduce:animate-none"
        fill="none"
        role="presentation"
        style={{ animationDuration: "0.75s" }}
        viewBox="0 0 24 24"
      >
        {dots.map((_, i) => {
          const angle = (i * 360) / DOT_COUNT - 90;
          const rad = (angle * Math.PI) / 180;
          const cx = 12 + 8 * Math.cos(rad);
          const cy = 12 + 8 * Math.sin(rad);
          const opacity = ((DOT_COUNT - i) / DOT_COUNT).toFixed(2);

          return (
            <circle
              cx={cx.toFixed(2)}
              cy={cy.toFixed(2)}
              fill="currentColor"
              key={i}
              opacity={opacity}
              r="1.8"
            />
          );
        })}
      </svg>
    </div>
  );
}
