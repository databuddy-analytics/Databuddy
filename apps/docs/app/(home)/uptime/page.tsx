import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { TrackOnMount } from "@/components/track-on-mount";
import { CELL_TITLE_CLASS } from "@/components/landing/demo-constants";
import {
	FeatureHero,
	GridCell,
	SectionHeader,
	TwoColumnGrid,
} from "@/components/landing/demo-primitives";
import { FaqSection } from "@/components/landing/faq-section";
import Section from "@/components/landing/section";
import {
	UptimeAlertsStackVisual,
	UptimeIncidentTimelineVisual,
	UptimeRegionsHubDiagram,
	UptimeStatusPageMiniVisual,
} from "@/components/landing/uptime-landing-visuals";
import { StructuredData } from "@/components/structured-data";

export const metadata: Metadata = {
	title: "Uptime Monitoring (coming Q3 2026)",
	description:
		"1-minute checks from six regions, instant alerts, and public status pages - included with Databuddy. Launching Q3 2026. Join the waitlist for early access.",
	alternates: {
		canonical: "https://www.databuddy.cc/uptime",
	},
	openGraph: {
		title: "Uptime Monitoring (coming Q3 2026)",
		description:
			"1-minute checks from six regions, instant alerts, and public status pages - included with Databuddy. Launching Q3 2026.",
		url: "https://www.databuddy.cc/uptime",
		images: ["/og-image.png"],
	},
};

const FAQ_ITEMS = [
	{
		question: "How quickly will I know if my site goes down?",
		answer:
			"Within a minute. Checks run as frequently as every 60 seconds, and you get notified the moment something goes wrong - before your customers notice.",
	},
	{
		question: "Can my customers see the status page?",
		answer:
			"Yes. You get a public, branded status page that shows real-time uptime data. Share it with customers so they can check service health themselves instead of filing support tickets.",
	},
	{
		question: "Will I get spammed with alerts?",
		answer:
			"No. Alerts only fire when status actually changes - from up to down, or down to up. You won't get repeated notifications during intermittent issues, just one clear signal when something needs attention.",
	},
	{
		question: "What kind of services can I monitor?",
		answer:
			"Any public website, API, or web service. You can also parse JSON health endpoints to monitor specific fields - useful for services that report their own status.",
	},
	{
		question: "Is uptime monitoring included in all plans?",
		answer:
			"Uptime monitoring is available on every paid plan. The number of monitors and how frequently they run depends on your tier - check the pricing page for the full breakdown.",
	},
] as const;

const container = "mx-auto w-full max-w-400 px-4 sm:px-14 lg:px-20";

export default function UptimePage() {
	return (
		<>
			<TrackOnMount
				event="feature_landing_viewed"
				properties={{ feature: "uptime" }}
			/>
			<StructuredData
				elements={[{ type: "faq", items: [...FAQ_ITEMS] }]}
				page={{
					title: "Uptime Monitoring",
					description:
						"1-minute checks, status pages, and instant alerts - coming to Databuddy Q3 2026.",
					url: "https://www.databuddy.cc/uptime",
				}}
			/>
			<div className="overflow-x-hidden">
				<FeatureHero
					badge={
						<span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
							<span
								aria-hidden
								className="size-1.5 rounded-full bg-amber-400"
							/>
							<span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest sm:text-[11px]">
								Coming Soon
							</span>
						</span>
					}
					docsHref="/docs"
					primaryLabel="Join Waitlist"
					subtitle="Status pages, 1-minute checks, and instant alerts so you find out before your users tweet about it."
					title="Be the first to know when your site goes down."
				/>

				<Section className="border-border border-b" id="how-it-works">
					<div className={container}>
						<SectionHeader
							subtitle="1-minute checks from multiple regions. Alerts the second something's wrong. Status pages your users actually trust."
							title="Catch issues"
							titleMuted="before your users do."
						/>

						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									HTTP monitoring every 60 seconds, from 6 regions.
								</h3>
								<UptimeRegionsHubDiagram />
							</GridCell>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Slack, email, or webhook in under 30 seconds.
								</h3>
								<UptimeAlertsStackVisual />
							</GridCell>
						</TwoColumnGrid>

						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Share a status page transparently with your users.
								</h3>
								<UptimeStatusPageMiniVisual />
							</GridCell>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Every incident, documented automatically.
								</h3>
								<UptimeIncidentTimelineVisual />
							</GridCell>
						</TwoColumnGrid>
					</div>
				</Section>

				<Section className="border-border border-b" id="faq">
					<div className={container}>
						<FaqSection items={[...FAQ_ITEMS]} />
					</div>
				</Section>

				<Footer />
			</div>
		</>
	);
}
