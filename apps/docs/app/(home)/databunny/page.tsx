import {
	AGENT_CREDIT_ALLOWANCES,
	INVESTIGATION_ALLOWANCES,
	INVESTIGATION_USAGE,
} from "@databuddy/shared/billing";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
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
	SectionHeader,
} from "@/components/landing/demo-primitives";
import { FaqSection } from "@/components/landing/faq-section";
import { SciFiButton } from "@/components/landing/scifi-btn";
import Section from "@/components/landing/section";
import { StructuredData } from "@/components/structured-data";
import { cn } from "@/lib/utils";
import { RAW_PLANS } from "../pricing/data";

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

const planItems = (planId: string) =>
	RAW_PLANS.find((plan) => plan.id === planId)?.items ?? [];

const monthlyPrice = (planId: string) => {
	for (const item of planItems(planId)) {
		if (item.type === "price") {
			return item.price;
		}
	}
};

const includedEvents = (planId: string) => {
	for (const item of planItems(planId)) {
		if (
			item.type === "priced_feature" &&
			item.feature_id === "events" &&
			typeof item.included_usage === "number"
		) {
			return item.included_usage;
		}
	}
};

const PLANS = [
	{
		id: "intelligence",
		name: "Business",
		price: monthlyPrice("intelligence"),
		investigations: INVESTIGATION_ALLOWANCES.intelligence,
		events: includedEvents("intelligence"),
		credits: AGENT_CREDIT_ALLOWANCES.intelligence.month,
		extra: null,
	},
	{
		id: "intelligence_scale",
		name: "Scale",
		price: monthlyPrice("intelligence_scale"),
		investigations: INVESTIGATION_ALLOWANCES.intelligence_scale,
		events: includedEvents("intelligence_scale"),
		credits: AGENT_CREDIT_ALLOWANCES.intelligence_scale.month,
		extra: "SSO, audit logs, and guided onboarding",
	},
] as const;

const count = (value: number | undefined) =>
	value === undefined ? "" : value.toLocaleString("en-US");

const FAQ_ITEMS = [
	{
		question: "What do I need to set up?",
		answer:
			"Databunny works on the analytics Databuddy collects, so start with the Databuddy tracker or SDK. You can run it next to your current tool. Automatic investigations need about two weeks of data to learn what normal looks like. GitHub, Stripe or Paddle, and Search Console are optional and connect in settings.",
	},
	{
		question: "How does automatic analysis work?",
		answer:
			"On the Business and Scale plans, pick a daily or weekly schedule. At 9:00 in the timezone you choose, Databunny compares the last day and the last week with recent history, investigates the changes worth your time, and saves the evidence with what to do next, or why nothing is needed.",
	},
	{
		question: "What becomes an investigation?",
		answer:
			"An investigation is one change Databunny looks into end to end, from evidence to next step. A change qualifies when it clears its thresholds, reaches enough visitors, isn't already being tracked, and, once you've added business context, matches your priorities. Routine changes stay out of your way.",
	},
	{
		question: "Does Databunny change anything on its own?",
		answer:
			"No. It only reads your analytics and the repo you link. Chat asks you to confirm before it creates or changes goals, funnels, flags, or links, and a proposed fix only applies when you click Apply.",
	},
	{
		question: "What if Databunny gets it wrong?",
		answer:
			"Reply to the investigation to question it. Clarifications are free and answer from the saved evidence, and every number in a finding is checked against data it actually read. Since nothing changes without you, a wrong call costs you a read, not an incident.",
	},
	{
		question: "What data does Databunny send to AI models?",
		answer:
			"Your question and the data needed to answer it are sent through an AI gateway to the model provider. The GitHub connection only reads the repo you link to each website. Our data policy lists every AI subprocessor and what it receives.",
	},
	{
		question: "Can investigations go to Slack?",
		answer:
			"Yes. Databunny posts actions and questions to the Slack channels you connect. When the same problem comes back, the update goes into the original thread instead of a new alert.",
	},
	{
		question: "What can I ask Databunny in chat?",
		answer: `Anything about your analytics: traffic, funnels, errors, revenue, user segments, page performance. Chat runs on AI credits included on every plan, and you see the steps and queries behind each answer. Business includes ${INVESTIGATION_ALLOWANCES.intelligence} investigations a month and Scale ${INVESTIGATION_ALLOWANCES.intelligence_scale}, with $${INVESTIGATION_USAGE.priceUsd} per extra.`,
	},
] as const;

