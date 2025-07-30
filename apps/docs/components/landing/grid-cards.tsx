"use client";

import { Eye, Leaf, Rocket, Shield, TrendingUp, Users } from "lucide-react";
import { SciFiGridCard } from "./card";

const cards = [
  {
    id: 1,
    title: "Privacy First Approach",
    description:
      "Build trust & reduce legal risk with built-in GDPR/CCPA compliance.",
    icon: Shield,
  },
  {
    id: 2,
    title: "Real-time Analytics",
    description:
      "Make smarter, data-driven decisions instantly with live dashboards.",
    icon: TrendingUp,
  },
  {
    id: 3,
    title: "Data Ownership",
    description: "Full control of your valuable business data.",
    icon: Users,
  },
  {
    id: 4,
    title: "Energy Efficient",
    description:
      "Up to 10x more eco-friendly with a significantly lower carbon footprint.",
    icon: Leaf,
  },
  {
    id: 5,
    title: "Transparency",
    description: "Fully transparent, no hidden fees or data games.",
    icon: Eye,
  },
  {
    id: 6,
    title: "Lightweight",
    description:
      "Lightweight, no cookies, no fingerprinting, no consent needed.",
    icon: Rocket,
  },
];

export const GridCards = () => {
  return (
    <div className="flex flex-col gap-16 mt-8 items-start mx-auto w-full sm:max-w-[40rem] md:max-w-[48rem] md:px-8 lg:max-w-[64rem] xl:max-w-[80rem]">
      <h1 className="text-[36px]">
        <span className="text-muted-foreground">Everything you need to </span>
        understand your users
      </h1>
      <div className="grid grid-cols-1 gap-x-24 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <SciFiGridCard
            key={card.id}
            title={card.title}
            description={card.description}
            icon={card.icon}
          />
        ))}
      </div>
    </div>
  );
};
