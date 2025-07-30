"use client";

import { ArrowRight, Maximize2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "../ui/button";
import { Map } from "./map";
import { Spotlight } from "./spotlight";
import { SciFiButton } from "./scifi-btn";
import DemoContainer from "./demo";

export default function Hero() {
  const [isHovered, setIsHovered] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleFullscreen = () => {
    if (iframeRef.current?.requestFullscreen) {
      iframeRef.current.requestFullscreen();
    }
  };

  return (
    <section className="relative flex flex-col items-center w-full h-full overflow-hidden px-8">
      <Spotlight transform="translateX(-60%) translateY(-50%)" />
      <div className="overflow-hidden bg-transparent">
        <div className="max-w-full grid grid-cols-1 lg:grid-cols-2 items-center pt-16 gap-x-8 xl:gap-x-14 gap-y-16 px-4 lg:px-8 mx-auto lg:max-w-7xl">
          <div className="flex flex-col gap-8 relative">
            <h1 className="tracking-tight leading-none text-[72px] font-semibold">
              Privacy <span className="text-[#B5B5B5]">first</span>
              <br />
              Analytics for <span className="text-[#B5B5B5]">devs</span>
            </h1>
            <p className="text-muted-foreground font-medium max-w-lg tracking-tight text-[14px]">
              Track users, not identities. Get fast, accurate insights with zero
              cookies and 100% GDPR compliance.
            </p>
            <div>
              <SciFiButton>GET STARTED</SciFiButton>
            </div>
          </div>
          <div>
            <Map />
          </div>
        </div>
      </div>

      <DemoContainer />
    </section>
  );
}
