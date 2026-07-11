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
	title: "AI Analytics Agent - Ask Your Data Questions in Plain English",
	description:
		"Ask analytics questions in plain English. Run automatic analysis daily or weekly, save noteworthy findings, and send them to Slack.",
	alternates: {
		canonical: "https://www.databuddy.cc/databunny",
	},
	openGraph: {
		title: "AI Analytics Agent - Ask Your Data Questions in Plain English",
		description:
			"Ask analytics questions in plain English. Run automatic analysis daily or weekly, save noteworthy findings, and send them to Slack.",
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
		question: "How does automatic analysis work?",
		answer:
			"Choose a daily or weekly organization schedule. Databunny analyzes each website, saves noteworthy changes as findings, and includes the evidence and a recommended next step.",
	},
	{
		question: "What becomes a finding?",
		answer:
			"Databunny compares recent periods and checks anomaly baselines across traffic, errors, conversions, events, and performance. It saves only changes with enough evidence to act on.",
	},
	{
		question: "Can findings go to Slack?",
		answer:
			"Yes. Add Slack channels to the organization. After each analysis, websites with new findings post them there.",
	},
	{
		question: "Is Databunny included in all plans?",
		answer:
			"Every plan includes a Databunny usage allowance for questions and analysis. Free includes 10 usage units each month; deeper analysis can use more of the allowance than simple questions.",
	},
] as const;

const container = "mx-auto w-full max-w-400 px-4 sm:px-14 lg:px-20";

export default function DatabunnyPage() {
	return (
		<>
			<StructuredData
				elements={[{ type: "faq", items: [...FAQ_ITEMS] }]}
				page={{
					title:
						"AI Analytics Agent - Ask Your Data Questions in Plain English",
					description:
						"Ask analytics questions in plain English. Run automatic analysis daily or weekly, save noteworthy findings, and send them to Slack.",
					url: "https://www.databuddy.cc/databunny",
				}}
			/>
			<div className="overflow-x-hidden">
				<FeatureHero
					docsHref="/docs"
					subtitle="Type a question for an immediate answer, or schedule daily or weekly analysis. Databunny saves noteworthy changes as findings backed by your data."
					title="Ask your analytics anything in plain English."
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
							subtitle="Schedule daily or weekly analysis across your organization. Each website with something noteworthy gets a clear, evidence-backed finding."
							title="Findings that"
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
							subtitle="Databunny checks traffic, errors, events, conversions, and performance, then sends new findings to your configured Slack channels."
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
						<FaqSection items={[...FAQ_ITEMS]} />
					</div>
				</Section>

				<Footer />
			</div>
		</>
	);
}
