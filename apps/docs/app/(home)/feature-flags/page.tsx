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
import { FFAbTestingDemo } from "@/components/landing/ff-ab-testing-demo";
import { FFCompactFlagsDashboardDemo } from "@/components/landing/ff-compact-flags-dashboard-demo";
import { FFInstantRolloutsDemo } from "@/components/landing/ff-instant-rollouts-demo";
import { FFPercentageRolloutsDemo } from "@/components/landing/ff-percentage-rollouts-demo";
import { FFTemplatesMiniGridDemo } from "@/components/landing/ff-templates-mini-grid-demo";
import { FFUserTargetingDemo } from "@/components/landing/ff-user-targeting-demo";
import { MidPageCta } from "@/components/landing/mid-page-cta";
import Section from "@/components/landing/section";
import { StructuredData } from "@/components/structured-data";

export const metadata: Metadata = {
	title: "Feature Flags & A/B Testing - Built Into Your Analytics",
	description:
		"Ship features safely with instant rollouts, percentage-based releases, A/B testing, and user targeting. No deploys needed. Built into your analytics dashboard.",
	alternates: {
		canonical: "https://www.databuddy.cc/feature-flags",
	},
	openGraph: {
		title: "Feature Flags & A/B Testing - Built Into Your Analytics",
		description:
			"Ship features safely with instant rollouts, percentage-based releases, A/B testing, and user targeting. No deploys needed. Built into your analytics dashboard.",
		url: "https://www.databuddy.cc/feature-flags",
		images: ["/og-image.png"],
	},
};

const FAQ_ITEMS = [
	{
		question: "Will feature flags slow down my app?",
		answer:
			"No. Flags are cached locally with request batching, so after the first load your users never see a delay. There is no separate SDK to ship either; flags ride in the same script as your analytics.",
	},
	{
		question: "Can I roll out a feature to just one team or customer first?",
		answer:
			"Yes. Target specific users by ID, email, or any property you pass, and bucket percentage rollouts by user, organization, or team so a whole workspace flips together.",
	},
	{
		question: "What happens if something goes wrong after a release?",
		answer:
			"One click and the feature is off - no deploy, no rollback, no downtime. Server caches are purged instantly and clients pick up the change within about a minute.",
	},
	{
		question: "Can I run A/B tests to see which version performs better?",
		answer:
			"Yes. Create multiple variants, split traffic by weight, and each user consistently sees the same variant across sessions. Every evaluation is tracked with its variant, so you can segment any metric by variant in your analytics.",
	},
	{
		question: "Are feature flags included in all plans?",
		answer:
			"Every plan includes feature flags - the free plan gives you 3 flags to start, and paid plans scale from there. Flag evaluations never count toward your event quota.",
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
					title: "Feature Flags & A/B Testing",
					description:
						"Ship features safely with instant rollouts, percentage-based releases, A/B testing, and user targeting.",
					url: "https://www.databuddy.cc/feature-flags",
				}}
			/>
			<div className="overflow-x-hidden">
				<FeatureHero
					docsHref="/docs/sdk/feature-flags"
					footnote="3 flags free. Evaluations never count toward your event quota."
					subtitle="Boolean toggles, percentage rollouts, and A/B experiments in the same script as your analytics. No second SDK, no second vendor, no deploys to flip a flag."
					title="Feature flags, minus the second SDK."
				/>

				<Section className="border-border border-b" id="how-it-works">
					<div className={container}>
						<SectionHeader
							subtitle="Create a flag, set your rules, and ship. Changes reach clients without a deploy. No redeploys, no CI pipeline, no waiting."
							title="One dashboard,"
							titleMuted="zero deploys."
						/>

						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Every flag, with a full audit trail of changes.
								</h3>
								<FFCompactFlagsDashboardDemo />
							</GridCell>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Start from a template or build from scratch.
								</h3>
								<FFTemplatesMiniGridDemo />
							</GridCell>
						</TwoColumnGrid>
					</div>
				</Section>

				<Section className="border-border border-b" id="capabilities">
					<div className={container}>
						<SectionHeader
							subtitle="Kill switches, gradual ramps, flag dependencies, and reusable target groups. Every change is logged with who made it and what it was before."
							title="From kill switch"
							titleMuted="to experiment."
						/>

						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Toggle any feature on or off without deploying.
								</h3>
								<FFInstantRolloutsDemo />
							</GridCell>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Ramp up gradually. Roll back instantly.
								</h3>
								<FFPercentageRolloutsDemo />
							</GridCell>
						</TwoColumnGrid>

						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Same user, same variant, every session.
								</h3>
								<FFAbTestingDemo />
							</GridCell>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Target by user ID, email, or any property.
								</h3>
								<FFUserTargetingDemo />
							</GridCell>
						</TwoColumnGrid>
					</div>
				</Section>

				<Section className="border-border border-b" id="faq">
					<div className={container}>
						<FaqSection items={[...FAQ_ITEMS]} />
					</div>
				</Section>

				<Section className="border-border border-b" id="cta">
					<div className={container}>
						<MidPageCta />
					</div>
				</Section>

				<Footer />
			</div>
		</>
	);
}
