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
		title: "See the whole story in one place",
		description:
			"A new error, a slow page, and a drop in signups show up side by side, so you can see how they connect.",
		icon: StackIcon,
	},
	{
		id: 2,
		title: "Respect your visitors' privacy",
		description:
			"No analytics cookies, and you decide whether events link to your own user profiles.",
		icon: ShieldCheckIcon,
	},
	{
		id: 3,
		title: "Keep your pages fast",
		description:
			"The tracker is about 13 KB gzipped and loads asynchronously, so it stays out of your visitors' way.",
		icon: LightningIcon,
	},
	{
		id: 4,
		title: "Never get locked in",
		description:
			"Databuddy is open source. Read the code, or run it on your own servers.",
		icon: CodeIcon,
	},
	{
		id: 5,
		title: "Watch launches as they happen",
		description:
			"Follow visitors and events live while a launch or campaign goes out.",
		icon: WaveformIcon,
	},
	{
		id: 6,
		title: "Get answers in plain words",
		description:
			"Ask Databunny about traffic, conversions, errors, or performance, and see the evidence behind each answer.",
		icon: RobotIcon,
	},
];

export const GridCards = () => (
	<div className="w-full">
		<div className="mb-12 text-start lg:mb-16 lg:text-left">
			<h2 className="mx-auto flex max-w-4xl items-start gap-2 text-balance font-semibold text-2xl leading-tight sm:text-4xl lg:mx-0 lg:text-5xl">
				<span className="mt-1.5 hidden sm:block">
					<SectionBullet color="#B24A7E" />
				</span>
				<span className="text-foreground">Swap a stack of tools for one.</span>
			</h2>
			<p className="mt-3 max-w-2xl text-pretty text-muted-foreground text-sm sm:px-0 sm:text-base lg:text-lg">
				One tracker collects analytics, errors, and web vitals, and the same
				dashboard runs your funnels, flags, links, and uptime.
			</p>
		</div>

		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
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
