import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { McpTerminalDemo } from "@/components/landing/ai-section";
import {
	BaselineBands,
	ChangeVerdicts,
	ChatQuery,
	CommitZoom,
	FixVerify,
	InvestigationStage,
	SlackThread,
} from "@/components/landing/databunny-demo-visuals";
import {
	FeatureHero,
	FeatureRow,
	FeatureSection,
} from "@/components/landing/demo-primitives";
import { FaqSection } from "@/components/landing/faq-section";
import { StructuredData } from "@/components/structured-data";
import { TrackOnMount } from "@/components/track-on-mount";

const TITLE = "Databunny: The AI Analyst That Watches Your Metrics";
const DESCRIPTION =
	"Databunny checks traffic, funnels, errors, page speed, and revenue on a schedule, investigates real changes, and posts the evidence and next step in Slack.";

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: {
		canonical: "https://www.databuddy.cc/databunny",
	},
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: "https://www.databuddy.cc/databunny",
		images: ["/og-image.png"],
	},
};

const FAQ_ITEMS = [
	{
		question: "What do I need to set up?",
		answer:
			"The Databuddy tracker. GitHub, Stripe, and Search Console are optional. Automatic checks need about two weeks of data first.",
	},
	{
		question: "How often does it run?",
		answer:
			"Daily or weekly, at 9:00 in the timezone you choose, on the Business and Scale plans.",
	},
	{
		question: "Does Databunny change anything on its own?",
		answer: "No. Nothing changes until you click Apply or confirm in chat.",
	},
	{
		question: "What data goes to AI models?",
		answer:
			"Your question and the data needed to answer it, sent to the AI model provider. Our data policy explains how that data is handled.",
	},
	{
		question: "Does it always find the cause?",
		answer:
			"No. When the data doesn't show one, Databunny says so and tells you what to keep watching.",
	},
	{
		question: "What does chat cost?",
		answer: "Chat runs on AI credits, and every plan includes some.",
	},
] as const;

export default function DatabunnyPage() {
	return (
		<>
			<TrackOnMount
				event="feature_landing_viewed"
				properties={{ feature: "databunny" }}
			/>
			<StructuredData
				elements={[{ type: "faq", items: [...FAQ_ITEMS] }]}
				page={{
					title: TITLE,
					description: DESCRIPTION,
					url: "https://www.databuddy.cc/databunny",
				}}
			/>
			<div className="overflow-x-hidden">
				<FeatureHero
					docsHref="https://app.databuddy.cc/register"
					footnote="On the Business and Scale plans."
					primaryHref="https://app.databuddy.cc/register?plan=intelligence"
					primaryLabel="Start with Business"
					secondaryLabel="Try chat free"
					subtitle="Every day or week, Databunny checks your traffic, funnels, errors, page speed, and revenue. When a change is real, it investigates and posts what it found and what to do next in Slack."
					title="The analyst that checks your numbers for you."
					visual={<BaselineBands />}
				/>

				<FeatureSection
					id="quiet"
					subtitle="Normal weekday and weekend swings and changes on small numbers are filtered out before anything reaches Slack."
					title="Hear only about changes worth acting on."
				>
					<ChangeVerdicts />
				</FeatureSection>

				<FeatureSection
					id="investigations"
					subtitle="Each investigation shows what Databunny checked and found, then ends with an action, a question for you, or a note to keep watching."
					title="See the evidence behind every finding."
				>
					<InvestigationStage />
				</FeatureSection>

				<FeatureRow
					body="Databunny posts changes that need an action or an answer, and keeps updates on the same problem in one thread."
					id="slack"
					title="Your team hears about it in Slack."
					visual={<SlackThread />}
				/>

				<FeatureRow
					body="When a funnel or goal stops matching real traffic, Databunny proposes the fix and confirms it worked after you apply it."
					flip
					id="fixes"
					title="Fix broken tracking in one click."
					visual={<FixVerify />}
				/>

				<FeatureSection
					id="github"
					subtitle="Link a GitHub repo and Databunny points to the change that likely caused it."
					title="Find the commit that moved the numbers."
				>
					<CommitZoom />
				</FeatureSection>

				<FeatureRow
					body="Ask about traffic, funnels, errors, or revenue in plain words, and open the query behind every number."
					id="chat"
					title="Get answers without writing SQL."
					visual={<ChatQuery />}
				/>

				<FeatureRow
					body="Connect any MCP client with a scoped key, and your agent can read your data and investigations and set up funnels, goals, and flags."
					flip
					id="mcp"
					title="Bring your analytics into Claude Code and Cursor."
					visual={<McpTerminalDemo />}
				/>

				<FeatureSection id="faq">
					<FaqSection items={[...FAQ_ITEMS]} />
				</FeatureSection>

				<Footer />
			</div>
		</>
	);
}
