import {
	ArrowRightIcon,
	ChartLineUpIcon,
	ClockIcon,
	DeviceMobileIcon,
	GaugeIcon,
	GlobeIcon,
	LightningIcon,
	WarningCircleIcon,
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
	title: "Core Web Vitals Monitoring | Databuddy",
	description:
		"Monitor LCP, CLS, FID, INP, and TTFB from real users in production. Percentile breakdowns, page-level analysis, and device segmentation — built into your analytics.",
	alternates: {
		canonical: "https://www.databuddy.cc/web-vitals",
	},
	openGraph: {
		title: "Core Web Vitals Monitoring | Databuddy",
		description:
			"Monitor LCP, CLS, FID, INP, and TTFB from real users in production. Percentile breakdowns, page-level analysis, and device segmentation — built into your analytics.",
		url: "https://www.databuddy.cc/web-vitals",
		images: ["/og-image.png"],
	},
};

const FEATURES = [
	{
		icon: GaugeIcon,
		title: "All Core Web Vitals",
		description:
			"LCP, CLS, FID, INP, and TTFB — tracked automatically from real user sessions, not synthetic lab tests.",
	},
	{
		icon: ChartLineUpIcon,
		title: "Percentile Breakdowns",
		description:
			"See p50, p75, and p95 values side by side. Google scores your site at the 75th percentile — so you know exactly what matters.",
	},
	{
		icon: GlobeIcon,
		title: "Page-Level Analysis",
		description:
			"Break down vitals by URL so you can pinpoint which pages are dragging down your score instead of chasing averages.",
	},
	{
		icon: DeviceMobileIcon,
		title: "Device Segmentation",
		description:
			"Mobile and desktop users have very different experiences. See vitals split by device type so you fix the right thing.",
	},
	{
		icon: LightningIcon,
		title: "Real User Monitoring",
		description:
			"Scores come from actual user interactions — not Lighthouse simulations. What you see is what Google sees.",
	},
	{
		icon: WarningCircleIcon,
		title: "Score Alerts",
		description:
			"Get notified when a vital drops below Good thresholds. Catch regressions before they hurt your search rankings.",
	},
] as const;

const FAQ_ITEMS = [
	{
		question: "What is the difference between lab data and field data?",
		answer:
			"Lab data (like Lighthouse) runs in a controlled environment. Field data — what Databuddy collects — comes from real users on real devices and connections. Google uses field data for rankings, so field data is what matters.",
	},
	{
		question: "Which percentile does Google use to score my site?",
		answer:
			"Google scores your site at the 75th percentile, meaning 75% of your users need to have a Good experience. Databuddy shows p75 prominently so you always know where you stand.",
	},
	{
		question: "How does Databuddy measure INP?",
		answer:
			"Interaction to Next Paint is captured using the PerformanceObserver API, the same method used by Chrome. It measures responsiveness for all interactions — clicks, taps, and keyboard input.",
	},
	{
		question: "Can I see which specific pages are failing?",
		answer:
			"Yes. Vitals are tracked per URL, so you can see exactly which routes have poor LCP, high CLS, or slow INP. No more guessing which page is dragging down your overall score.",
	},
	{
		question: "Is web vitals monitoring included in all plans?",
		answer:
			"Web vitals are collected automatically on every plan — there's nothing to turn on. The free plan includes 7 days of history; paid plans extend that to 30 or 90 days.",
	},
] as const;

const DEMO_METRICS = [
	{ label: "LCP", value: "1.2s", score: 98, status: "good" as const },
	{ label: "CLS", value: "0.04", score: 91, status: "good" as const },
	{ label: "INP", value: "48ms", score: 95, status: "good" as const },
	{ label: "FID", value: "12ms", score: 100, status: "good" as const },
	{ label: "TTFB", value: "210ms", score: 82, status: "needs-improvement" as const },
] as const;

const DEMO_PAGES = [
	{ path: "/", lcp: "1.2s", cls: "0.04", inp: "48ms", score: 97 },
	{ path: "/pricing", lcp: "1.8s", cls: "0.01", inp: "64ms", score: 93 },
	{ path: "/blog", lcp: "2.4s", cls: "0.08", inp: "112ms", score: 71 },
	{ path: "/checkout", lcp: "3.1s", cls: "0.12", inp: "180ms", score: 54 },
] as const;

const STATUS_COLOR = {
	good: "stroke-emerald-500",
	"needs-improvement": "stroke-amber-500",
	poor: "stroke-red-500",
} as const;

const SCORE_TEXT_COLOR = {
	good: "text-emerald-400",
	"needs-improvement": "text-amber-400",
	poor: "text-red-400",
} as const;

function ScoreRing({
	score,
	status,
}: {
	score: number;
	status: "good" | "needs-improvement" | "poor";
}) {
	return (
		<div className="relative flex size-12 items-center justify-center">
			<svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
				<title>Score</title>
				<circle
					className="stroke-secondary"
					cx="18"
					cy="18"
					fill="none"
					r="16"
					strokeWidth="2.5"
				/>
				<circle
					className={STATUS_COLOR[status]}
					cx="18"
					cy="18"
					fill="none"
					pathLength="100"
					r="16"
					strokeDasharray="100"
					strokeDashoffset={100 - score}
					strokeLinecap="round"
					strokeWidth="2.5"
				/>
			</svg>
			<span
				className={`absolute font-medium font-mono text-[11px] ${SCORE_TEXT_COLOR[status]}`}
			>
				{score}
			</span>
		</div>
	);
}

function pageScoreColor(score: number) {
	if (score >= 90) return "text-emerald-400";
	if (score >= 50) return "text-amber-400";
	return "text-red-400";
}

