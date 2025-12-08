"use client";

import {
	ActivityIcon,
	BellIcon,
	CheckCircleIcon,
	LightningIcon,
} from "@phosphor-icons/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const benefits = [
	{
		title: "Integrated Reliability",
		description:
			"Uptime monitoring is no longer a silo. See your uptime status, RUM data, and Core Web Vitals all in one dashboard.",
		differentiator:
			"Unified View: The only platform that bundles privacy-first analytics with proactive monitoring.",
		icon: ActivityIcon,
	},
	{
		title: "Developer-First Speed",
		description:
			"Get alerted the moment an issue is detected with 30-second check intervals and multi-protocol support (HTTP/S, Ping, Port).",
		differentiator:
			"High-Performance: Built on Go/Rust and ClickHouse for low-latency checks and high-volume data processing.",
		icon: LightningIcon,
	},
	{
		title: "No More False Alarms",
		description:
			"Our multi-location check and N-out-of-M rule filters out transient network noise, so you only get paged when it's a real problem.",
		differentiator:
			"Intelligent Alerting: Reduces alert fatigue with a built-in false positive reduction strategy.",
		icon: BellIcon,
	},
	{
		title: "Seamless Automation",
		description:
			"Use our powerful Webhooks to instantly trigger automated workflows in Slack, PagerDuty, or your custom incident management system.",
		differentiator:
			"API-First: Webhooks and a full REST API for complete control and integration into your CI/CD pipeline.",
		icon: CheckCircleIcon,
	},
];

export const Pulse = () => {
	return (
		<div className="w-full">
			{/* Header Section */}
			<div className="mb-12 text-center lg:mb-16">
				<h2 className="mx-auto max-w-4xl font-semibold text-3xl leading-tight sm:text-4xl lg:text-5xl">
					<span className="text-muted-foreground">
						Introducing Databuddy Pulse:{" "}
					</span>
					<span className="bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
						Proactive Reliability for Devs
					</span>
				</h2>
				<p className="mx-auto mt-4 max-w-3xl text-base text-muted-foreground sm:text-lg lg:text-xl">
					<strong>Don't just analyze downtime. Prevent it.</strong>
				</p>
				<p className="mx-auto mt-3 max-w-3xl text-muted-foreground text-sm sm:text-base lg:text-lg">
					Databuddy Pulse is the integrated uptime monitoring solution built for
					the modern developer. We turn your reactive analytics into a proactive
					reliability strategy, ensuring your users never see a 500 error.
				</p>
				<p className="mx-auto mt-2 max-w-3xl text-muted-foreground text-sm sm:text-base lg:text-lg">
					Pulse is the logical next step in your reliability journey, leveraging
					the same lightweight, high-performance infrastructure that powers your
					analytics.
				</p>
			</div>

			{/* Benefits Grid */}
			<div className="mb-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:gap-8">
				{benefits.map((benefit) => {
					const Icon = benefit.icon;
					return (
						<div
							className={cn(
								"group relative overflow-hidden rounded border border-border bg-background/50 p-6 transition-all duration-300 hover:border-primary/50 hover:bg-background/80 sm:p-8"
							)}
							key={benefit.title}
						>
							<div className="mb-4 flex items-start gap-4">
								<div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-border bg-background transition-colors group-hover:border-primary/50 group-hover:bg-primary/5">
									<Icon
										className="text-foreground"
										size={24}
										weight="duotone"
									/>
								</div>
								<div className="flex-1">
									<h3 className="mb-2 font-semibold text-lg leading-tight sm:text-xl">
										{benefit.title}
									</h3>
									<p className="text-muted-foreground text-sm leading-relaxed sm:text-base">
										{benefit.description}
									</p>
								</div>
							</div>
							<div className="mt-4 rounded border-primary/30 border-l-2 bg-primary/5 py-2 pl-4">
								<p className="text-muted-foreground text-xs leading-relaxed sm:text-sm">
									<strong className="text-foreground">
										Databuddy Differentiator:
									</strong>{" "}
									{benefit.differentiator}
								</p>
							</div>
						</div>
					);
				})}
			</div>

			{/* CTA Section */}
			<div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
				<Button asChild className="w-full sm:w-auto" size="lg">
					<Link href="/docs/pulse/getting-started">
						Get Started with Pulse Free
					</Link>
				</Button>
				<Button
					asChild
					className="w-full sm:w-auto"
					size="lg"
					variant="outline"
				>
					<Link href="/docs/pulse">View Pulse Pricing</Link>
				</Button>
			</div>

			{/* Pricing Info */}
			<div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:mt-12">
				<div className="rounded border border-border bg-background/50 p-6 text-center">
					<h3 className="mb-2 font-semibold text-lg">Pulse Free</h3>
					<p className="mb-3 text-muted-foreground text-sm">
						5 Monitors, 5-Minute Checks
					</p>
					<p className="font-semibold text-foreground text-xl">Always Free</p>
				</div>
				<div className="rounded border border-primary/50 bg-primary/5 p-6 text-center">
					<h3 className="mb-2 font-semibold text-lg">Pulse Pro</h3>
					<p className="mb-3 text-muted-foreground text-sm">
						50 Monitors, 1-Minute Checks
					</p>
					<p className="font-semibold text-foreground text-xl">$15/mo</p>
				</div>
			</div>
		</div>
	);
};
