import {
	ArrowRightIcon,
	BellIcon,
	ChartLineUpIcon,
	ClockIcon,
	GlobeIcon,
	ShieldCheckIcon,
	SquaresFourIcon,
} from "@phosphor-icons/react/ssr";
import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { SciFiGridCard } from "@/components/landing/card";
import { FaqSection } from "@/components/landing/faq-section";
import { SciFiButton } from "@/components/landing/scifi-btn";
import Section from "@/components/landing/section";
import { Spotlight } from "@/components/landing/spotlight";
import { StructuredData } from "@/components/structured-data";

export const metadata: Metadata = {
	title: "Uptime Monitoring & Status Pages | Databuddy",
	description:
		"Monitor your services with 1-minute checks, beautiful public status pages, latency tracking, and instant alerts. Built into your analytics stack.",
	alternates: {
		canonical: "https://www.databuddy.cc/uptime",
	},
	openGraph: {
		title: "Uptime Monitoring & Status Pages | Databuddy",
		description:
			"Monitor your services with 1-minute checks, beautiful public status pages, latency tracking, and instant alerts. Built into your analytics stack.",
		url: "https://www.databuddy.cc/uptime",
		images: ["/og-image.png"],
	},
};

const FEATURES = [
	{
		icon: ClockIcon,
		title: "1-Minute Checks",
		description:
			"HTTP monitoring as frequent as every 60 seconds. Know about downtime before your users do.",
	},
	{
		icon: GlobeIcon,
		title: "Public Status Pages",
		description:
			"Branded, SEO-indexed status pages at /status/your-org. Share uptime transparently with customers.",
	},
	{
		icon: ChartLineUpIcon,
		title: "Latency Tracking",
		description:
			"Average and p95 response times plotted daily. Spot slow endpoints before they become outages.",
	},
	{
		icon: BellIcon,
		title: "Instant Alerts",
		description:
			"Get notified on status transitions via email, Slack, or webhooks. No alert fatigue — only real changes.",
	},
	{
		icon: ShieldCheckIcon,
		title: "TLS Monitoring",
		description:
			"Automatic SSL/TLS checks on every probe. See certificate validity and expiry at a glance.",
	},
	{
		icon: SquaresFourIcon,
		title: "90-Day Heatmap",
		description:
			"Per-day uptime heatmap with color-coded bars. Instantly see patterns and incident history.",
	},
] as const;

const FAQ_ITEMS = [
	{
		question: "How quickly will I know if my site goes down?",
		answer:
			"Within a minute. Checks run as frequently as every 60 seconds, and you get notified the moment something goes wrong — before your customers notice.",
	},
	{
		question: "Can my customers see the status page?",
		answer:
			"Yes. You get a public, branded status page that shows real-time uptime data. Share it with customers so they can check service health themselves instead of filing support tickets.",
	},
	{
		question: "Will I get spammed with alerts?",
		answer:
			"No. Alerts only fire when status actually changes — from up to down, or down to up. You won't get repeated notifications during intermittent issues, just one clear signal when something needs attention.",
	},
	{
		question: "What kind of services can I monitor?",
		answer:
			"Any public website, API, or web service. You can also parse JSON health endpoints to monitor specific fields — useful for services that report their own status.",
	},
	{
		question: "Is uptime monitoring included in all plans?",
		answer:
			"Uptime monitoring is available on every paid plan. The number of monitors and how frequently they run depends on your tier — check the pricing page for the full breakdown.",
	},
] as const;

function seededColor(index: number, seed: number): string {
	const hash = Math.abs(((index + 1) * 31 + seed * 17) % 1000);
	if (hash < 10) {
		return "bg-amber-400";
	}
	return "bg-emerald-500";
}

