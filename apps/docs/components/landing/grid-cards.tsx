"use client";

import {
	CodeIcon,
	LightningIcon,
	RobotIcon,
	ShieldCheckIcon,
	StackIcon,
	WaveformIcon,
} from "@databuddy/ui/icons";
import { SectionBullet } from "../icons/section-bullet";
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
		icon: RobotIcon,
	},
];

export const GridCards = () => {
	return (
		<div className="w-full">
			<div className="mb-12 text-start lg:mb-16 lg:text-left">
				<h2 className="mx-auto flex max-w-4xl items-start gap-2 text-balance font-semibold text-2xl leading-tight sm:text-4xl lg:mx-0 lg:text-5xl">
					<span className="mt-1.5 hidden sm:block">
						<SectionBullet color="#B24A7E" />
					</span>
					<span className="text-foreground">
						One install. Six tools replaced.
					</span>
				</h2>
				<p className="mt-3 max-w-2xl text-pretty text-muted-foreground text-sm sm:px-0 sm:text-base lg:text-lg">
					Analytics, errors, vitals, funnels, and feature flags. Add one script,
					skip the integration marathon.
				</p>
			</div>

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
