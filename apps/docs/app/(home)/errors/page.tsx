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

const TITLE = "Open-source JavaScript error tracking";
const DESCRIPTION =
	"Track JavaScript errors in the script you already use for analytics. See the stack trace, page, browser, and how many people each error hit.";

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
		question: "What does it catch?",
		answer:
			"Uncaught errors and unhandled promise rejections, with the message, stack trace, file, line, and column.",
	},
	{
		question: "Are errors grouped?",
		answer:
			"Errors with the same message are counted together, with the number of people each one reached.",
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
					subtitle="Uncaught errors and failed promises land in your analytics with the stack trace, the page, and how many people each one hit."
					title="Every error happened to someone."
					visual={<ErrorJourney />}
				/>

				<FeatureSection
					id="people"
					subtitle="One stuck tab can throw a thousand errors. Databuddy shows how many people each error hit."
					title="Find the errors that hit the most people."
				>
					<LoudVersusWide />
				</FeatureSection>

				<FeatureRow
					body="Open an error for its stack trace, file and line, browser, device, and country, so you know where to start looking."
					id="context"
					title="Get the stack trace and where it happened."
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
					body={`Add data-track-errors to the script you already have. Errors from browser extensions, cross-origin "Script error." messages, and ResizeObserver warnings stay out of your list.`}
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
