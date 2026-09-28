import type { Metadata } from "next";
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
import { SECTION_SPACING } from "@/components/landing/demo-constants";
import { FaqSection } from "@/components/landing/faq-section";
import Section from "@/components/landing/section";
import { StructuredData } from "@/components/structured-data";
import { cn } from "@/lib/utils";
import { TrackOnMount } from "@/components/track-on-mount";

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

const FAQ_ITEMS = [
	{
		question: "How do I turn it on?",
		answer:
			"Add data-track-errors to the Databuddy script, or pass trackErrors to the Databuddy component.",
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
					docsHref="/docs/sdk/configuration"
					footnote="Included from Hobby."
					primaryLabel="Start tracking errors"
					secondaryLabel="Read the setup docs"
					subtitle="See which errors hit the most people, and where. Built into your analytics, so there's no extra tool to add."
					title="Every error happened to someone."
					visual={<ErrorJourney />}
				/>

				<Section
					className={cn("border-border border-b", SECTION_SPACING)}
					customPaddings
					id="people"
				>
					<div className={container}>
						<SectionHeader
							subtitle="One stuck tab can throw a thousand errors. Databuddy shows how many people each error hit."
							title="Fix the error that hits the most people."
						/>
						<LoudVersusWide />
					</div>
				</Section>

				<FeatureRow
					body="Every error comes with the page, browser, and device it happened on."
					id="context"
					title="See where the visit broke."
					visual={<VisitTimeline />}
				/>

				<Section
					className={cn("border-border border-b", SECTION_SPACING)}
					customPaddings
					id="impact"
				>
					<div className={container}>
						<SectionHeader
							subtitle="On Business and Scale, Databunny checks and posts the answer to Slack."
							title="Find out if people left because of it."
						/>
						<KeptGoing />
					</div>
				</Section>

				<FeatureRow
					body="Add data-track-errors to the script you already have. Noise from browser extensions is filtered out for you."
					flip
					id="setup"
					title="Turn it on with one line."
					visual={<NoiseGate />}
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
