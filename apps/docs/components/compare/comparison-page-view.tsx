import { ArrowRightIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { FaqSection } from "@/components/compare/faq-section";
import { FeatureTable } from "@/components/compare/feature-table";
import { MigrationCtaSection } from "@/components/compare/migration-cta-section";
import { PricingSection } from "@/components/compare/pricing-section";
import { SocialProof } from "@/components/compare/social-proof";
import { StatsCards } from "@/components/compare/stats-cards";
import { SciFiButton } from "@/components/landing/scifi-btn";
import Section from "@/components/landing/section";
import { Spotlight } from "@/components/landing/spotlight";
import { StructuredData } from "@/components/structured-data";
import type {
	ComparisonFeature,
	CompetitorInfo,
	FaqItem,
	MigrationSection,
	PricingTier,
} from "@/lib/comparison-config";

export interface ComparisonBreadcrumbItem {
	name: string;
	url: string;
}

interface ComparisonPageViewProps {
	breadcrumbTrail: ComparisonBreadcrumbItem[];
	competitor: CompetitorInfo;
	faqs: FaqItem[];
	featureSectionSubtitle?: string;
	features: ComparisonFeature[];
	featuresWin: number;
	heroCta: string;
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
	breadcrumbTrail,
	heroHeading,
	heroDescription,
	introText,
	competitor,
	features,
	featuresWin,
	faqs,
	pricingTiers,
	migrationSection,
	heroCta,
	featureSectionSubtitle,
}: ComparisonPageViewProps) {
	const breadcrumbSchema = {
		"@context": "https://schema.org",
		"@type": "BreadcrumbList",
		itemListElement: breadcrumbTrail.map((item, index) => ({
			"@type": "ListItem",
			position: index + 1,
			name: item.name,
			item: item.url,
		})),
	};

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
			<script
				dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
				type="application/ld+json"
			/>
			<Spotlight transform="translateX(-60%) translateY(-50%)" />

			<div className="container mx-auto px-4 pt-8">
				<div className="flex flex-wrap items-center gap-2 text-muted-foreground text-sm">
					{breadcrumbTrail.map((item, index) => {
						const isLast = index === breadcrumbTrail.length - 1;
						return (
							<Fragment key={item.url}>
								{index > 0 ? <span>/</span> : null}
								{isLast ? (
									<span className="text-foreground">{item.name}</span>
								) : (
									<Link
										className="transition-colors hover:text-foreground"
										href={item.url}
									>
										{item.name}
									</Link>
								)}
							</Fragment>
						);
					})}
				</div>
			</div>

			<Section className="overflow-hidden" customPaddings id="comparison-hero">
				<section className="relative w-full pt-12 pb-12 sm:pt-16 sm:pb-16 lg:pt-20 lg:pb-20">
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
				</section>
			</Section>

			<Section
				className="border-border border-t border-b bg-background/50"
				id="features-comparison"
			>
				<div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
					<div className="mb-8 text-center">
						<h2 className="mb-2 font-semibold text-2xl sm:text-3xl">
							Feature <span className="text-muted-foreground">comparison</span>
						</h2>
						<p className="text-muted-foreground text-sm sm:text-base">
							{featureSectionSubtitle ?? defaultSubtitle}
						</p>
					</div>

					<FeatureTable competitorName={competitor.name} features={features} />

					<p className="mt-4 text-center text-muted-foreground text-xs">
						All Databuddy features available on the free plan — up to 10,000
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
				<Section className="border-border border-t bg-background/50" id="faq">
					<div className="mx-auto w-full max-w-3xl px-4 sm:px-6 lg:px-8">
						<FaqSection competitorName={competitor.name} faqs={faqs} />
					</div>
				</Section>
			) : null}

			<Section className="bg-background/30" id="final-cta">
				<div className="mx-auto w-full max-w-3xl px-4 text-center sm:px-6 lg:px-8">
					<SocialProof />

					{/* biome-ignore lint/nursery/useSortedClasses: preserve compare page CTA heading order */}
					<h3 className="mt-8 mb-3 text-balance font-semibold text-xl text-foreground sm:text-2xl">
						{heroCta}
					</h3>
					<p className="mb-6 text-pretty text-muted-foreground">
						Start with 10K pageviews free. No credit card required.
					</p>
					<div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
						<SciFiButton asChild className="w-full sm:w-auto">
							<Link
								href="https://app.databuddy.cc/login"
								rel="noopener noreferrer"
								target="_blank"
							>
								Start Free — No Credit Card
							</Link>
						</SciFiButton>
						<Link
							className="group inline-flex items-center justify-center gap-2 rounded border border-border bg-foreground/5 px-5 py-2 font-medium text-foreground text-sm backdrop-blur-sm transition-colors hover:bg-foreground/10 active:scale-[0.98]"
							href="/demo"
						>
							View Live Demo
							<ArrowRightIcon
								className="size-3.5 transition-transform group-hover:translate-x-0.5"
								weight="fill"
							/>
						</Link>
					</div>
				</div>
			</Section>
		</div>
	);
}
