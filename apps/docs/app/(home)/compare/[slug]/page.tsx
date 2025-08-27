import { ArrowLeftIcon, CheckIcon, XIcon } from '@phosphor-icons/react/ssr';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SciFiButton } from '@/components/landing/scifi-btn';
import Section from '@/components/landing/section';
import { Spotlight } from '@/components/landing/spotlight';
import { SciFiCard } from '@/components/scifi-card';
import { StructuredData } from '@/components/structured-data';
import { Badge } from '@/components/ui/badge';
import type {
	ComparisonFeature,
	CompetitorInfo,
} from '@/lib/comparison-config';
import {
	getAllCompetitorSlugs,
	getComparisonData,
} from '@/lib/comparison-config';

interface PageProps {
	params: Promise<{
		slug: string;
	}>;
}

export function generateStaticParams() {
	const slugs = getAllCompetitorSlugs();
	return slugs.map((slug) => ({
		slug,
	}));
}

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { slug } = await params;
	const data = getComparisonData(slug);

	if (!data) {
		return {
			title: 'Comparison Not Found | Databuddy',
		};
	}

	return {
		title: data.seo.title,
		description: data.seo.description,
		openGraph: {
			title: data.seo.title,
			description: data.seo.description,
			url: `https://www.databuddy.cc/compare/${slug}`,
			siteName: 'Databuddy',
			type: 'website',
			images: ['/og-image.png'],
		},
		twitter: {
			card: 'summary_large_image',
			title: data.seo.title,
			description: data.seo.description,
			images: ['/og-image.png'],
		},
		alternates: {
			canonical: `https://www.databuddy.cc/compare/${slug}`,
		},
	};
}

function CompetitorStatsCard({
	competitor,
	featuresWin,
	totalFeatures,
}: {
	competitor: CompetitorInfo;
	featuresWin: number;
	totalFeatures: number;
}) {
	return (
		<div className="grid gap-6 md:grid-cols-2">
			{/* Databuddy Card */}
			<SciFiCard>
				<div className="relative h-full rounded border border-border bg-card/50 p-6 backdrop-blur-sm">
					<div className="mb-4 flex items-center justify-between">
						<div>
							<h3 className="mb-2 font-bold text-2xl text-primary">
								Databuddy
							</h3>
							<p className="text-muted-foreground text-sm">
								Privacy-first analytics with AI insights
							</p>
						</div>
						<Badge className="bg-primary text-primary-foreground">
							Recommended
						</Badge>
					</div>

					<div className="mb-6 space-y-3">
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground text-sm">
								Starting price
							</span>
							<span className="font-bold text-lg text-primary">Free</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground text-sm">Up to</span>
							<span className="font-medium text-sm">10K pageviews</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground text-sm">Advantages</span>
							<Badge
								className="border-primary/20 bg-primary/10 text-primary"
								variant="outline"
							>
								{featuresWin}/{totalFeatures}
							</Badge>
						</div>
					</div>

					<SciFiButton asChild className="w-full">
						<Link
							href="https://app.databuddy.cc/login"
							rel="noopener noreferrer"
							target="_blank"
						>
							START FREE TRIAL
						</Link>
					</SciFiButton>
				</div>
			</SciFiCard>

			{/* Competitor Card */}
			<SciFiCard>
				<div className="relative h-full rounded border border-border bg-card/50 p-6 backdrop-blur-sm">
					<div className="mb-4 flex items-center justify-between">
						<div>
							<h3
								className="mb-2 font-bold text-2xl"
								style={{ color: competitor.color }}
							>
								{competitor.name}
							</h3>
							<p className="text-muted-foreground text-sm">
								{competitor.tagline}
							</p>
						</div>
						<div
							className="flex h-12 w-12 items-center justify-center rounded-full font-bold text-white"
							style={{ backgroundColor: competitor.color }}
						>
							{competitor.name.charAt(0)}
						</div>
					</div>

					<div className="mb-6 space-y-3">
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground text-sm">
								Starting price
							</span>
							<span
								className="font-bold text-lg"
								style={{ color: competitor.color }}
							>
								{competitor.pricing.starting}
							</span>
						</div>
						{competitor.pricing.note && (
							<div className="text-muted-foreground text-xs">
								{competitor.pricing.note}
							</div>
						)}
					</div>

					<Link
						className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded border border-border bg-foreground/5 px-4 py-2 font-medium text-foreground text-sm backdrop-blur-sm transition-all hover:bg-foreground/10 active:scale-[0.98]"
						href={competitor.website}
						rel="noopener"
						target="_blank"
					>
						Visit {competitor.name}
						<ArrowLeftIcon
							className="h-4 w-4 rotate-45 transition-transform group-hover:rotate-90"
							weight="fill"
						/>
					</Link>
				</div>
			</SciFiCard>
		</div>
	);
}

