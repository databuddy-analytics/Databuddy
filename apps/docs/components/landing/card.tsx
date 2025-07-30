"use client";

import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";
import useSound from "use-sound";
import { GridPatternBg } from "./grid-pattern";

interface GridCard {
  title: string;
  description: string;
  icon: LucideIcon;
}

interface SciFiGridCardProps extends GridCard {
  className?: string;
  onClick?: () => void;
}

export const SciFiGridCard = ({
  title,
  description,
  icon: Icon,
  className,
  onClick,
}: SciFiGridCardProps) => {
  const [play] = useSound("/scifi-card-hover.mp3", {
    volume: 0.01,
  });

  return (
    <div
      className={cn(
        "relative group overflow-hidden",
        "min-h-[370px] max-w-[350px]",
        className,
      )}
      onClick={onClick}
      onMouseEnter={() => {
        play();
      }}
    >
      <div className="absolute inset-0">
        <GridPatternBg />
      </div>

      <div className="relative h-full bg-transparent px-8 border border-border transition-all duration-300">
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

        <div className="relative h-full flex flex-col items-center justify-center">
          <div className="mb-4 bg-gradient-to-br from-zinc-950 to-zinc-800 border border-border p-2 shadow-[inset_0_1px_3px_rgba(255,255,255,0.2)]">
            <Icon
              className="w-6 h-6 text-white/80 group-hover:text-white transition-colors duration-300"
              strokeWidth={1.5}
            />
          </div>

          <h3 className="text-lg font-medium text-white pb-12 group-hover:text-white/90 transition-colors duration-300">
            {title}
          </h3>

          <p className="text-xs text-center text-muted-foreground/40 group-hover:text-muted-foreground/80 transition-colors duration-300">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
};
