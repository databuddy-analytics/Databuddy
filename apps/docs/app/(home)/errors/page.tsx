import { ArrowRightIcon } from "@databuddy/ui/icons";
import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/footer";
import {
	FeatureHero,
	FeatureRow,
	SectionHeader,
} from "@/components/landing/demo-primitives";
import {
	ErrorJourney,
	KeptGoing,
	LoudVersusWide,
	NoiseGate,
	VisitTimeline,
} from "@/components/landing/error-demo-visuals";
import { FaqSection } from "@/components/landing/faq-section";
import { SciFiButton } from "@/components/landing/scifi-btn";
import Section from "@/components/landing/section";
import { StructuredData } from "@/components/structured-data";
import { TrackOnMount } from "@/components/track-on-mount";
import { planIncludedEvents, planMonthlyPrice } from "../pricing/data";

const TITLE = "JavaScript Error Tracking: Every Error Happened to Someone";
const DESCRIPTION =
	"See which JavaScript errors hit the most people, and where. Built into your analytics, no extra tool.";

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: {
		canonical: "https://www.databuddy.cc/errors",
	},
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: "https://www.databuddy.cc/errors",
		images: ["/og-image.png"],
	},
};

const PLANS = [
	{ id: "hobby", name: "Hobby", note: "Error tracking starts here" },
	{ id: "pro", name: "Pro", note: "For growing apps" },
	{
		id: "intelligence",
		name: "Business",
		note: "Adds Databunny",
	},
] as const;

const FAQ_ITEMS = [
	{
		question: "How do I turn it on?",
		answer:
			"Add data-track-errors to the Databuddy script, or pass trackErrors to the Databuddy component.",
	},
	{
		question: "Will it slow down my site?",
		answer:
			"No extra script loads. Error tracking is part of the Databuddy script you already have.",
	},
	{
		question: "How are errors grouped?",
		answer: "By message, so the same bug shows up as one row.",
	},
	{
		question: "Do you support source maps?",
		answer: "Not yet. You see the file, line, and column the browser reports.",
	},
	{
		question: "Can I get alerts?",
		answer:
			"Not yet for errors. On Business and Scale, Databunny posts error spikes to Slack.",
	},
	{
		question: "Do you record sessions?",
		answer: "No. You see counts and context, never a recording.",
	},
	{
		question: "Can I track server errors?",
		answer: "Yes, send them to the errors API.",
	},
	{
		question: "Which plans include it?",
		answer: "Hobby and up. Each error counts as one event.",
	},
] as const;

const container = "mx-auto w-full max-w-400 px-4 sm:px-14 lg:px-20";