function WebVitalsDemo() {
	return (
		<div className="overflow-hidden rounded border border-border/50 bg-card/30 shadow-2xl backdrop-blur-sm">
			<div className="border-border border-b px-5 py-4">
				<div className="flex items-center justify-between">
					<div className="space-y-1">
						<h3 className="font-semibold text-foreground text-sm">
							Core Web Vitals
						</h3>
						<p className="text-muted-foreground text-xs">
							Real user data · p75 · Last 30 days
						</p>
					</div>
					<div className="flex items-center gap-2 rounded bg-emerald-500/10 px-3 py-1.5">
						<span className="size-1.5 rounded-full bg-emerald-500" />
						<span className="font-medium text-emerald-400 text-xs">
							4 / 5 Good
						</span>
					</div>
				</div>
			</div>

			{/* Metric scores */}
			<div className="grid grid-cols-5 divide-x divide-border/50 border-border border-b">
				{DEMO_METRICS.map((m) => (
					<div
						className="flex flex-col items-center gap-2 px-3 py-4"
						key={m.label}
					>
						<ScoreRing score={m.score} status={m.status} />
						<div className="space-y-0.5 text-center">
							<div className="font-bold font-mono text-[9px] text-muted-foreground uppercase tracking-widest">
								{m.label}
							</div>
							<div className="font-medium font-mono text-foreground text-[11px]">
								{m.value}
							</div>
						</div>
					</div>
				))}
			</div>

			{/* Per-page breakdown */}
			<div className="divide-y divide-border/50">
				{DEMO_PAGES.map((page) => (
					<div
						className="flex items-center justify-between px-5 py-2.5"
						key={page.path}
					>
						<span className="font-mono text-muted-foreground text-xs">
							{page.path}
						</span>
						<div className="flex items-center gap-4 text-[10px] text-muted-foreground tabular-nums">
							<span>LCP {page.lcp}</span>
							<span>CLS {page.cls}</span>
							<span>INP {page.inp}</span>
							<span
								className={`font-medium ${pageScoreColor(page.score)}`}
							>
								{page.score}
							</span>
						</div>
					</div>
				))}
			</div>

			<div className="border-border border-t px-5 py-3">
				<div className="flex items-center gap-4 text-[10px] text-muted-foreground">
					<div className="flex items-center gap-1.5">
						<span className="size-1.5 rounded-full bg-emerald-500" />
						<span>Good ≥ 90</span>
					</div>
					<div className="flex items-center gap-1.5">
						<span className="size-1.5 rounded-full bg-amber-500" />
						<span>Needs improvement</span>
					</div>
					<div className="flex items-center gap-1.5">
						<span className="size-1.5 rounded-full bg-red-500" />
						<span>Poor</span>
					</div>
				</div>
			</div>
		</div>
	);
}

export default function WebVitalsPage() {
	return (
		<>
			<StructuredData
				elements={[{ type: "faq", items: [...FAQ_ITEMS] }]}
				page={{
					title: "Core Web Vitals Monitoring | Databuddy",
					description:
						"Monitor LCP, CLS, FID, INP, and TTFB from real users in production. Percentile breakdowns, page-level analysis, and device segmentation.",
					url: "https://www.databuddy.cc/web-vitals",
				}}
			/>
			<div className="overflow-hidden">
				{/* Hero */}
				<Section className="overflow-hidden" customPaddings id="hero">
					<section className="relative flex w-full flex-col items-center overflow-hidden">
						<Spotlight transform="translateX(-60%) translateY(-50%)" />

						<div className="mx-auto w-full max-w-7xl px-4 pt-16 pb-8 sm:px-6 sm:pt-20 lg:px-8 lg:pt-24">
							<div className="mx-auto flex max-w-4xl flex-col items-center space-y-8 text-center">
								<h1 className="text-balance font-bold text-4xl leading-[1.1] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
									Real user performance.{" "}
									<span className="text-muted-foreground">
										Not lab simulations.
									</span>
								</h1>

								<p className="max-w-2xl text-pretty font-medium text-muted-foreground text-sm leading-relaxed sm:text-base lg:text-lg">
									LCP, CLS, INP, FID, and TTFB collected from every real user
									session — with percentile breakdowns and per-page analysis
									built in.
								</p>

								<div className="flex items-center gap-3">
									<SciFiButton asChild className="px-6 py-5 text-base sm:px-8">
										<a href="https://app.databuddy.cc/login">
											Monitor your vitals
										</a>
									</SciFiButton>
									<SciFiButton asChild className="px-6 py-5 text-base sm:px-8">
										<Link href="/docs/performance/core-web-vitals-guide">
											Read the guide
										</Link>
									</SciFiButton>
								</div>

								<p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-muted-foreground text-sm">
									<span>No credit card required</span>
									<span className="text-border">·</span>
									<span>Automatic — no config</span>
									<span className="text-border">·</span>
									<span>Free plan available</span>
								</p>
							</div>

							<div className="mx-auto mt-8 max-w-2xl">
								<WebVitalsDemo />
							</div>
						</div>
					</section>
				</Section>

				{/* Feature Grid */}
				<Section className="border-border border-b" id="features">
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
						<div className="mb-12 text-center lg:mb-16 lg:text-left">
							<h2 className="mx-auto max-w-4xl text-balance font-semibold text-3xl leading-tight sm:text-4xl lg:mx-0 lg:text-5xl">
								<span className="text-muted-foreground">See what users feel, </span>
								<span className="bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
									not what Lighthouse says
								</span>
							</h2>
							<p className="mt-3 max-w-2xl text-pretty text-muted-foreground text-sm sm:px-0 sm:text-base lg:text-lg">
								Real user monitoring gives you the full picture — across pages,
								devices, and percentiles.
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
