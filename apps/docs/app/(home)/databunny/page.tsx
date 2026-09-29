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

const TITLE = "Databunny: the AI analyst that tells you why your numbers moved";
const DESCRIPTION =
	"Databunny checks your analytics every morning, finds out why a number moved, and tells your team what to do next in Slack.";

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
			"Your question and the data needed to answer it. Our data policy lists every AI provider.",
	},
	{
		question: "What does chat cost?",
		answer: "Chat runs on AI credits, and every plan includes some.",
	},
] as const;

export default function DatabunnyPage() {
	return (
		<>
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
					subtitle="Every morning, Databunny checks your traffic, funnels, errors, and revenue. If something moves, it tells you why and what to do about it."
					title="Wake up to the reason your numbers moved."
					visual={<BaselineBands />}
				/>

				<FeatureSection
					id="quiet"
					subtitle="Normal swings and small numbers get filtered out, so what reaches you is worth acting on."
					title="Stop refreshing dashboards."
				>
					<ChangeVerdicts />
				</FeatureSection>

				<FeatureSection
					id="investigations"
					subtitle="Each investigation ends with what to do next."
					title="When a number moves, Databunny finds out why."
				>
					<InvestigationStage />
				</FeatureSection>

				<FeatureRow
					body="Databunny posts what broke and what to do next, and keeps follow-ups on the same problem in one thread."
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
					body="Ask about traffic, funnels, errors, or revenue in plain words, and check the query behind every answer."
					id="chat"
					title="Get answers without writing SQL."
					visual={<ChatQuery />}
				/>

				<FeatureRow
					body="Connect any MCP client with a scoped key, and your agent can read your data and set up funnels and goals."
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
