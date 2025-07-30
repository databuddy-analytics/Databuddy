"use client";

const list1 = [
  {
    name: "better-auth",
    style: "font-medium font-geist",
  },
  {
    name: "rivo",
    style: "font-bold font-barlow",
  },
];

const list2 = [
  {
    name: "confinity",
    style: "font-semibold",
  },
  {
    name: "autumn",
    style: "font-bold",
  },
];

const logos = [
  {
    id: 1,
    name: "BETTER-AUTH",
    src: "https://www.better-auth.com",
  },
  {
    id: 2,
    name: "Rivo",
    src: "https://rivo.gg",
  },
  {
    id: 3,
    name: "Confinity",
    src: "https://www.confinity.com",
  },
  {
    id: 4,
    name: "Autumn",
    src: "https://useautumn.com",
  },
];

import { LogoCarousel } from "./logo-carousel";

export const TrustedBy = () => {
  return (
    <div className="relative flex items-center w-full h-full overflow-hidden">
      <div className="flex items-center mx-auto w-full px-6 sm:max-w-[40rem] md:max-w-[48rem] md:px-8 lg:max-w-[64rem] xl:max-w-[80rem]">
        <div className="pr-36">
          <p className="text-[24px] max-w-xs leading-none">
            Trusted by developers around the world
          </p>
        </div>
        <LogoCarousel logos={logos} />
      </div>
    </div>
  );
};
