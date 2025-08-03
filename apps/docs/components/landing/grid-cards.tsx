"use client";

import { Eye, Leaf, Rocket, Shield, TrendingUp, Users } from "lucide-react";
import { SciFiGridCard } from "./card";

const cards = [
  {
    id: 1,
    title: "Privacy First Approach",
    description:
      "Build trust & reduce legal risk with built-in GDPR/CCPA compliance.",
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
    <div className="w-full">
      {/* Header Section */}
      <div className="text-center lg:text-left mb-12 lg:mb-16">
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-semibold leading-tight max-w-4xl mx-auto lg:mx-0">
          <span className="text-muted-foreground">Everything you need to </span>
          <span className="text-foreground">understand your users</span>
        </h2>
      </div>

      {/* Grid Section */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8 lg:gap-10 xl:gap-12">
        {cards.map((card) => (
          <div key={card.id} className="flex">
            <SciFiGridCard
              title={card.title}
              description={card.description}
              icon={card.icon}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