const FeatureRow = ({
	feature,
	competitorName,
}: {
	feature: ComparisonFeature;
	competitorName: string;
}) => (
	<div className="border-border/50 border-b transition-colors last:border-b-0 hover:bg-muted/30">
		{/* Desktop layout */}
		<div className="hidden grid-cols-4 gap-4 p-6 md:grid">
			<div className="font-medium text-foreground text-sm">{feature.name}</div>
			<div className="flex justify-center">
				{feature.databuddy ? (
					<CheckIcon className="h-5 w-5 text-primary" weight="bold" />
				) : (
					<XIcon className="h-5 w-5 text-muted-foreground" weight="bold" />
				)}
			</div>
			<div className="flex justify-center">
				{feature.competitor ? (
					<CheckIcon className="h-5 w-5 text-muted-foreground" weight="bold" />
				) : (
					<XIcon className="h-5 w-5 text-muted-foreground" weight="bold" />
				)}
			</div>
			<div className="text-muted-foreground text-sm">{feature.benefit}</div>
		</div>

		{/* Mobile layout */}
		<div className="space-y-3 p-6 md:hidden">
			<div className="flex items-start justify-between">
				<div className="flex-1 pr-4 font-medium text-foreground text-sm">
					{feature.name}
				</div>
				<div className="flex items-center gap-2">
					<span className="font-medium text-primary text-xs">Databuddy</span>
					{feature.databuddy ? (
						<CheckIcon className="h-5 w-5 text-primary" weight="bold" />
					) : (
						<XIcon className="h-5 w-5 text-muted-foreground" weight="bold" />
					)}
				</div>
			</div>

			<div className="text-muted-foreground text-sm leading-relaxed">
				{feature.benefit}
			</div>

			<div className="flex items-center justify-between pt-2">
				<div className="flex items-center gap-2">
					<span className="text-muted-foreground text-xs">
						{competitorName}
					</span>
					{feature.competitor ? (
						<CheckIcon
							className="h-5 w-5 text-muted-foreground"
							weight="bold"
						/>
					) : (
						<XIcon className="h-5 w-5 text-muted-foreground" weight="bold" />
					)}
				</div>
			</div>
		</div>
	</div>
);

