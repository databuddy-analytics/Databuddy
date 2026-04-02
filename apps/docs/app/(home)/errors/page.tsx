import {
	ArrowRightIcon,
	BellIcon,
	BugIcon,
	ChartLineUpIcon,
	CodeIcon,
	GitBranchIcon,
	MagnifyingGlassIcon,
	UsersIcon,
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
import { Button } from "@/components/ui/button";
import { ErrorTrackingDemo } from "./demo";

export const metadata: Metadata = {
	title: "Error Tracking | Databuddy",
	description:
		"Catch, group, and fix errors before your users notice. Stack traces, user impact, release tracking, and instant alerts — built into your analytics stack.",
	alternates: {
		canonical: "https://www.databuddy.cc/errors",
	},
	openGraph: {
		title: "Error Tracking | Databuddy",
		description:
			"Catch, group, and fix errors before your users notice. Stack traces, user impact, release tracking, and instant alerts — built into your analytics stack.",
		url: "https://www.databuddy.cc/errors",
		images: ["/og-image.png"],
	},
};

const FEATURES = [
	{
		icon: BugIcon,
		title: "Automatic Error Capture",
		description:
			"Unhandled exceptions, promise rejections, and console errors are captured automatically. One script, zero configuration.",
	},
	{
		icon: CodeIcon,
		title: "Full Stack Traces",
		description:
			"Source-mapped stack traces show the exact file and line number in your original code — not minified gibberish.",
	},
	{
		icon: UsersIcon,
		title: "User Impact",
		description:
			"See how many users hit each error and who they are. Prioritize fixes by real impact, not just occurrence count.",
	},
	{
		icon: GitBranchIcon,
		title: "Release Tracking",
		description:
			"Errors are tagged to the release that introduced them. Spot regressions immediately after a deploy.",
	},
	{
		icon: BellIcon,
		title: "Instant Alerts",
		description:
			"Get notified via email, Slack, or webhooks the moment a new error appears or an existing one spikes.",
	},
	{
		icon: ChartLineUpIcon,
		title: "Error Trends",
		description:
			"See error frequency over time so you can tell if a fix actually worked or if issues are getting worse.",
	},
] as const;

const FAQ_ITEMS = [
	{
		question: "Will error tracking slow down my site?",
		answer:
			"No. The error tracking SDK is tiny and runs asynchronously. It only activates when something goes wrong — there's no polling, no impact on your page load time.",
	},
	{
		question: "How does Databuddy group errors?",
		answer:
			"Errors are grouped by their stack trace fingerprint, so the same bug hitting thousands of users shows up as one issue — not thousands. You can also manually merge or split groups.",
	},
	{
		question: "Can I see which users were affected by an error?",
		answer:
			"Yes. If you identify users in your analytics setup, every error is linked to the affected user sessions. You can see exactly who hit the bug and replay the context.",
	},
	{
		question: "Does it work with server-side errors too?",
		answer:
			"Yes. The Node.js SDK captures unhandled exceptions and rejections on the server side. Both client and server errors appear in the same dashboard.",
	},
	{
		question: "Is error tracking included in all plans?",
		answer:
			"Error tracking is available on every plan. The free plan gives you 1,000 error events per month — paid plans scale from there with higher limits and longer retention.",
	},
] as const;



export default function ErrorsPage() {
	return (
		<>
			<StructuredData
				elements={[{ type: "faq", items: [...FAQ_ITEMS] }]}
				page={{
					title: "Error Tracking | Databuddy",
					description:
						"Catch, group, and fix errors before your users notice. Stack traces, user impact, release tracking, and instant alerts.",
					url: "https://www.databuddy.cc/errors",
				}}
			/>
			<div className="overflow-hidden">
				{/* Hero */}
				<Section className="overflow-hidden" customPaddings id="hero">
					<section className="relative flex w-full flex-col items-center overflow-hidden">
						<Spotlight transform="translateX(-60%) translateY(-50%)" />

						<div className="mx-auto w-full max-w-7xl px-4 pt-16 pb-8 sm:px-6 sm:pt-20 lg:px-8 lg:pt-24">
							<div className="mx-auto max-w-7xl">
								<ErrorTrackingDemo>
									<h1 className="text-balance font-bold text-5xl leading-[1.1] tracking-tight sm:text-6xl lg:text-7xl">
										Catch errors before your users do
									</h1>
									<p className="mt-5 max-w-lg text-pretty font-medium text-muted-foreground text-sm leading-relaxed sm:text-base lg:text-lg">
										Automatic capture, source-mapped stack traces, and release tracking built into your analytics.
									</p>
									<div className="mt-6 flex items-center gap-3">
										<Button asChild className="px-6 py-5 text-base sm:px-8">
											<a href="https://app.databuddy.cc/login">Start Free</a>
										</Button>
										<Button asChild className="px-6 py-5 text-base sm:px-8" variant="secondary">
											<Link href="/docs/error-tracking">Read Docs</Link>
										</Button>
									</div>
								</ErrorTrackingDemo>
							</div>
						</div>
					</section>
				</Section>

				{/* Feature Grid */}
				<Section className="border-border border-b" id="features">
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
						<div className="mb-12 text-center lg:mb-16 lg:text-left">
							<h2 className="mx-auto max-w-4xl text-balance font-semibold text-3xl leading-tight sm:text-4xl lg:mx-0 lg:text-5xl">
								<span className="text-muted-foreground">Know what broke, </span>
								<span className="bg-linear-to-r from-foreground to-muted-foreground bg-clip-text text-transparent">
									and why
								</span>
							</h2>
							<p className="mt-3 max-w-2xl text-pretty text-muted-foreground text-sm sm:px-0 sm:text-base lg:text-lg">
								Everything you need to find, understand, and fix errors — without
								switching to another tool.
							</p>
						</div>

						<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3 lg:gap-10 xl:gap-12">
							{FEATURES.map((feature) => (
								<div className="flex" key={feature.title}>
									<SciFiGridCard
										align="left"
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
								One script. Errors, analytics, flags.
							</h2>
							<p className="max-w-lg text-pretty text-muted-foreground text-sm sm:text-base">
								Add the Databuddy script and error tracking is on by default.
								No separate SDK, no extra config — it just works.
							</p>
							<SciFiButton asChild className="px-6 py-5 text-base sm:px-8">
								<a href="https://app.databuddy.cc/login">
									Get started free
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