"use client";

import {
	ArrowRightIcon,
	ChartLineUpIcon,
	CheckCircleIcon,
	CursorClickIcon,
	LightningIcon,
	RocketLaunchIcon,
	UsersIcon,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Badge } from "@/components/ds/badge";
import { Button } from "@/components/ds/button";

const FEATURES = [
	{
		icon: ChartLineUpIcon,
		title: "Analytics Overview",
		description:
			"Pageviews, visitors, bounce rate, and session duration at a glance.",
		tab: "",
	},
	{
		icon: UsersIcon,
		title: "Live Visitors",
		description: "See who's on your site right now with real-time data.",
		tab: "?tab=realtime",
	},
	{
		icon: CursorClickIcon,
		title: "Custom Events",
		description: "Track button clicks, form submissions, and any user action.",
		tab: "/events",
	},
	{
		icon: LightningIcon,
		title: "Web Vitals",
		description: "Monitor Core Web Vitals and page load performance.",
		tab: "/vitals",
	},
];

interface StepExploreProps {
	onComplete: () => void;
	websiteId: string;
}

export function StepExplore({ onComplete, websiteId }: StepExploreProps) {
	return (
		<div className="space-y-6">
			<div className="flex items-center gap-3">
				<div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
					<RocketLaunchIcon className="size-5 text-primary" weight="duotone" />
				</div>
				<div>
					<h2 className="text-balance font-semibold text-lg">You're all set</h2>
					<p className="text-pretty text-muted-foreground text-sm">
						Your workspace is ready. Start with one of the core views below.
					</p>
				</div>
			</div>

			<div className="flex items-center gap-2">
				<Badge size="sm" variant="success">
					<CheckCircleIcon className="size-3" weight="duotone" />
					Setup complete
				</Badge>
				<p className="text-muted-foreground text-xs">
					These links drop you into the places new teams usually check first.
				</p>
			</div>

			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				{FEATURES.map((feature) => (
					<Link
						className="group flex items-start gap-3 rounded border p-3 hover:border-primary/30 hover:bg-accent/50"
						href={`/websites/${websiteId}${feature.tab}`}
						key={feature.title}
					>
						<div className="flex size-8 shrink-0 items-center justify-center rounded bg-accent">
							<feature.icon
								className="size-4 text-muted-foreground"
								weight="duotone"
							/>
						</div>
						<div className="min-w-0 flex-1">
							<p className="font-medium text-sm">{feature.title}</p>
							<p className="text-pretty text-muted-foreground text-xs">
								{feature.description}
							</p>
						</div>
						<ArrowRightIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
					</Link>
				))}
			</div>

			<Button className="w-full sm:w-auto" onClick={onComplete} size="lg">
				Go to Dashboard
			</Button>
		</div>
	);
}