const DEMO_MONITORS = [
	{
		name: "API",
		domain: "api.acme.com",
		uptime: "99.98",
		seed: 42,
		incidents: [
			{ start: 31, end: 32, color: "bg-red-500" },
			{ start: 33, end: 33, color: "bg-amber-400" },
		],
	},
	{
		name: "Dashboard",
		domain: "app.acme.com",
		uptime: "99.95",
		seed: 77,
		incidents: [{ start: 58, end: 59, color: "bg-red-500" }],
	},
	{
		name: "Marketing Site",
		domain: "acme.com",
		uptime: "100.00",
		seed: 13,
		incidents: [],
	},
] as const;

function DemoHeatmapStrip({
	seed,
	incidents,
}: {
	seed: number;
	incidents: ReadonlyArray<{
		start: number;
		end: number;
		color: string;
	}>;
}) {
	return (
		<div className="flex gap-px">
			{Array.from({ length: 90 }, (_, i) => {
				const incident = incidents.find(
					(inc) => i >= inc.start && i <= inc.end
				);
				const color = incident ? incident.color : seededColor(i, seed);
				return <div className={`h-7 flex-1 rounded-sm ${color}`} key={i} />;
			})}
		</div>
	);
}

function StatusPageDemo() {
	return (
		<div className="overflow-hidden rounded border border-border/50 bg-card/30 shadow-2xl backdrop-blur-sm">
			<div className="border-border border-b px-5 py-4">
				<div className="flex items-center justify-between">
					<div className="space-y-1">
						<h3 className="font-semibold text-foreground text-sm">Acme Corp</h3>
						<p className="text-muted-foreground text-xs">
							System status and uptime
						</p>
					</div>
					<div className="flex items-center gap-2 rounded bg-emerald-500/10 px-3 py-1.5">
						<span className="relative flex size-2">
							<span className="absolute inline-flex size-full animate-ping rounded bg-emerald-400 opacity-75" />
							<span className="relative inline-flex size-2 rounded bg-emerald-500" />
						</span>
						<span className="font-medium text-emerald-500 text-xs">
							All Systems Operational
						</span>
					</div>
				</div>
			</div>

			<div className="space-y-4 p-5">
				{DEMO_MONITORS.map((monitor) => (
					<div key={monitor.name}>
						<div className="mb-2 flex items-center justify-between">
							<div className="flex items-center gap-2">
								<span className="size-1.5 rounded bg-emerald-500" />
								<span className="font-medium text-foreground text-xs">
									{monitor.name}
								</span>
								<span className="text-muted-foreground text-xs">
									{monitor.domain}
								</span>
							</div>
							<span className="font-medium text-foreground text-xs tabular-nums">
								{monitor.uptime}%
							</span>
						</div>
						<DemoHeatmapStrip
							incidents={monitor.incidents}
							seed={monitor.seed}
						/>
					</div>
				))}
			</div>

			<div className="flex items-center justify-between border-border border-t px-5 py-3 text-muted-foreground text-xs">
				<span>90 days ago</span>
				<span>Today</span>
			</div>
		</div>
	);
}

