import type { Metadata } from "next";
import { Footer } from "@/components/footer";
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
import Section from "@/components/landing/section";
import { StructuredData } from "@/components/structured-data";

export const metadata: Metadata = {
	title: "Feature Flags & A/B Testing",
	description:
		"Ship features safely with instant rollouts, percentage-based releases, A/B testing, and user targeting. No deploys needed - control everything from your dashboard.",
	alternates: {
		canonical: "https://www.databuddy.cc/feature-flags",
	},
	openGraph: {
		title: "Feature Flags & A/B Testing",
		description:
			"Ship features safely with instant rollouts, percentage-based releases, A/B testing, and user targeting. No deploys needed - control everything from your dashboard.",
		url: "https://www.databuddy.cc/feature-flags",
		images: ["/og-image.png"],
	},
};

const FAQ_ITEMS = [
	{
		question: "Will feature flags slow down my app?",
		answer:
			"No. Flags load once and are cached locally, so your users never see a delay. Pages render just as fast with flags as without - there's no visible performance impact.",
	},
	{
		question: "Can I roll out a feature to just one team or customer first?",
		answer:
			"Yes. You can release to specific users, entire organizations, or teams before opening it up to everyone. This means you can validate with your biggest customer before a wider launch.",
	},
	{
		question: "What happens if something goes wrong after a release?",
		answer:
			"One click and the feature is off - no deploy, no rollback, no downtime. Your users see the previous experience immediately while you fix the issue.",
	},
	{
		question: "Can I run A/B tests to see which version performs better?",
		answer:
			"Yes. Create multiple variants, split traffic by percentage, and each user consistently sees the same version across sessions. You can measure which variant drives better outcomes and scale the winner.",
	},
	{
		question: "Are feature flags included in all plans?",
		answer:
			"Every plan includes feature flags - the free plan gives you 3 flags to start, and paid plans scale from there. No add-ons or hidden costs.",
	},
] as const;

const container = "mx-auto w-full max-w-400 px-4 sm:px-14 lg:px-20";

export default function FeatureFlagsPage() {
	return (
		<>
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
					subtitle="Boolean toggles, percentage rollouts, and A/B experiments - controlled from your dashboard, no deploys needed. Built into Databuddy."
					title="Ship features safely and roll back in one click."
				/>

				<Section className="border-border border-b" id="how-it-works">
					<div className={container}>
						<SectionHeader
							subtitle="Create a flag, set your rules, and ship. Changes take effect immediately. No code changes, no CI pipeline, no waiting."
							title="One dashboard,"
							titleMuted="zero deploys."
						/>

						<TwoColumnGrid>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>Every flag, one place.</h3>
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
							subtitle="From kill switches to multivariant experiments, everything you need to ship with confidence."
							title="Deploy once,"
							titleMuted="control everything."
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
									Run experiments with consistent assignments.
								</h3>
								<FFAbTestingDemo />
							</GridCell>
							<GridCell>
								<h3 className={CELL_TITLE_CLASS}>
									Target by user, team, plan, or any property.
								</h3>
								<FFUserTargetingDemo />
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
