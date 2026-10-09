import type { ReactNode } from "react";
import { FeatureTable } from "@/components/compare/feature-table";
import { PricingSection } from "@/components/compare/pricing-section";
import { StatsCards } from "@/components/compare/stats-cards";
import { Footer } from "@/components/footer";
import { FaqSection as SharedFaqSection } from "@/components/landing/faq-section";
import Section from "@/components/landing/section";
import { type Breadcrumb, StructuredData } from "@/components/structured-data";
import { TrackOnMount } from "@/components/track-on-mount";
import type {
	ComparisonFeature,
	CompetitorInfo,
	FaqItem,
	ComparisonData,
	ComparisonVerdict,
	PricingTier,
} from "@/lib/comparison-config";

interface ComparisonPageViewProps {
	breadcrumbs: Breadcrumb[];
	competitor: CompetitorInfo;
	faqs: FaqItem[];
	features: ComparisonFeature[];
	heroDescription: string;
	heroHeading: ReactNode;
	pageUrl: string;
	pricingTiers: PricingTier[];
	reviewedAt: string;
	sources: ComparisonData["sources"];
	structuredDescription: string;
	structuredTitle: string;
	verdict: ComparisonVerdict;
}

const reviewedFormat = new Intl.DateTimeFormat("en-US", {
	month: "long",
	year: "numeric",
	timeZone: "UTC",
});

export function ComparisonPageView({
	breadcrumbs,
	pageUrl,
	structuredTitle,
	structuredDescription,
	heroHeading,
	heroDescription,
	competitor,
	features,
	faqs,
	pricingTiers,
	reviewedAt,
	sources,
	verdict,
}: ComparisonPageViewProps) {
	const defaultSubtitle = `How Databuddy compares to ${competitor.name} across key features`;
	const verdictColumns = [
		{ name: competitor.name, reasons: verdict.competitor },
		{ name: "Databuddy", reasons: verdict.databuddy },
	];

	return (
		<div className="overflow-hidden">
			<TrackOnMount
				event="comparison_viewed"
				properties={{ competitor: competitor.slug, page_type: "compare" }}
			/>
			<StructuredData
				elements={
					faqs.length
						? [
								{
									type: "faq",
									items: faqs,
								},
							]
						: undefined
				}
				page={{
					title: structuredTitle,
					description: structuredDescription,
					url: pageUrl,
					breadcrumbs,
					dateModified: reviewedAt,
				}}
			/>

			<Section className="overflow-hidden" id="comparison-hero">
				<div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
					<div className="mb-10 text-center">
						<h1 className="mb-4 text-balance font-semibold text-3xl leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
							{heroHeading}
						</h1>
						<p className="mx-auto max-w-2xl text-pretty text-muted-foreground text-sm leading-relaxed sm:text-base">
							{heroDescription}
						</p>
						<p className="mt-3 text-muted-foreground text-xs">
							Last reviewed{" "}
							<time dateTime={reviewedAt}>
								{reviewedFormat.format(new Date(reviewedAt))}
							</time>
						</p>
					</div>

					<StatsCards competitor={competitor} />
				</div>
			</Section>

			<Section className="border-border border-t" id="verdict">
				<div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
					<div className="mb-8 text-center">
						<h2 className="mb-2 font-semibold text-2xl sm:text-3xl">
							Which one <span className="text-muted-foreground">to pick</span>
						</h2>
						<p className="text-pretty text-muted-foreground text-sm sm:text-base">
							When {competitor.name} fits better, and when Databuddy does
						</p>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						{verdictColumns.map((column) => (
							<div
								className="rounded border border-border bg-card/50 p-5 backdrop-blur-sm"
								key={column.name}
							>
								<h3 className="mb-3 font-semibold text-foreground text-lg">
									Pick {column.name} if
								</h3>
								<ul className="list-disc space-y-2 pl-5 text-muted-foreground text-sm marker:text-border">
									{column.reasons.map((reason) => (
										<li className="text-pretty" key={reason}>
											{reason}
										</li>
									))}
								</ul>
							</div>
						))}
					</div>
				</div>
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
						<p className="text-pretty text-muted-foreground text-sm sm:text-base">
							{defaultSubtitle}
						</p>
					</div>

					<FeatureTable competitorName={competitor.name} features={features} />

					<p className="mt-4 text-center text-muted-foreground text-xs">
						The Free plan includes core analytics for up to 10,000 monthly
						events. Feature availability and limits vary by plan. Competitor
						details can change; confirm them on{" "}
						<a
							className="underline underline-offset-2"
							href={competitor.website}
							rel="noopener noreferrer"
							target="_blank"
						>
							{competitor.name}&apos;s website
						</a>
						.
					</p>

					<p className="mt-6 text-pretty text-center text-muted-foreground text-sm">
						To try Databuddy,{" "}
						<a className="underline" href="/docs/getting-started">
							add the tracker
						</a>{" "}
						alongside your current tool and verify the events you need before
						switching.
					</p>
					<div className="mt-6 text-muted-foreground text-sm">
						<p className="mb-2 text-pretty">
							Sources checked September 15, 2026:
						</p>
						<ul className="flex flex-wrap gap-x-4 gap-y-2">
							{sources.map((source) => (
								<li key={source.href}>
									<a
										className="underline underline-offset-2"
										href={source.href}
										target="_blank"
										rel="noopener noreferrer"
									>
										{source.label}
									</a>
								</li>
							))}
						</ul>
					</div>
				</div>
			</Section>

			{pricingTiers.length > 0 ? (
				<Section id="pricing-comparison">
					<div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8">
						<PricingSection
							competitorName={competitor.name}
							competitorWebsite={competitor.website}
							tiers={pricingTiers}
						/>
					</div>
				</Section>
			) : null}

			{faqs.length > 0 ? (
				<Section className="border-border border-t bg-background/50" id="faq">
					<div className="mx-auto w-full max-w-400 px-4 sm:px-14 lg:px-20">
						<SharedFaqSection
							items={faqs}
							subtitle={`Common questions about Databuddy vs ${competitor.name}`}
						/>
					</div>
				</Section>
			) : null}

			<Footer />
		</div>
	);
}
