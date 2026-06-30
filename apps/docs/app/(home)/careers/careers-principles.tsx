"use client";

type IconWeight = "regular" | "bold" | "fill" | "duotone";

import {
	ChatTextIcon as ChatCircleTextIcon,
	ClockCounterClockwiseIcon,
	GitBranchIcon,
	GlobeIcon,
	ShieldCheckIcon,
	StackIcon,
} from "@databuddy/ui/icons";
import { SciFiCard } from "@/components/scifi-card";

interface Principle {
	description: string;
	icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
	title: string;
}

const principles: Principle[] = [
	{
		icon: GlobeIcon,
		title: "Remote, async by default",
		description:
			"The team is spread across timezones. Deep work beats standups. Write things down so the next person (or the next you) doesn't have to ask.",
	},
	{
		icon: GitBranchIcon,
		title: "Ship small, ship often",
		description:
			"Short branches, reviewed PRs against staging, straight to production. Big rewrites are a smell. If a change takes more than a week, it's probably wrong.",
	},
	{
		icon: StackIcon,
		title: "One stack, one repo",
		description:
			"TypeScript everywhere, Bun, Turborepo, Next.js, Elysia, Drizzle, ClickHouse, Redis. You'll touch most of it within the first month.",
	},
	{
		icon: ShieldCheckIcon,
		title: "Privacy isn't negotiable",
		description:
			"We don't collect personal data, we don't use cookies, and we don't bolt on tracking to pad metrics. Everything we build has to pass that bar.",
	},
	{
		icon: ClockCounterClockwiseIcon,
		title: "Sustainable pace",
		description:
			"No crunch, no theatre. We want people who'll still be here in three years, not people who'll burn out in three months.",
	},
	{
		icon: ChatCircleTextIcon,
		title: "Feedback is a gift",
		description:
			"Direct, specific, kind. We review code hard because we trust each other. If something's broken, say it. If something's great, say that too.",
	},
];

export default function CareersPrinciples() {
	return (
		<div>
			<div className="mb-12 text-center">
				<h2 className="mb-4 text-balance font-semibold text-2xl sm:text-3xl lg:text-4xl">
					How we work
				</h2>
				<p className="mx-auto max-w-2xl text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
					No perks page, no ping-pong table. Just the principles that actually
					shape the day-to-day.
				</p>
			</div>

			<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
				{principles.map((principle) => (
					<SciFiCard key={principle.title} variant="foreground">
						<div className="relative h-full rounded border border-border bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
							<principle.icon
								className="mb-4 size-7 text-muted-foreground duration-300 group-hover:text-foreground"
								weight="duotone"
							/>
							<h3 className="mb-2 font-semibold text-foreground text-lg">
								{principle.title}
							</h3>
							<p className="text-pretty text-muted-foreground text-sm leading-relaxed">
								{principle.description}
							</p>
						</div>
					</SciFiCard>
				))}
			</div>
		</div>
	);
}
