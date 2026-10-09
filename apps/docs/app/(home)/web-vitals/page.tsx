import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import {
	FeatureHero,
	FeatureRow,
	FeatureSection,
} from "@/components/landing/demo-primitives";
import { FaqSection } from "@/components/landing/faq-section";
import {
	ExperienceScore,
	PageBreakdown,
	SetupSignals,
	SlowdownFinding,
	VisitSpread,
} from "@/components/landing/web-vitals-demo-visuals";
import { StructuredData } from "@/components/structured-data";
import { TrackOnMount } from "@/components/track-on-mount";

const TITLE = "Core Web Vitals monitoring from real users";
const DESCRIPTION =
	"Real user monitoring for LCP, INP, CLS, FCP, and TTFB, with p75 by page, browser, and country against the thresholds Google uses for search. On every plan.";

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: {
		canonical: "https://www.databuddy.cc/web-vitals",
	},
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: "https://www.databuddy.cc/web-vitals",
		images: ["/og-image.png"],
	},
};

const FAQ_ITEMS = [
	{
		question: "Is this lab data or real visits?",
		answer:
			"Real visits. The tracker runs Google's web-vitals library in your visitors' browsers, not a simulated test.",
	},
	{
		question: "Which metrics do you collect?",
		answer: "LCP, INP, CLS, FCP, and TTFB, plus frame rate.",
	},
	{
		question: "Why does PageSpeed Insights show no data for my site?",
		answer:
			"Google's field data only covers Chrome users on sites with enough traffic. Databuddy measures every visit to your site.",
	},
	{
		question: "Do Safari and Firefox report vitals?",
		answer:
			"Current versions report LCP, INP, FCP, and TTFB. CLS comes from Chromium browsers.",
	},
	{
		question: "Can I get alerts?",
		answer:
			"Not for fixed thresholds yet. On Business and Scale, Databunny flags pages whose LCP or INP got much worse than the week before.",
	},
	{
		question: "Which plans include it?",
		answer:
			"Every plan, including free. Each metric reading counts as one event.",
	},
] as const;

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
					title: TITLE,
					description: DESCRIPTION,
					url: "https://www.databuddy.cc/web-vitals",
				}}
			/>
			<div className="overflow-x-hidden">
				<FeatureHero
					docsHref="/docs/sdk/configuration"
					footnote="On every plan, including free."
					primaryLabel="Measure your pages"
					secondaryLabel="Read the setup docs"
					subtitle="Databuddy measures every real visit and grades your p75 against the thresholds Google uses for search, so you know which pages to fix first."
					title="Pass Core Web Vitals on real traffic."
					visual={<VisitSpread />}
				/>

				<FeatureRow
					body="The Real Experience Score rolls LCP, INP, CLS, and FCP into one number out of 100 and shows how it moved since the last period."
					id="score"
					title="Know at a glance when your site gets slower."
					visual={<ExperienceScore />}
				/>

				<FeatureSection
					id="pages"
					subtitle="Split your vitals by page, browser, or country, and fix the one that drags your score down."
					title="Find the page that's slowing you down."
				>
					<PageBreakdown />
				</FeatureSection>

				<FeatureRow
					body="On Business and Scale, Databunny flags pages that got much slower than the week before and checks whether visitors on slow loads browsed less."
					flip
					id="slowdowns"
					title="Catch slowdowns the week they ship."
					visual={<SlowdownFinding />}
				/>

				<FeatureRow
					body="Add data-track-web-vitals to the script you already have, or pass trackWebVitals to the Databuddy component."
					id="setup"
					title="Turn it on with one attribute."
					visual={<SetupSignals />}
				/>

				<FeatureSection id="faq">
					<FaqSection items={[...FAQ_ITEMS]} />
				</FeatureSection>

				<Footer />
			</div>
		</>
	);
}
