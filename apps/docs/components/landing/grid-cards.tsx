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
		title: "One layer",
		description:
			"Usage, errors, vitals, funnels, and flags, all connected in one place.",
		icon: StackIcon,
	},
	{
		id: 2,
		title: "Autonomous",
		description:
			"Insights surface without you asking. Problems get flagged before users complain.",
		icon: BrainIcon,
	},
	{
		id: 3,
		title: "Real-time",
		description: "See what's happening right now. No waiting, no sampling.",
		icon: WaveformIcon,
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
		title: "Lightweight",
		description:
			"Under 30 KB. No cookies, no consent banners, no impact on performance.",
		icon: LightningIcon,
	},
	{
		id: 6,
		title: "Private by default",
		description:
			"GDPR and CCPA compliant out of the box. No consent popups needed.",
		icon: ShieldCheckIcon,
	},
];

export const GridCards = () => {
	return (
		<div className="w-full">
			{/* Header Section */}
			<div className="mb-12 text-center lg:mb-16 lg:text-left">
				<h2 className="mx-auto max-w-4xl font-semibold text-3xl leading-tight sm:text-4xl lg:mx-0 lg:text-5xl">
					<span className="text-muted-foreground">Built to </span>
					<span className="bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
						run without you
					</span>
				</h2>
				<p className="mt-3 max-w-2xl text-pretty text-muted-foreground text-sm sm:px-0 sm:text-base lg:text-lg">
					Stop babysitting dashboards. Databuddy watches your product so you can
					build it.
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
