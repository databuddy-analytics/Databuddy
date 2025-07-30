"use client";

import { useState, useRef } from "react";
import { Maximize2 } from "lucide-react";

export default function DemoContainer() {
  const [isHovered, setIsHovered] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleFullscreen = () => {
    if (iframeRef.current) {
      if (iframeRef.current.requestFullscreen) {
        iframeRef.current.requestFullscreen();
      }
    }
  };

  const dotPattern =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 1'%3E%3Crect width='1' height='1' fill='%23666666'/%3E%3C/svg%3E";

  return (
    <div className="mx-auto w-full max-w-7xl px-8 mt-24 mb-24">
      <div
        className="group relative cursor-pointer bg-background/80 p-2 shadow-2xl backdrop-blur-sm"
        onClick={handleFullscreen}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            handleFullscreen();
          }
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        role="button"
        tabIndex={0}
      >
        <div
          className="absolute opacity-30 inset-x-0 h-px -top-px"
          style={{
            backgroundImage: `url("${dotPattern}")`,
            WebkitMaskImage:
              "linear-gradient(to right, transparent, white 4rem, white calc(100% - 4rem), transparent)",
            maskImage:
              "linear-gradient(to right, transparent, white 4rem, white calc(100% - 4rem), transparent)",
            marginLeft: "-4rem",
            marginRight: "-4rem",
          }}
        />

        <div
          className="absolute opacity-30 inset-y-0 w-px -left-px"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 4'%3E%3Crect width='1' height='1' fill='%23666666'/%3E%3C/svg%3E")`,
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent, white 4rem, white calc(100% - 4rem), transparent)",
            maskImage:
              "linear-gradient(to bottom, transparent, white 4rem, white calc(100% - 4rem), transparent)",
            marginTop: "-4rem",
            marginBottom: "-4rem",
          }}
        />
        <div
          className="absolute opacity-30 inset-y-0 w-px -right-px"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1 4'%3E%3Crect width='1' height='1' fill='%23666666'/%3E%3C/svg%3E")`,
            WebkitMaskImage:
              "linear-gradient(to bottom, transparent, white 4rem, white calc(100% - 4rem), transparent)",
            maskImage:
              "linear-gradient(to bottom, transparent, white 4rem, white calc(100% - 4rem), transparent)",
            marginTop: "-4rem",
            marginBottom: "-4rem",
          }}
        />

        <div
          className="absolute opacity-30 inset-x-0 h-px"
          style={{
            bottom: "-1px",
            backgroundImage: `url("${dotPattern}")`,
            WebkitMaskImage:
              "linear-gradient(to right, transparent, white 4rem, white calc(100% - 4rem), transparent)",
            maskImage:
              "linear-gradient(to right, transparent, white 4rem, white calc(100% - 4rem), transparent)",
            marginLeft: "-4rem",
            marginRight: "-4rem",
          }}
        />

        <iframe
          allowFullScreen
          className="h-[500px] w-full grayscale bg-gradient-to-b from-transparent to-[#0a0a0a] border-0 sm:h-[600px] lg:h-[700px] rounded-sm"
          loading="lazy"
          ref={iframeRef}
          src="https://app.databuddy.cc/demo/OXmNQsViBT-FOS_wZCTHc"
          title="Databuddy Demo Dashboard"
        />

        {/* Fullscreen Button & Overlay */}
        <div
          className={`absolute inset-2 flex items-center justify-center rounded bg-background/20 transition-opacity duration-300 dark:bg-background/40 ${isHovered ? "opacity-100" : "opacity-0"}`}
        >
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card/90 px-4 py-2 font-medium text-sm shadow-lg backdrop-blur-sm transition-colors hover:bg-card">
            <Maximize2 className="h-4 w-4 text-foreground" />
            <span className="text-foreground">Click to view fullscreen</span>
          </div>
        </div>
      </div>
    </div>
  );
}
