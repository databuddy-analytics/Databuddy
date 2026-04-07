"use client";

import {
	BrainIcon,
	CodeIcon,
	LightningIcon,
	ShieldCheckIcon,
	StackIcon,
	WaveformIcon,
} from "@phosphor-icons/react";
import { SciFiGridCard } from "./card";

const cards = [
	{
		id: 1,
		title: "One script, everything",
		description:
			"Analytics, errors, vitals, funnels, and feature flags. One install, one dashboard, one bill.",
		icon: StackIcon,
	},
	{
		id: 2,
		title: "No cookies, no banners",
		description:
			"Zero consent popups. Stop losing 30-40% of visitors to cookie banners that kill conversions.",
		icon: ShieldCheckIcon,
	},
	{
		id: 3,
		title: "Under 30 KB",
		description:
			"Your analytics script shouldn't slow your site. Ours is lighter than a single hero image.",
		icon: LightningIcon,
	},
	{
		id: 4,
		title: "Open source",
		description:
			"Full transparency. Self-host or let us run it. Your data, your rules.",
		icon: CodeIcon,
	},
	{
		id: 5,
		title: "Real-time",
		description: "See what's happening right now. No waiting, no sampling.",
		icon: WaveformIcon,
	},
	{
		id: 6,
		title: "GDPR compliant by default",
		description:
			"No personal data collected. GDPR, CCPA, and ePrivacy compliant out of the box.",
		icon: BrainIcon,
	},
];

export const GridCards = () => {
	return (
		<div className="w-full">
			<div className="mb-12 text-center lg:mb-16 lg:text-left">
				<h2 className="mx-auto max-w-4xl text-balance font-semibold text-3xl leading-tight sm:text-4xl lg:mx-0 lg:text-5xl">
					<span className="text-muted-foreground">Set up once, </span>
					<span className="bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
						understand everything
					</span>
				</h2>
				<p className="mt-3 max-w-2xl text-pretty text-muted-foreground text-sm sm:px-0 sm:text-base lg:text-lg">
					Simple analytics you don't have to fight with. Add one script and get
					the full picture in minutes, not weeks.
				</p>
			</div>

			{/* Grid Section */}
			<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3 lg:gap-10 xl:gap-12">
				{cards.map((card) => (
					<div className="flex" key={card.id}>
						<SciFiGridCard
							description={card.description}
							icon={card.icon}
							title={card.title}
						/>
					</div>
				))}
			</div>
		</div>
	);
};
