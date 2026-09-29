import {
	GATED_FEATURES,
	PLAN_FEATURE_LIMITS,
	PLAN_IDS,
} from "@databuddy/shared/types/features";
import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import {
	FeatureHero,
	FeatureRow,
	FeatureSection,
} from "@/components/landing/demo-primitives";
import { FaqSection } from "@/components/landing/faq-section";
import {
	DependentFlags,
	KillSwitch,
	RolloutGrid,
	TeamRollout,
	WhoSeesIt,
} from "@/components/landing/flag-demo-visuals";
import { StructuredData } from "@/components/structured-data";
import { TrackOnMount } from "@/components/track-on-mount";

const TITLE = "Feature Flags With Analytics Built In";
const DESCRIPTION =
	"Roll out by percentage, user, or company, switch features off from the dashboard, and see who got each flag, in the same SDK as your analytics.";

export const metadata: Metadata = {
	title: TITLE,
	description: DESCRIPTION,
	alternates: {
		canonical: "https://www.databuddy.cc/feature-flags",
	},
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: "https://www.databuddy.cc/feature-flags",
		images: ["/og-image.png"],
	},
};

const flagLimit = (plan: (typeof PLAN_IDS)[keyof typeof PLAN_IDS]) =>
	PLAN_FEATURE_LIMITS[plan][GATED_FEATURES.FEATURE_FLAGS];

const FAQ_ITEMS = [
	{
		question: "How fast does a change reach people?",
		answer:
			"On their browser's next refresh, usually within a minute. No deploy.",
	},
	{
		question: "Does the same person always get the same answer?",
		answer: "Yes, as long as their ID stays the same.",
	},
	{
		question: "Can I run A/B tests?",
		answer:
			"You can split people across weighted variants. A results view isn't built in yet.",
	},
	{
		question: "Can I find flags nobody uses?",
		answer:
			"Yes. Each flag shows when it was last seen and roughly how many people it reached.",
	},
	{
		question: "Is it open source?",
		answer:
			"Yes. Databuddy is open source under AGPL, so you can read the code or run it on your own servers.",
	},
	{
		question: "Are flag checks billed?",
		answer:
			"No. Each page load logs a flag once so you can see who got it, and that log counts as one event.",
	},
] as const;

export default function FeatureFlagsPage() {
	return (
		<>
			<TrackOnMount
				event="feature_landing_viewed"
				properties={{ feature: "flags" }}
			/>
			<StructuredData
				elements={[{ type: "faq", items: [...FAQ_ITEMS] }]}
				page={{
					title: TITLE,
					description: DESCRIPTION,
					url: "https://www.databuddy.cc/feature-flags",
				}}
			/>
			<div className="overflow-x-hidden">
				<FeatureHero
					docsHref="/docs/sdk/feature-flags"
					footnote={`${flagLimit(PLAN_IDS.FREE)} flags free.`}
					primaryLabel="Create your first flag"
					secondaryLabel="Read the docs"
					subtitle="Start with a small group, widen the rollout once it holds up, and switch it off without a deploy if it breaks. It runs on the same SDK as your analytics."
					title="Ship new features to a few people first."
					visual={<RolloutGrid />}
				/>

				<FeatureRow
					body="Flip the switch and browsers drop the feature on their next refresh, with no deploy."
					id="off"
					title="Kill a bad release from the dashboard."
					visual={<KillSwitch />}
				/>

				<FeatureRow
					body="Roll out by organization, so everyone at the same company sees the same thing."
					id="teams"
					flip
					title="Give a customer's whole team the feature at once."
					visual={<TeamRollout />}
				/>

				<FeatureRow
					body="Target by email, plan, or any property you send, and reuse the same group on every flag."
					id="targeting"
					title="Give beta testers early access."
					visual={<WhoSeesIt />}
				/>

				<FeatureRow
					body="Make smaller flags depend on a parent, and switching the parent off takes them all down together."
					flip
					id="dependencies"
					title="Turn off a whole feature with one switch."
					visual={<DependentFlags />}
				/>

				<FeatureSection id="faq">
					<FaqSection items={[...FAQ_ITEMS]} />
				</FeatureSection>

				<Footer />
			</div>
		</>
	);
}