export default function UptimePage() {
	return (
		<>
			<StructuredData
				elements={[{ type: "faq", items: [...FAQ_ITEMS] }]}
				page={{
					title: "Uptime Monitoring & Status Pages | Databuddy",
					description:
						"Monitor your services with 1-minute checks, beautiful public status pages, latency tracking, and instant alerts.",
					url: "https://www.databuddy.cc/uptime",
				}}
			/>
			<div className="overflow-hidden">
				{/* Hero */}
				<Section className="overflow-hidden" customPaddings id="hero">
					<section className="relative flex w-full flex-col items-center overflow-hidden">
						<Spotlight transform="translateX(-60%) translateY(-50%)" />

						<div className="mx-auto w-full max-w-7xl px-4 pt-16 pb-8 sm:px-6 sm:pt-20 lg:px-8 lg:pt-24">
							<div className="mx-auto flex max-w-4xl flex-col items-center space-y-8 text-center">
								<span className="inline-flex items-center gap-2 rounded border border-amber-500/20 bg-amber-500/10 px-3 py-1 font-medium text-amber-400 text-xs uppercase tracking-wider">
									<span className="size-1.5 rounded-full bg-amber-400" />
									Coming soon
								</span>

								<h1 className="text-balance font-bold text-4xl leading-[1.1] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
									Uptime monitoring.{" "}
									<span className="text-muted-foreground">
										Status pages your users trust.
									</span>
								</h1>

								<p className="max-w-2xl text-pretty font-medium text-muted-foreground text-sm leading-relaxed sm:text-base lg:text-lg">
									HTTP checks as fast as every minute, alerts on real status
									changes, and beautiful public status pages — built into
									Databuddy, no extra tool needed.
								</p>

								<div className="flex items-center gap-3">
									<SciFiButton asChild className="px-6 py-5 text-base sm:px-8">
										<a href="https://app.databuddy.cc/login">
											Get early access
										</a>
									</SciFiButton>
									<SciFiButton asChild className="px-6 py-5 text-base sm:px-8">
										<Link href="/pricing">See pricing</Link>
									</SciFiButton>
								</div>

								<p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-muted-foreground text-sm">
									<span>No credit card required</span>
									<span className="text-border">·</span>
									<span>Setup in under 2 minutes</span>
									<span className="text-border">·</span>
									<span>Free plan available</span>
								</p>
							</div>

							{/* Status Page Demo */}
							<div className="mx-auto mt-8 max-w-2xl">
								<StatusPageDemo />
							</div>
						</div>
					</section>
				</Section>

				{/* Feature Grid */}
				<Section className="border-border border-b" id="features">
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
						<div className="mb-12 text-center lg:mb-16 lg:text-left">
							<h2 className="mx-auto max-w-4xl text-balance font-semibold text-3xl leading-tight sm:text-4xl lg:mx-0 lg:text-5xl">
								<span className="text-muted-foreground">Monitor once, </span>
								<span className="bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
									understand everything
								</span>
							</h2>
							<p className="mt-3 max-w-2xl text-pretty text-muted-foreground text-sm sm:px-0 sm:text-base lg:text-lg">
								Everything you need to keep services healthy and users informed
								— from 1-minute checks to public status pages.
							</p>
						</div>

						<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3 lg:gap-10 xl:gap-12">
							{FEATURES.map((feature) => (
								<div className="flex" key={feature.title}>
									<SciFiGridCard
										description={feature.description}
										icon={feature.icon}
										title={feature.title}
									/>
								</div>
							))}
						</div>
					</div>
				</Section>

				{/* Mid-page CTA */}
				<Section className="border-border border-b bg-background/50" id="cta">
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
						<div className="mx-auto flex max-w-2xl flex-col items-center space-y-6 text-center">
							<h2 className="text-balance font-semibold text-3xl leading-tight sm:text-4xl">
								Be the first to try it
							</h2>
							<p className="max-w-lg text-pretty text-muted-foreground text-sm sm:text-base">
								Uptime monitoring is launching soon. Sign up now and you&apos;ll
								be first in line when it goes live.
							</p>
							<SciFiButton asChild className="px-6 py-5 text-base sm:px-8">
								<a href="https://app.databuddy.cc/login">
									Get early access
									<ArrowRightIcon className="ml-2 size-4" weight="bold" />
								</a>
							</SciFiButton>
						</div>
					</div>
				</Section>

				{/* FAQ */}
				<Section className="border-border border-b bg-background/30" id="faq">
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
						<FaqSection items={[...FAQ_ITEMS]} />
					</div>
				</Section>

				{/* Gradient Divider */}
				<div className="w-full">
					<div className="mx-auto h-px max-w-6xl bg-linear-to-r from-transparent via-border/30 to-transparent" />
				</div>

				<Footer />

				<div className="w-full">
					<div className="mx-auto h-px max-w-6xl bg-linear-to-r from-transparent via-border/30 to-transparent" />
				</div>
			</div>
		</>
	);
}
