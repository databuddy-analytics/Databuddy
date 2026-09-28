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
	SectionHeader,
} from "@/components/landing/demo-primitives";
import { SECTION_SPACING } from "@/components/landing/demo-constants";
import { FaqSection } from "@/components/landing/faq-section";
import Section from "@/components/landing/section";
import { StructuredData } from "@/components/structured-data";
import { cn } from "@/lib/utils";

const TITLE = "Databunny: the AI analyst that stays quiet until it matters";
const DESCRIPTION =
	"Databunny compares your analytics with recent history, investigates real changes with your commits and revenue, and sends what it found and the next step to Slack.";

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

const container = "mx-auto w-full max-w-400 px-4 sm:px-14 lg:px-20";

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
					subtitle="Every morning, Databunny checks your traffic, funnels, errors, and revenue. When something really moves, it tells you why and what to do."
					title="The analyst that stays quiet until something matters."
					visual={<BaselineBands />}
				/>

				<Section
					className={cn("border-border border-b", SECTION_SPACING)}
					customPaddings
					id="quiet"
				>
					<div className={container}>
						<SectionHeader
							subtitle="Normal swings and small numbers stay out of your Slack."
							title="Most changes never reach you."
						/>
						<ChangeVerdicts />
					</div>
				</Section>

				<Section
					className={cn("border-border border-b", SECTION_SPACING)}
					customPaddings
					id="investigations"
				>
					<div className={container}>
						<SectionHeader
							subtitle="Each investigation ends with what to do next."
							title="When a number moves, Databunny finds out why."
						/>
						<InvestigationStage />
					</div>
				</Section>

				<FeatureRow
					body="Only things worth acting on get posted. If a problem comes back, the update goes in the same thread."
					id="slack"
					title="One Slack thread per problem."
					visual={<SlackThread />}
				/>

				<FeatureRow
					body="When a funnel or goal breaks, Databunny proposes the fix. Apply it, and it checks the result for free."
					flip
					id="fixes"
					title="Broken funnels and goals come with a fix."
					visual={<FixVerify />}
				/>

				<Section
					className={cn("border-border border-b", SECTION_SPACING)}
					customPaddings
					id="github"
				>
					<div className={container}>
						<SectionHeader
							subtitle="Link a GitHub repo and Databunny reads the commits and diffs around a change."
							title="It knows what you shipped."
						/>
						<CommitZoom />
					</div>
				</Section>

				<FeatureRow
					body="Ask about your traffic, funnels, errors, or revenue, and see the query behind every answer."
					id="chat"
					title="Ask it a question."
					visual={<ChatQuery />}
				/>

				<FeatureRow
					body="Connect Claude Code, Cursor, or any MCP client with a scoped key."
					flip
					id="mcp"
					title="Use it from your own agent."
					visual={<McpTerminalDemo />}
				/>

				<Section
					className={cn("border-border border-b", SECTION_SPACING)}
					customPaddings
					id="faq"
				>
					<div className={container}>
						<FaqSection items={[...FAQ_ITEMS]} />
					</div>
				</Section>

				<Footer />
			</div>
		</>
	);
}
