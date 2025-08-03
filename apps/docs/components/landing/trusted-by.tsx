"use client";

const logos = [
  {
    id: 1,
    name: "BETTER-AUTH",
    src: "https://www.better-auth.com",
    style: "font-medium font-geist",
  },
  {
    id: 2,
    name: "Rivo",
    src: "https://rivo.gg",
    style: "font-bold font-barlow",
  },
  {
    id: 3,
    name: "Confinity",
    src: "https://www.confinity.com",
    style: "font-semibold",
  },
  {
    id: 4,
    name: "Autumn",
    src: "https://useautumn.com",
    style: "font-bold",
  },
];

import { LogoCarousel } from "./logo-carousel";

export const TrustedBy = () => {
  return (
    <div className="relative flex flex-col lg:flex-row items-center w-full h-full overflow-hidden">
      {/* Mobile Layout */}
      <div className="block lg:hidden w-full text-center space-y-8">
        <h2 className="text-xl sm:text-2xl font-medium leading-tight text-foreground max-w-xs mx-auto">
          Trusted by developers around the world
        </h2>
        <div className="w-full">
          <LogoCarousel logos={logos} />
        </div>
      </div>

      {/* Desktop Layout */}
      <div className="hidden lg:flex items-center w-full">
        <div className="flex-shrink-0 pr-16 md:pr-20 xl:pr-24">
          <h2 className="text-xl xl:text-2xl font-medium leading-tight text-foreground max-w-xs">
            Trusted by developers around the world
          </h2>
        </div>
        <div className="border-l">
          <LogoCarousel logos={logos} />
        </div>
      </div>
    </div>
  );
};