export default function ErrorsPage() {
	return (
		<>
			<TrackOnMount
				event="feature_landing_viewed"
				properties={{ feature: "errors" }}
			/>
			<StructuredData
				elements={[{ type: "faq", items: [...FAQ_ITEMS] }]}
				page={{
					title: TITLE,
					description: DESCRIPTION,
					url: "https://www.databuddy.cc/errors",
				}}
			/>
			<div className="overflow-x-hidden">
				<FeatureHero
					badge={
						<span className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest">
							Error tracking
						</span>
					}
					docsHref="/docs/sdk/configuration"
					footnote={`From $${planMonthlyPrice("hobby")} a month on Hobby. Errors count as regular events.`}
					primaryLabel="Start tracking errors"
					secondaryLabel="Read the setup docs"
					subtitle="See which errors hit the most people, and where. Built into your analytics, so there's no extra tool to add."
					title="Every error happened to someone."
					visual={<ErrorJourney />}
				/>

				<Section className="border-border border-b" id="people">
					<div className={container}>
						<SectionHeader
							subtitle="One stuck tab can throw a thousand errors. Databuddy shows how many people each error hit, so you fix the right one first."
							title="Loud isn't the same as"
							titleMuted="widespread."
						/>
						<LoudVersusWide />
					</div>
				</Section>

				<FeatureRow
					body="Every error comes with the page, browser, and device it happened on."
					id="context"
					points={[
						"File, line, and column",
						"Errors per visitor on each page",
						"Filter by error or page in one click",
					]}
					title="See where"
					titleMuted="the visit broke."
					visual={<VisitTimeline />}
				/>

				<Section className="border-border border-b" id="impact">
					<div className={container}>
						<SectionHeader
							subtitle="On Business and Scale, Databunny tells you whether people left after an error, and posts it to Slack."
							title="Did they keep going?"
							titleMuted="Databunny checks."
						/>
						<KeptGoing />
						<div className="mt-6">
							<Link
								className="inline-flex items-center gap-1 text-foreground text-sm transition-opacity hover:opacity-80"
								href="/databunny"
							>
								Meet Databunny
								<ArrowRightIcon className="size-3.5" />
							</Link>
						</div>
					</div>
				</Section>

				<FeatureRow
					body="Add data-track-errors to the script you already have. Noise from browser extensions is filtered out for you."
					flip
					id="setup"
					points={[
						"No second SDK",
						"Bots and local testing are ignored",
						"Server errors through the API",
					]}
					title="Turn it on"
					titleMuted="with one line."
					visual={<NoiseGate />}
				>
					<div className="mt-8">
						<SciFiButton asChild>
							<Link href="/docs/sdk/configuration">See the setup</Link>
						</SciFiButton>
					</div>
				</FeatureRow>

				<Section className="border-border border-b" id="pricing">
					<div className={container}>
						<SectionHeader
							subtitle="Each error counts as one event. No separate error bill. Included from Hobby."
							title="Errors cost what"
							titleMuted="pageviews cost."
						/>
						<div className="grid border-border border-t lg:grid-cols-3">
							{PLANS.map((plan) => (
								<div
									className="flex flex-col gap-3 border-border border-b py-8 lg:border-r lg:border-b-0 lg:px-10 lg:last:border-r-0 lg:first:pl-0"
									key={plan.id}
								>
									<div className="flex items-baseline justify-between gap-4">
										<span className="font-semibold text-foreground text-xl">
											{plan.name}
										</span>
										<span className="text-muted-foreground text-sm">
											<span className="font-semibold text-2xl text-foreground">
												${planMonthlyPrice(plan.id)}
											</span>{" "}
											/ month
										</span>
									</div>
									<p className="text-foreground text-sm">
										{planIncludedEvents(plan.id)?.toLocaleString("en-US")}{" "}
										events a month, errors included
									</p>
									<p className="text-muted-foreground text-sm">{plan.note}</p>
								</div>
							))}
						</div>
						<div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
							<Link
								className="text-muted-foreground text-sm transition-colors hover:text-foreground"
								href="/pricing"
							>
								Compare every plan
							</Link>
						</div>
					</div>
				</Section>

				<Section className="border-border border-b" id="faq">
					<div className={container}>
						<FaqSection items={[...FAQ_ITEMS]} />
					</div>
				</Section>

				<Section className="border-border border-b" id="cta">
					<div className={container}>
						<div className="flex flex-col items-start gap-6">
							<h2 className="text-balance font-semibold text-3xl leading-tight sm:text-4xl lg:text-5xl">
								See who your errors hit.{" "}
								<span className="text-muted-foreground">
									It takes one line.
								</span>
							</h2>
							<div className="flex flex-wrap items-center gap-x-6 gap-y-3">
								<SciFiButton asChild>
									<Link href="https://app.databuddy.cc/register">
										Start tracking errors
									</Link>
								</SciFiButton>
								<Link
									className="text-muted-foreground text-sm transition-colors hover:text-foreground"
									href="/docs/sdk/configuration"
								>
									Read the setup docs
								</Link>
							</div>
						</div>
					</div>
				</Section>

				<Footer />
			</div>
		</>
	);
}
