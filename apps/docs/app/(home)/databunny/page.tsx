import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { CELL_TITLE_CLASS } from "@/components/landing/demo-constants";
import {
	FeatureHero,
	GridCell,
	SectionHeader,
	TwoColumnGrid,
} from "@/components/landing/demo-primitives";
import { FaqSection } from "@/components/landing/faq-section";
import {
	AgentChatDemo,
	AnomalyDetectionDemo,
	InsightCardsDemo,
	NarrativeSummaryDemo,
	ProactiveAlertsDemo,
	SuggestedPromptsDemo,
} from "@/components/landing/databunny-demo-visuals";
import Section from "@/components/landing/section";
import { StructuredData } from "@/components/structured-data";

export const metadata: Metadata = {
	title: "Databunny: AI Analytics Agent",
	description:
		"Ask questions about your data in plain English. Databunny is your AI analytics agent with automated insights, anomaly detection, and proactive alerts built into your dashboard.",
	alternates: {
		canonical: "https://www.databuddy.cc/databunny",
	},
	openGraph: {
		title: "Databunny: AI Analytics Agent",
		description:
			"Ask questions about your data in plain English. Databunny is your AI analytics agent with automated insights, anomaly detection, and proactive alerts built into your dashboard.",
		url: "https://www.databuddy.cc/databunny",
		images: ["/og-image.png"],
	},
};

const FAQ_ITEMS = [
	{
		question: "What can I ask Databunny?",
		answer:
			"Anything about your analytics. Traffic trends, conversion funnels, error patterns, user segments, page performance. Ask in plain English and get an answer with real data behind it.",
	},
	{
		question: "How do automated insights work?",
		answer:
			"Databunny continuously analyzes your traffic, errors, conversions, and performance across all your websites. When it finds something noteworthy (a traffic spike, a conversion drop, an error pattern), it surfaces it as an insight with context and recommended actions.",
	},
	{
		question: "What triggers an anomaly alert?",
		answer:
			"Statistical anomaly detection runs on your key metrics. When a value deviates significantly from its baseline (based on configurable thresholds), Databunny flags it as a warning or critical anomaly and can notify you via Slack, email, or webhook.",
	},
	{
		question: "Will Databunny send me too many notifications?",
		answer:
			"No. Alerts are severity-gated so you choose what level triggers a notification. Insights are batched into digests, not fired one by one. You control the signal-to-noise ratio.",
	},
	{
		question: "Is Databunny included in all plans?",
		answer:
			"Every plan includes Databunny with a monthly credit allowance. The free plan gives you 10 agent credits to start. Paid plans include more credits and higher limits.",
	},
] as const;

const container = "mx-auto w-full max-w-400 px-4 sm:px-14 lg:px-20";

export default function DatabunnyPage() {
	return (
		<>
			<StructuredData
				elements={[{ type: "faq", items: [...FAQ_ITEMS] }]}
				page={{
					title: "Databunny: AI Analytics Agent",
					description:
						"Ask questions about your data in plain English. Automated insights, anomaly detection, and proactive alerts.",
					url: "https://www.databuddy.cc/databunny",
				}}
			/>
			<div className="overflow-x-hidden">
				<FeatureHero
					docsHref="/docs"
					subtitle="Ask questions in plain English, get answers backed by real data. Databunny watches your analytics around the clock, surfacing insights, catching anomalies, and alerting you before problems grow."
					title="Your data, explained."
				/>

				<Section className="border-border border-b" id="agent">
					<div className={container}>
						<SectionHeader
							subtitle="Type a question about your traffic, conversions, errors, or performance. Databunny queries your data and answers in seconds."
							title="Ask anything,"
							titleMuted="get real answers."
						/>
						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Have a conversation with your analytics data.
								</h3>
								<AgentChatDemo />
							</GridCell>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Start from a suggestion or ask your own question.
								</h3>
								<SuggestedPromptsDemo />
							</GridCell>
						</TwoColumnGrid>
					</div>
				</Section>

				<Section className="border-border border-b" id="insights">
					<div className={container}>
						<SectionHeader
							subtitle="Databunny analyzes your data continuously and surfaces what matters. No queries needed, insights come to you."
							title="Insights that"
							titleMuted="find you."
						/>
						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Surface trends, spikes, and drops automatically.
								</h3>
								<InsightCardsDemo />
							</GridCell>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Get a weekly summary across all your sites.
								</h3>
								<NarrativeSummaryDemo />
							</GridCell>
						</TwoColumnGrid>
					</div>
				</Section>

				<Section className="border-border border-b" id="detection">
					<div className={container}>
						<SectionHeader
							subtitle="Statistical anomaly detection on your key metrics. Configurable thresholds, severity levels, and alerts to Slack, email, or webhooks."
							title="Catch problems"
							titleMuted="before users do."
						/>
						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Detect spikes and drops across pageviews, errors, and events.
								</h3>
								<AnomalyDetectionDemo />
							</GridCell>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Get notified where you already work.
								</h3>
								<ProactiveAlertsDemo />
							</GridCell>
						</TwoColumnGrid>
					</div>
				</Section>

				<Section className="border-border border-b" id="faq">
					<div className={container}>
						<FaqSection eyebrow="FAQ" items={[...FAQ_ITEMS]} />
					</div>
				</Section>

				<Footer />
			</div>
		</>
	);
}
