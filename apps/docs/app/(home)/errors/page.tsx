import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import {
	FeatureHero,
	FeatureRow,
	FeatureSection,
} from "@/components/landing/demo-primitives";
import {
	ErrorJourney,
	KeptGoing,
	LoudVersusWide,
	NoiseGate,
	VisitTimeline,
} from "@/components/landing/error-demo-visuals";
import { FaqSection } from "@/components/landing/faq-section";
import { StructuredData } from "@/components/structured-data";
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
					subtitle="See which errors hit the most people and where, in the analytics you already use."
					title="Every error happened to someone."
					visual={<ErrorJourney />}
				/>

				<FeatureSection
					id="people"
					subtitle="One stuck tab can throw a thousand errors. Databuddy shows how many people each error hit."
					title="Fix what hurts the most people first."
				>
					<LoudVersusWide />
				</FeatureSection>

				<FeatureRow
					body="Every error comes with the page, browser, and device it happened on, so you know where to start looking."
					id="context"
					title="Reproduce bugs without guessing."
					visual={<VisitTimeline />}
				/>

				<FeatureSection
					id="impact"
					subtitle="On Business and Scale, Databunny compares visits that hit the error with similar visits that didn't."
					title="Know which errors make people leave."
				>
					<KeptGoing />
				</FeatureSection>

				<FeatureRow
					body="Add data-track-errors to the script you already have. Noise from browser extensions is filtered out for you."
					flip
					id="setup"
					title="Turn it on with one line."
					visual={<NoiseGate />}
				/>

				<FeatureSection id="faq">
					<FaqSection items={[...FAQ_ITEMS]} />
				</FeatureSection>

				<Footer />
			</div>
		</>
	);
}
