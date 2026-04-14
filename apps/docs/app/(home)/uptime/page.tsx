import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/footer";
import { ClosingCtaSection } from "@/components/landing/closing-cta-section";
import { FaqSection } from "@/components/landing/faq-section";
import Section from "@/components/landing/section";
import {
	UptimeAlertsStackVisual,
	UptimeIncidentTimelineVisual,
	UptimeRegionsHubDiagram,
	UptimeStatusPageMiniVisual,
} from "@/components/landing/uptime-landing-visuals";
import { StructuredData } from "@/components/structured-data";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
	title: "Uptime Monitoring (coming Q3 2026) | Databuddy",
	description:
		"1-minute checks from six regions, instant alerts, and public status pages — included with Databuddy. Launching Q3 2026. Join the waitlist for early access.",
	alternates: {
		canonical: "https://www.databuddy.cc/uptime",
	},
	openGraph: {
		title: "Uptime Monitoring (coming Q3 2026) | Databuddy",
		description:
			"1-minute checks from six regions, instant alerts, and public status pages — included with Databuddy. Launching Q3 2026.",
		url: "https://www.databuddy.cc/uptime",
		images: ["/og-image.png"],
	},
};

const CELL_TITLE_CLASS =
	"mb-5 text-balance font-semibold text-base text-foreground sm:mb-6 sm:text-lg";

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

export default function UptimePage() {
	return (
		<>
			<StructuredData
				elements={[{ type: "faq", items: [...FAQ_ITEMS] }]}
				page={{
					title: "Uptime Monitoring | Databuddy",
					description:
						"1-minute checks, status pages, and instant alerts — coming to Databuddy Q3 2026.",
					url: "https://www.databuddy.cc/uptime",
				}}
			/>
			<div className="overflow-x-hidden">
				<Section
					className="overflow-hidden border-border border-b"
					customPaddings
					id="hero"
				>
					<section className="relative flex w-full flex-col overflow-hidden">
						<div className="mx-auto w-full max-w-7xl px-4 pt-16 pb-12 sm:px-6 sm:pt-20 sm:pb-16 lg:px-8 lg:pt-24 lg:pb-24 xl:pb-28">
							<div className="flex w-full max-w-4xl flex-col items-start space-y-5 text-left sm:space-y-6">
								<div className="flex flex-wrap items-center gap-2">
									<span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
										<span
											aria-hidden
											className="size-1.5 rounded-full bg-amber-400"
										/>
										<span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest sm:text-[11px]">
											Coming Soon
										</span>
									</span>
								</div>

								<h1 className="max-w-4xl text-balance font-bold text-4xl leading-[1.1] tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
									Be the first to know when your site goes down.
								</h1>

								<p className="max-w-2xl text-pretty font-medium text-muted-foreground text-sm leading-relaxed sm:text-base lg:text-lg">
									Status pages, 1-minute checks, and instant alerts so you find
									out before your users tweet about it.
								</p>

								<div className="flex flex-wrap items-center gap-3">
									<Button asChild className="px-6 py-5 text-base sm:px-8">
										<a href="https://app.databuddy.cc/login">
											Join Waitlist
										</a>
									</Button>
									<Button
										asChild
										className="px-6 py-5 text-base sm:px-8"
										variant="secondary"
									>
										<Link href="/roadmap">View Roadmap</Link>
									</Button>
								</div>
							</div>
						</div>
					</section>
				</Section>

				<Section
					className="border-border border-b pt-12 pb-0 sm:pt-16 sm:pb-0 lg:pt-24 lg:pb-0 xl:pt-32 xl:pb-0"
					customPaddings
					id="how-it-works"
				>
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
						<p className="mb-2 font-medium font-mono text-[10px] text-muted-foreground uppercase tracking-widest sm:text-[11px]">
							How it works
						</p>
						<h2 className="text-balance font-semibold text-3xl leading-tight sm:text-4xl lg:text-5xl">
							Catch issues{" "}
							<span className="text-muted-foreground">
								before your users do.
							</span>
						</h2>
						<p className="mt-3 text-pretty pb-8 text-muted-foreground text-sm sm:text-base lg:pb-10 lg:text-lg">
							1-minute checks from multiple regions. Alerts the second
							something&apos;s wrong. Status pages your users actually trust.
						</p>
					</div>

					<div className="w-full border-border border-t border-b">
						<div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 lg:grid-cols-2">
							<div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-border lg:block" />
							<div className="border-border border-b px-4 pt-5 pb-2 sm:px-6 lg:border-r lg:border-b-0 lg:px-8 lg:pt-6 lg:pb-2">
								<h3 className={CELL_TITLE_CLASS}>
									HTTP monitoring every 60 seconds, from 6 regions.
								</h3>
								<div className="mt-2">
									<UptimeRegionsHubDiagram />
								</div>
							</div>
							<div className="px-4 pt-5 pb-2 sm:px-6 lg:px-8 lg:pt-6 lg:pb-2">
								<h3 className={CELL_TITLE_CLASS}>
									Slack, email, or webhook in under 30 seconds.
								</h3>
								<div className="mt-2">
									<UptimeAlertsStackVisual />
								</div>
							</div>
						</div>
					</div>
					<div className="w-full border-border border-b">
						<div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 lg:grid-cols-2">
							<div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px -translate-x-1/2 bg-border lg:block" />
							<div className="border-border border-b px-4 pt-5 pb-2 sm:px-6 lg:border-r lg:border-b-0 lg:px-8 lg:pt-6 lg:pb-2">
								<h3 className={CELL_TITLE_CLASS}>
									Share a status page transparently with your users.
								</h3>
								<div className="mt-2">
									<UptimeStatusPageMiniVisual />
								</div>
							</div>
							<div className="px-4 pt-5 pb-2 sm:px-6 lg:px-8 lg:pt-6 lg:pb-2">
								<h3 className={CELL_TITLE_CLASS}>
									Every incident, documented automatically.
								</h3>
								<div className="mt-2">
									<UptimeIncidentTimelineVisual />
								</div>
							</div>
						</div>
					</div>
				</Section>

				<Section className="border-border border-b" id="faq">
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
						<FaqSection eyebrow="FAQ" items={[...FAQ_ITEMS]} />
					</div>
				</Section>

				<ClosingCtaSection
					primaryCta={{
						href: "https://app.databuddy.cc/login",
						label: "Join Waitlist",
					}}
					secondaryCta={{ href: "/", label: "Explore what's live" }}
				/>

				<Footer />
			</div>
		</>
	);
}
