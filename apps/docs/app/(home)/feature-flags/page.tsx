import {
	GATED_FEATURES,
	PLAN_FEATURE_LIMITS,
	PLAN_IDS,
} from "@databuddy/shared/types/features";
import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { FeatureHero, FeatureRow } from "@/components/landing/demo-primitives";
import { SECTION_SPACING } from "@/components/landing/demo-constants";
import { FaqSection } from "@/components/landing/faq-section";
import {
	DependentFlags,
	KillSwitch,
	RolloutGrid,
	TeamRollout,
	WhoSeesIt,
} from "@/components/landing/flag-demo-visuals";
import Section from "@/components/landing/section";
import { StructuredData } from "@/components/structured-data";
import { cn } from "@/lib/utils";
import { TrackOnMount } from "@/components/track-on-mount";

const TITLE = "Feature Flags, Built Into Your Analytics";
const DESCRIPTION =
	"Roll out features to a few people first, flip whole teams at once, and turn anything off without a deploy. Pay per flag, not per check.";

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
		question: "Are flag checks billed?",
		answer:
			"No. Each browser logs a flag once so you can see who got it, and that log counts as one event.",
	},
] as const;

const container = "mx-auto w-full max-w-400 px-4 sm:px-14 lg:px-20";

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
					subtitle="Roll out features slowly, flip whole teams at once, and turn anything off without a deploy. Same SDK and dashboard as your analytics."
					title="Turn it on for a few people first."
					visual={<RolloutGrid />}
				/>

				<FeatureRow
					body="Flip the switch in the dashboard. Browsers pick it up on their next refresh."
					id="off"
					title="Turn it off without a deploy."
					visual={<KillSwitch />}
				/>

				<FeatureRow
					body="Bucket by organization or team, and everyone on that team gets the feature together."
					id="teams"
					flip
					title="Flip a whole team at once."
					visual={<TeamRollout />}
				/>

				<FeatureRow
					body="Target by user ID, email, or any property you send. Save a set of rules as a group and reuse it."
					id="targeting"
					title="Pick who sees it."
					visual={<WhoSeesIt />}
				/>

				<FeatureRow
					body="Turn off the parent, and the flags that depend on it turn off too. Turn it back on, and they come back."
					flip
					id="dependencies"
					title="Flags can depend on other flags."
					visual={<DependentFlags />}
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
