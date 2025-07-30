"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";
import useSound from "use-sound";

interface SciFiButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

const SciFiButton = React.forwardRef<HTMLButtonElement, SciFiButtonProps>(
  ({ className, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    const [play] = useSound("/scifi-hover.mp3", {
      volume: 0.2,
    });

    return (
      <div className="relative inline-block group">
        <Comp
          className={cn(
            "relative inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/50 disabled:pointer-events-none disabled:opacity-50 overflow-hidden",
            "h-9 px-4 py-2",
            "backdrop-blur-[50px] bg-white/[0.01] text-white",
            "shadow-[0px_-82px_68px_-109px_inset_rgba(255,255,255,0.3),0px_98px_100px_-170px_inset_rgba(255,255,255,0.6),0px_4px_18px_-8px_inset_rgba(255,255,255,0.6),0px_1px_40px_-14px_inset_rgba(255,255,255,0.3)]",
            "border border-stone-800 hover:animate-[borderGlitch_0.6s_ease-in-out]",
            "font-normal tracking-[-0.18px] text-center",
            "active:scale-[0.98]",
            className,
          )}
          ref={ref}
          onMouseEnter={(e) => {
            play();
            props.onMouseEnter?.(e);
          }}
          {...props}
        >
          {children}
        </Comp>

        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-0 top-0 w-2 h-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
            <div className="absolute h-0.5 top-0 left-0.5 w-1.5 bg-white origin-left"></div>
            <div className="absolute w-0.5 top-0 left-0 h-2 bg-white origin-top"></div>
          </div>

          <div className="absolute right-0 top-0 w-2 h-2 -scale-x-[1] group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
            <div className="absolute h-0.5 top-0 left-0.5 w-1.5 bg-white origin-left"></div>
            <div className="absolute w-0.5 top-0 left-0 h-2 bg-white origin-top"></div>
          </div>

          <div className="absolute left-0 bottom-0 w-2 h-2 -scale-y-[1] group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
            <div className="absolute h-0.5 top-0 left-0.5 w-1.5 bg-white origin-left"></div>
            <div className="absolute w-0.5 top-0 left-0 h-2 bg-white origin-top"></div>
          </div>

          <div className="absolute right-0 bottom-0 w-2 h-2 -scale-[1] group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
            <div className="absolute h-0.5 top-0 left-0.5 w-1.5 bg-white origin-left"></div>
            <div className="absolute w-0.5 top-0 left-0 h-2 bg-white origin-top"></div>
          </div>
        </div>
      </div>
    );
  },
);

SciFiButton.displayName = "SciFiButton";

export { SciFiButton };