export default async function ComparisonPage({ params }: PageProps) {
	const { slug } = await params;
	const data = getComparisonData(slug);

	if (!data) {
		notFound();
	}

	const { competitor, features, hero, seo } = data;

	// Features in priority order
	const sortedFeatures = features;

	const featuresWin = features.filter(
		(f) => f.databuddy && !f.competitor
	).length;
	const totalFeatures = features.length;

	return (
		<div className="overflow-hidden">
			<StructuredData
				page={{
					title: seo.title,
					description: seo.description,
					url: `https://www.databuddy.cc/compare/${slug}`,
				}}
			/>
			<Spotlight transform="translateX(-60%) translateY(-50%)" />

			{/* Navigation */}
			<div className="container mx-auto px-4 pt-8">
				<div className="flex items-center justify-between">
					<Link
						className="group relative inline-flex items-center gap-2 overflow-hidden rounded border border-border bg-foreground/5 px-4 py-2 font-medium text-foreground text-sm backdrop-blur-sm transition-all hover:bg-foreground/10 active:scale-[0.98]"
						href="/compare"
					>
						<ArrowLeftIcon
							className="group-hover:-translate-x-0.5 h-4 w-4 transition-transform"
							weight="fill"
						/>
						<span>Back to Comparisons</span>
					</Link>

					<Link
						className="group relative inline-flex items-center gap-2 overflow-hidden rounded border border-border bg-foreground/5 px-4 py-2 font-medium text-foreground text-sm backdrop-blur-sm transition-all hover:bg-foreground/10 active:scale-[0.98]"
						href="/"
					>
						<span>Home</span>
					</Link>
				</div>
			</div>

			{/* Hero Section */}
			<Section className="overflow-hidden" customPaddings id="comparison-hero">
				<section className="relative w-full pt-16 pb-16 sm:pt-20 sm:pb-20 lg:pt-24 lg:pb-24">
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
						<div className="mb-12 text-center">
							<h1 className="mb-4 font-semibold text-3xl leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-[72px]">
								<span className="block">
									{hero.title.split(' vs ')[0]}{' '}
									<span className="text-muted-foreground">vs</span>
								</span>
								<span className="block">
									<span className="text-muted-foreground">
										{hero.title.split(' vs ')[1]}
									</span>
								</span>
							</h1>
							<p className="mx-auto mb-8 max-w-3xl text-balance font-medium text-muted-foreground text-sm leading-relaxed tracking-tight sm:text-base lg:text-lg">
								{hero.description}
							</p>
						</div>

						{/* Competitor Stats Cards */}
						<CompetitorStatsCard
							competitor={competitor}
							featuresWin={featuresWin}
							totalFeatures={totalFeatures}
						/>
					</div>
				</section>
			</Section>

			{/* Features Comparison Section */}
			<Section
				className="border-border border-t border-b bg-background/50"
				id="features-comparison"
			>
				<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
					<div className="mb-12 text-center">
						<h2 className="mb-4 font-semibold text-2xl sm:text-3xl lg:text-4xl">
							Feature <span className="text-muted-foreground">Comparison</span>
						</h2>
						<p className="mx-auto max-w-2xl text-muted-foreground text-sm sm:text-base lg:text-lg">
							See how Databuddy compares to {competitor.name} across all key
							features
						</p>
					</div>

					<div className="overflow-hidden rounded border border-border bg-card/30 backdrop-blur-sm">
						{/* Desktop table header */}
						<div className="hidden grid-cols-4 gap-4 border-border border-b bg-muted/50 p-6 md:grid">
							<div className="font-semibold text-foreground text-sm">
								Feature
							</div>
							<div className="text-center font-semibold text-primary text-sm">
								Databuddy
							</div>
							<div className="text-center font-semibold text-muted-foreground text-sm">
								{competitor.name}
							</div>
							<div className="font-semibold text-foreground text-sm">
								Why It Matters
							</div>
						</div>

						{/* Mobile header */}
						<div className="border-border border-b bg-muted/50 p-6 md:hidden">
							<div className="text-center font-semibold text-primary text-sm">
								Databuddy vs {competitor.name}
							</div>
						</div>

						{/* Features comparison */}
						{sortedFeatures.map((feature) => (
							<FeatureRow
								competitorName={competitor.name}
								feature={feature}
								key={feature.name}
							/>
						))}
					</div>

					<div className="mt-6 text-center">
						<p className="text-muted-foreground text-xs">
							All Databuddy features available on our free plan with up to
							10,000 monthly pageviews
						</p>
					</div>
				</div>
			</Section>

			{/* Final CTA Section */}
			<Section className="bg-background/30" id="final-cta">
				<div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
					<div className="text-center">
						<h3 className="mb-4 font-bold text-2xl text-foreground sm:text-3xl">
							{hero.cta}
						</h3>
						<p className="mb-8 text-lg text-muted-foreground">
							Join thousands of websites that have already made the switch to
							privacy-first analytics
						</p>
						<div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
							<SciFiButton asChild className="w-full sm:w-auto">
								<Link
									href="https://app.databuddy.cc/login"
									rel="noopener noreferrer"
									target="_blank"
								>
									START FREE TRIAL
								</Link>
							</SciFiButton>
							<Link
								className="group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded border border-border bg-foreground/5 px-6 py-3 font-medium text-foreground backdrop-blur-sm transition-all hover:bg-foreground/10 active:scale-[0.98]"
								href="/demo"
							>
								View Live Demo
								<ArrowLeftIcon
									className="h-4 w-4 rotate-180 transition-transform group-hover:translate-x-1"
									weight="fill"
								/>
							</Link>
						</div>
					</div>
				</div>
			</Section>

			{/* Gradient Divider */}
			<div className="w-full">
				<div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-border/30 to-transparent" />
			</div>
		</div>
	);
}
