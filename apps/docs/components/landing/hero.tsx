"use client";

import { Map } from "./map";
import { Spotlight } from "./spotlight";
import { SciFiButton } from "./scifi-btn";
import DemoContainer from "./demo";

export default function Hero() {
  const handleGetStarted = () => {
    const newWindow = window.open(
      "https://app.databuddy.cc/login",
      "_blank",
      "noopener,noreferrer",
    );
    if (
      !newWindow ||
      newWindow.closed ||
      typeof newWindow.closed == "undefined"
    ) {
      // Handle popup blocked case if needed
    }
  };

  return (
    <section className="relative flex flex-col items-center w-full min-h-screen overflow-hidden">
      <Spotlight transform="translateX(-60%) translateY(-50%)" />

      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 items-center gap-8 lg:gap-12 xl:gap-16 pt-16 pb-8 lg:pt-20 lg:pb-12">
          {/* Text Content */}
          <div className="flex flex-col gap-6 lg:gap-8 order-2 lg:order-1">
            <h1 className="tracking-tight leading-none font-semibold text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-[72px]">
              Privacy <span className="text-muted-foreground">first</span>
              <br />
              Analytics for <span className="text-muted-foreground">devs</span>
            </h1>

            <p className="text-muted-foreground font-medium max-w-lg tracking-tight text-sm sm:text-base lg:text-lg leading-relaxed">
              Track users, not identities. Get fast, accurate insights with zero
              cookies and 100% GDPR compliance.
            </p>

            <div className="pt-2">
              <SciFiButton onClick={handleGetStarted}>GET STARTED</SciFiButton>
            </div>
          </div>

          {/* Map Visualization */}
          <div className="order-1 lg:order-2 w-full flex justify-center lg:justify-end">
            <div className="w-full max-w-lg lg:max-w-none">
              <Map />
            </div>
          </div>
        </div>
      </div>

      {/* Demo Container */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8 lg:pb-12">
        <DemoContainer />
      </div>
    </section>
  );
}