const container = "mx-auto w-full max-w-400 px-4 sm:px-14 lg:px-20";

function FeatureRow({
	id,
	title,
	titleMuted,
	body,
	points,
	visual,
	flip = false,
	children,
}: {
	id: string;
	title: string;
	titleMuted: string;
	body: string;
	points: readonly string[];
	visual: ReactNode;
	flip?: boolean;
	children?: ReactNode;
}) {
	return (
		<Section className="border-border border-b" id={id}>
			<div
				className={cn(
					container,
					"grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
				)}
			>
				<div className={cn("flex flex-col", flip && "lg:order-2")}>
					<h2 className="text-balance font-semibold text-3xl leading-tight sm:text-4xl">
						{title} <span className="text-muted-foreground">{titleMuted}</span>
					</h2>
					<p className="mt-3 max-w-xl text-pretty text-muted-foreground text-sm sm:text-base lg:text-lg">
						{body}
					</p>
					<ul className="mt-6 flex flex-col gap-2.5">
						{points.map((point) => (
							<li className="flex gap-3 text-foreground/90 text-sm" key={point}>
								<span className="mt-1.5 size-1.5 shrink-0 bg-brand-amber" />
								{point}
							</li>
						))}
					</ul>
					{children}
				</div>
				{visual}
			</div>
		</Section>
	);
}

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
					badge={
						<span className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest">
							Databunny · AI analyst
						</span>
					}
					docsHref="https://app.databuddy.cc/register"
					footnote={
						<div className="flex flex-col gap-1.5">
							<span>
								Business is ${monthlyPrice("intelligence")} a month with{" "}
								{INVESTIGATION_ALLOWANCES.intelligence} investigations. $
								{INVESTIGATION_USAGE.priceUsd} per extra, charged only when one
								completes.
							</span>
							<span>
								Runs on your Databuddy analytics · Read-only on your code ·
								Nothing changes until you click Apply
							</span>
						</div>
					}
					primaryHref="https://app.databuddy.cc/register?plan=intelligence"
					primaryLabel="Start with Business"
					secondaryLabel="Try chat free"
					subtitle="Every morning at 9, or once a week, Databunny compares your traffic, funnels, errors, vitals, and revenue with recent history. When something really moves, it investigates and hands you what it found, the evidence, and the next step."
					title="The analyst that stays quiet until something matters."
					visual={<BaselineBands />}
				/>

				<Section className="border-border border-b" id="quiet">
					<div className={container}>
						<SectionHeader
							subtitle="AI is very good at noise. Databunny is a morning read, not a pager: most changes never reach you, and the ones that do come with a reason to act today."
							title="Quiet by default,"
							titleMuted="loud when it counts."
						/>
						<ChangeVerdicts />
					</div>
				</Section>

				<Section className="border-border border-b" id="investigations">
					<div className={container}>
						<SectionHeader
							subtitle="When a change is worth your time, Databunny pulls in every connected source that could explain it, lines up the evidence, and tells you what to do. Every number in a finding is checked against data it actually read."
							title="Investigations that"
							titleMuted="find you."
						/>
						<InvestigationStage />
					</div>
				</Section>

				<FeatureRow
					body="Only actions and questions are posted, from the Databuddy Slack app. When a problem comes back, the update lands in its original thread instead of a new alert."
					id="slack"
					points={[
						"The next step in every post, with impact and evidence underneath",
						"Watching and resolved updates stay in your dashboard",
						"Share any investigation as a public, versioned link",
					]}
					title="One problem,"
					titleMuted="one thread."
					visual={<SlackThread />}
				/>

				<FeatureRow
					body="Funnels and goals break quietly when pages move. Databunny spots the broken step, proposes the fix and, when it can, an exact check. Apply it, and it measures the result against that check once the window closes."
					flip
					id="fixes"
					points={[
						"The check is exact: a threshold, a minimum sample, and a window",
						"Verifying an applied fix is free",
						"Nothing changes until you click Apply",
					]}
					title="Fix broken funnels and goals,"
					titleMuted="then prove it worked."
					visual={<FixVerify />}
				/>

				<Section className="border-border border-b" id="github">
					<div className={container}>
						<SectionHeader
							subtitle="Link a GitHub repo and Databunny reads the commits, deploys, and pull requests around a change, down to the diff. Copy changes count too."
							title="Knows what shipped"
							titleMuted="when the numbers moved."
						/>
						<CommitZoom />
						<p className="mt-6 text-muted-foreground text-sm">
							Also reads Stripe and Paddle revenue, Search Console once
							connected, your annotations, your own pages, and your business
							context.
						</p>
					</div>
				</Section>

				<FeatureRow
					body="Ask about your traffic, funnels, errors, or revenue. Databunny picks from more than a hundred built-in queries or writes read-only SQL, shows every step it took, and answers with charts and tables."
					id="chat"
					points={[
						"Start a chat from any data table or key chart, dates and filters filled in",
						"Creates goals, funnels, flags, and links after you confirm",
						"Runs on AI credits, included on every plan",
					]}
					title="Ask anything,"
					titleMuted="see the query."
					visual={<ChatQuery />}
				/>

				<FeatureRow
					body="Connect Claude Code, Cursor, Windsurf, or any MCP client with a scoped key or OAuth. Your agent can query analytics, read investigations, and create goals, funnels, flags, and links, with exactly the permissions you grant."
					flip
					id="mcp"
					points={[
						"Keys can be limited to specific websites",
						"Tools a key can't use are hidden from the client",
						"Pick up any investigation Databunny opened",
					]}
					title="Bring your own"
					titleMuted="agent."
					visual={<McpTerminalDemo />}
				>
					<div className="mt-8">
						<SciFiButton asChild>
							<Link href="/docs/api/mcp">Set up MCP</Link>
						</SciFiButton>
					</div>
				</FeatureRow>

				<Section className="border-border border-b" id="pricing">
					<div className={container}>
						<SectionHeader
							subtitle={`An investigation is one change Databunny looks into end to end, from evidence to next step. You're charged only when one completes, at $${INVESTIGATION_USAGE.priceUsd} beyond your monthly allowance. Clarifications and checks on applied goal or funnel fixes are free.`}
							title="Pay for answers,"
							titleMuted="not attempts."
						/>
						<div className="grid border-border border-t lg:grid-cols-2">
							{PLANS.map((plan) => (
								<div
									className="flex flex-col gap-4 border-border border-b py-8 lg:border-b-0 lg:even:pl-12 lg:odd:border-r lg:odd:pr-12"
									key={plan.id}
								>
									<div className="flex items-baseline justify-between gap-4">
										<span className="font-semibold text-foreground text-xl">
											{plan.name}
										</span>
										<span className="text-muted-foreground text-sm">
											<span className="font-semibold text-2xl text-foreground">
												${plan.price}
											</span>{" "}
											/ month
										</span>
									</div>
									<ul className="flex flex-col gap-2 text-sm">
										<li className="text-foreground">
											{plan.investigations} investigations a month
										</li>
										<li className="text-muted-foreground">
											{count(plan.events)} events and {count(plan.credits)} AI
											credits a month
										</li>
										{plan.extra && (
											<li className="text-muted-foreground">{plan.extra}</li>
										)}
									</ul>
								</div>
							))}
						</div>
						<div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
							<SciFiButton asChild>
								<Link href="https://app.databuddy.cc/register?plan=intelligence">
									Start with Business
								</Link>
							</SciFiButton>
							<Link
								className="text-muted-foreground text-sm transition-colors hover:text-foreground"
								href="/pricing"
							>
								Compare every plan
							</Link>
							<span className="text-muted-foreground text-sm">
								Databunny chat runs on AI credits, included on every plan.
							</span>
						</div>
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
