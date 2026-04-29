import type { ReactNode } from "react";
import { FeatureTable } from "@/components/compare/feature-table";
import { MigrationCtaSection } from "@/components/compare/migration-cta-section";
import { PricingSection } from "@/components/compare/pricing-section";
import { StatsCards } from "@/components/compare/stats-cards";
import { Footer } from "@/components/footer";
import { FaqSection as SharedFaqSection } from "@/components/landing/faq-section";
import Section from "@/components/landing/section";
import { StructuredData } from "@/components/structured-data";
import type {
	ComparisonFeature,
	CompetitorInfo,
	FaqItem,
	MigrationSection,
	PricingTier,
} from "@/lib/comparison-config";

interface ComparisonPageViewProps {
	competitor: CompetitorInfo;
	faqs: FaqItem[];
	featureSectionSubtitle?: string;
	features: ComparisonFeature[];
	featuresWin: number;
	heroDescription: string;
	heroHeading: ReactNode;
	introText?: string;
	migrationSection?: MigrationSection;
	pageUrl: string;
	pricingTiers: PricingTier[];
	structuredDescription: string;
	structuredTitle: string;
}

export function ComparisonPageView({
	pageUrl,
	structuredTitle,
	structuredDescription,
	heroHeading,
	heroDescription,
	introText,
	competitor,
	features,
	featuresWin,
	faqs,
	pricingTiers,
	migrationSection,
	featureSectionSubtitle,
}: ComparisonPageViewProps) {
	const defaultSubtitle = `How Databuddy compares to ${competitor.name} across key features`;

	return (
		<div className="overflow-hidden">
			<StructuredData
				page={{
					title: structuredTitle,
					description: structuredDescription,
					url: pageUrl,
				}}
			/>

			<Section className="overflow-hidden" id="comparison-hero">
				<div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
					<div className="mb-10 text-center">
						<h1 className="mb-4 text-balance font-semibold text-3xl leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
							{heroHeading}
						</h1>
						<p className="mx-auto max-w-2xl text-balance text-muted-foreground text-sm leading-relaxed sm:text-base">
							{heroDescription}
						</p>
						{introText ? (
							<p className="mx-auto mt-5 max-w-2xl text-pretty text-muted-foreground text-sm leading-relaxed sm:text-base">
								{introText}
							</p>
						) : null}
					</div>

					<StatsCards
						competitor={competitor}
						featuresWin={featuresWin}
						totalFeatures={features.length}
					/>
				</div>
			</Section>

			<Section
				className="border-border border-t border-b bg-background/50"
				id="features-comparison"
			>
				<div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
					<div className="mb-8 text-center">
						<h2 className="mb-2 font-semibold text-2xl sm:text-3xl">
							Feature{" "}
							<span className="text-muted-foreground">comparison</span>
						</h2>
						<p className="text-muted-foreground text-sm sm:text-base">
							{featureSectionSubtitle ?? defaultSubtitle}
						</p>
					</div>

					<FeatureTable competitorName={competitor.name} features={features} />

					<p className="mt-4 text-center text-muted-foreground text-xs">
						All Databuddy features available on the free plan - up to 10,000
						monthly pageviews
					</p>

					{migrationSection ? (
						<div className="mt-10">
							<MigrationCtaSection
								guideHref={migrationSection.guideHref}
								guideLabel={migrationSection.guideLabel}
								heading={migrationSection.heading}
								steps={migrationSection.steps}
							/>
						</div>
					) : null}
				</div>
			</Section>

			{pricingTiers.length > 0 ? (
				<Section id="pricing-comparison">
					<div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
						<PricingSection
							competitorName={competitor.name}
							tiers={pricingTiers}
						/>
					</div>
				</Section>
			) : null}

			{faqs.length > 0 ? (
				<Section
					className="border-border border-t bg-background/50"
					id="faq"
				>
					<div className="mx-auto w-full max-w-400 px-4 sm:px-14 lg:px-20">
						<SharedFaqSection
							items={faqs.map((f) => ({
								question: f.question,
								answer: f.answer,
							}))}
							subtitle={`Common questions about Databuddy vs ${competitor.name}`}
						/>
					</div>
				</Section>
			) : null}

			<Footer />
		</div>
	);
}
