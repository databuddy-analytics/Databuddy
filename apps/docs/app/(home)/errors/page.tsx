import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { CELL_TITLE_CLASS } from "@/components/landing/demo-constants";
import {
	FeatureHero,
	GridCell,
	SectionHeader,
	TwoColumnGrid,
} from "@/components/landing/demo-primitives";
import { ErrorAutoCaptureAlertsStackDemo } from "@/components/landing/error-auto-capture-alerts-stack-demo";
import { ErrorFrequencyChartDemo } from "@/components/landing/error-frequency-chart-demo";
import { ErrorPerPageBreakdownDemo } from "@/components/landing/error-per-page-breakdown-demo";
import { ErrorImpactTableArtifact } from "@/components/landing/error-who-it-affects-artifacts";
import { FaqSection } from "@/components/landing/faq-section";
import Section from "@/components/landing/section";
import { StructuredData } from "@/components/structured-data";

export const metadata: Metadata = {
	title: "Error Tracking",
	description:
		"Catch, group, and fix errors before your users notice. Stack traces, user impact, release tracking, and instant alerts - built into your analytics stack.",
	alternates: {
		canonical: "https://www.databuddy.cc/errors",
	},
	openGraph: {
		title: "Error Tracking",
		description:
			"Catch, group, and fix errors before your users notice. Stack traces, user impact, release tracking, and instant alerts - built into your analytics stack.",
		url: "https://www.databuddy.cc/errors",
		images: ["/og-image.png"],
	},
};

const FAQ_ITEMS = [
	{
		question: "Will error tracking slow down my site?",
		answer:
			"No. The error tracking SDK is tiny and runs asynchronously. It only activates when something goes wrong - there's no polling, no impact on your page load time.",
	},
	{
		question: "How does Databuddy group errors?",
		answer:
			"Errors are grouped by their stack trace fingerprint, so the same bug hitting thousands of users shows up as one issue - not thousands. You can also manually merge or split groups.",
	},
	{
		question: "Can I see which users were affected by an error?",
		answer:
			"Yes. If you identify users in your analytics setup, every error is linked to the affected user sessions. You can see exactly who hit the bug and replay the context.",
	},
	{
		question: "Does it work with server-side errors too?",
		answer:
			"Yes. The Node.js SDK captures unhandled exceptions and rejections on the server side. Both client and server errors appear in the same dashboard.",
	},
	{
		question: "Is error tracking included in all plans?",
		answer:
			"Error tracking is available on every plan. The free plan gives you 1,000 error events per month - paid plans scale from there with higher limits and longer retention.",
	},
] as const;

const container = "mx-auto w-full max-w-400 px-4 sm:px-14 lg:px-20";

export default function ErrorsPage() {
	return (
		<>
			<StructuredData
				elements={[{ type: "faq", items: [...FAQ_ITEMS] }]}
				page={{
					title: "Error Tracking",
					description:
						"Catch, group, and fix errors before your users notice. Stack traces, user impact, release tracking, and instant alerts.",
					url: "https://www.databuddy.cc/errors",
				}}
			/>
			<div className="overflow-x-hidden">
				<FeatureHero
					docsHref="/docs"
					primaryLabel="Start Monitoring"
					subtitle="Every error tied to the session, the page, and the funnel step where it happened."
					title="Understand what your errors are costing users."
				/>

				<Section className="border-border border-b" id="impact">
					<div className={container}>
						<SectionHeader
							subtitle="See affected user counts, per-page error rates, and track progress post-fixes all in one place."
							title="Prioritize by"
							titleMuted="real impact."
						/>

						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Find the one page generating all the errors.
								</h3>
								<ErrorPerPageBreakdownDemo />
							</GridCell>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Know about errors before your users report them.
								</h3>
								<ErrorAutoCaptureAlertsStackDemo />
							</GridCell>
						</TwoColumnGrid>

						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									An error hitting 500 users matters more than one hitting 1 user
									500 times.
								</h3>
								<ErrorImpactTableArtifact />
							</GridCell>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									See when the error stops hitting users.
								</h3>
								<ErrorFrequencyChartDemo />
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
