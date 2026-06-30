import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { TrackOnMount } from "@/components/track-on-mount";
import { CELL_TITLE_CLASS } from "@/components/landing/demo-constants";
import {
	FeatureHero,
	GridCell,
	SectionHeader,
	TwoColumnGrid,
} from "@/components/landing/demo-primitives";
import { FaqSection } from "@/components/landing/faq-section";
import Section from "@/components/landing/section";
import { WebVitalsAlertCycleDemo } from "@/components/landing/web-vitals-alert-cycle-demo";
import { WebVitalsBreakdownDemo } from "@/components/landing/web-vitals-breakdown-demo";
import { WebVitalsGraphsDemo } from "@/components/landing/web-vitals-graphs-demo";
import { WebVitalsPercentileCycleDemo } from "@/components/landing/web-vitals-percentile-cycle-demo";
import { WebVitalsTrendsSparklinesDemo } from "@/components/landing/web-vitals-trends-sparklines-demo";
import { StructuredData } from "@/components/structured-data";

export const metadata: Metadata = {
	title: "Core Web Vitals Monitoring - Real User Performance Analytics",
	description:
		"Monitor LCP, CLS, INP, FCP, and TTFB from real users in production. Percentile breakdowns by page, device, and country. Field data, not lab simulations. Built into your analytics.",
	alternates: {
		canonical: "https://www.databuddy.cc/web-vitals",
	},
	openGraph: {
		title: "Core Web Vitals Monitoring - Real User Performance Analytics",
		description:
			"Monitor LCP, CLS, INP, FCP, and TTFB from real users in production. Percentile breakdowns by page, device, and country. Field data, not lab simulations. Built into your analytics.",
		url: "https://www.databuddy.cc/web-vitals",
		images: ["/og-image.png"],
	},
};

const FAQ_ITEMS = [
	{
		question: "What is the difference between lab data and field data?",
		answer:
			"Lab data (like Lighthouse) runs in a controlled environment. Field data - what Databuddy collects - comes from real users on real devices and connections. Google uses field data for rankings, so field data is what matters.",
	},
	{
		question: "Which percentile does Google use to score my site?",
		answer:
			"Google scores your site at the 75th percentile, meaning 75% of your users need to have a Good experience. Databuddy shows p75 prominently so you always know where you stand.",
	},
	{
		question: "How does Databuddy measure INP?",
		answer:
			"Interaction to Next Paint is captured using the PerformanceObserver API, the same method used by Chrome. It measures responsiveness for all interactions - clicks, taps, and keyboard input.",
	},
	{
		question: "Can I see which specific pages are failing?",
		answer:
			"Yes. Vitals are tracked per URL, so you can see exactly which routes have poor LCP, high CLS, or slow INP. No more guessing which page is dragging down your overall score.",
	},
	{
		question: "Is web vitals monitoring included in all plans?",
		answer:
			"Web vitals are collected automatically on every plan - there's nothing to turn on. The free plan includes 7 days of history; paid plans extend that to 30 or 90 days.",
	},
] as const;

const container = "mx-auto w-full max-w-400 px-4 sm:px-14 lg:px-20";

export default function WebVitalsPage() {
	return (
		<>
			<TrackOnMount
				event="feature_landing_viewed"
				properties={{ feature: "vitals" }}
			/>
			<StructuredData
				elements={[{ type: "faq", items: [...FAQ_ITEMS] }]}
				page={{
					title: "Core Web Vitals Monitoring - Real User Performance Analytics",
					description:
						"Monitor LCP, CLS, INP, FCP, and TTFB from real users in production. Percentile breakdowns by page, device, and country.",
					url: "https://www.databuddy.cc/web-vitals",
				}}
			/>
			<div className="overflow-x-hidden">
				<FeatureHero
					docsHref="/docs/performance/core-web-vitals-guide"
					subtitle="LCP, INP, CLS, FCP, and TTFB from real users in production. Sliced by page, device, and country. No lab simulations."
					title="Core Web Vitals, tracked from real users."
				/>

				<Section className="border-border border-b" id="breakdown">
					<div className={container}>
						<SectionHeader
							subtitle="Every vital, sliced by page, device, and percentile, so you fix the right thing, not just the average."
							title="Every vital,"
							titleMuted="by page and device."
						/>

						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Every vital, measured from real users.
								</h3>
								<WebVitalsGraphsDemo />
							</GridCell>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Find out which environments are making users wait.
								</h3>
								<WebVitalsBreakdownDemo compact variant="browser" />
							</GridCell>
						</TwoColumnGrid>

						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Pinpoint the pages hurting your score before users notice.
								</h3>
								<WebVitalsBreakdownDemo compact />
							</GridCell>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Optimize for the threshold Google actually uses to rank you.
								</h3>
								<WebVitalsPercentileCycleDemo />
							</GridCell>
						</TwoColumnGrid>
					</div>
				</Section>

				<Section className="border-border border-b" id="monitoring">
					<div className={container}>
						<SectionHeader
							subtitle="Get alerted when a vital degrades. Track frequency over time to confirm your fix actually held."
							title="Alerts when"
							titleMuted="a metric degrades."
						/>

						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Know the moment something breaks.
								</h3>
								<WebVitalsAlertCycleDemo />
							</GridCell>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Confirm the fix actually held.
								</h3>
								<WebVitalsTrendsSparklinesDemo />
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
