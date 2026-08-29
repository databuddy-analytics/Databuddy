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
import { MidPageCta } from "@/components/landing/mid-page-cta";
import Section from "@/components/landing/section";
import {
	UptimeAlertsStackVisual,
	UptimeIncidentTimelineVisual,
	UptimeRegionsHubDiagram,
	UptimeStatusPageMiniVisual,
} from "@/components/landing/uptime-landing-visuals";
import { StructuredData } from "@/components/structured-data";

export const metadata: Metadata = {
	title: "Uptime Monitoring - Status Pages & 1-Minute Checks",
	description:
		"1-minute HTTP checks, one alert per status change to Slack, email, or webhook, and public branded status pages. Included with Databuddy on every plan.",
	alternates: {
		canonical: "https://www.databuddy.cc/uptime",
	},
	openGraph: {
		title: "Uptime Monitoring - Status Pages & 1-Minute Checks",
		description:
			"1-minute HTTP checks, one alert per status change to Slack, email, or webhook, and public branded status pages. Included with Databuddy on every plan.",
		url: "https://www.databuddy.cc/uptime",
		images: ["/og-image.png"],
	},
};

const FAQ_ITEMS = [
	{
		question: "How quickly will I know if my site goes down?",
		answer:
			"Checks run as often as every 60 seconds, and an alert fires on the first check that sees your site go from up to down.",
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
			"Any public website, API, or web service. Point a monitor at a page or health endpoint and the check passes or fails on the HTTP response.",
	},
	{
		question: "Is uptime monitoring included in all plans?",
		answer:
			"Yes, including the free plan. Uptime checks never count toward your event quota, so monitoring stays free no matter how often your sites are checked.",
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
						"1-minute checks, public status pages, and one alert per status change. Included with Databuddy.",
					url: "https://www.databuddy.cc/uptime",
				}}
			/>
			<div className="overflow-x-hidden">
				<FeatureHero
					docsHref="/docs"
					footnote="Included on every plan. Checks never count toward your event quota."
					primaryLabel="Start Monitoring"
					subtitle="1-minute HTTP checks, one alert per status change, and a public status page your customers can check themselves. In the same dashboard as your analytics."
					title="Know the minute your site goes down."
				/>

				<Section className="border-border border-b" id="how-it-works">
					<div className={container}>
						<SectionHeader
							subtitle="Checks every 60 seconds with one alert per status change. No repeat pages during an incident, and a clear signal when it recovers."
							title="Catch issues"
							titleMuted="before your users do."
						/>

						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									HTTP checks on your sites, as often as every 60 seconds.
								</h3>
								<UptimeRegionsHubDiagram />
							</GridCell>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									One alert per incident to Slack, email, or webhook.
								</h3>
								<UptimeAlertsStackVisual />
							</GridCell>
						</TwoColumnGrid>

						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Publish a status page without leaking internals.
								</h3>
								<UptimeStatusPageMiniVisual />
							</GridCell>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Post incident updates your users can follow.
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

				<Section className="border-border border-b" id="cta">
					<div className={container}>
						<MidPageCta />
					</div>
				</Section>

				<Footer />
			</div>
		</>
	);
}
