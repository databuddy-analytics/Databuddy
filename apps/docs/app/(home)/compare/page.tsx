import { ArrowLeftIcon, CheckIcon } from '@phosphor-icons/react/ssr';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SciFiButton } from '@/components/landing/scifi-btn';
import Section from '@/components/landing/section';
import { Spotlight } from '@/components/landing/spotlight';
import { Badge } from '@/components/ui/badge';
import { competitors } from '@/lib/comparison-config';

export const metadata: Metadata = {
	title: 'Analytics Platform Comparisons | Databuddy',
	description:
		'Compare Databuddy with other analytics platforms. See why developers choose privacy-first analytics with better performance and data ownership.',
	openGraph: {
		title: 'Analytics Platform Comparisons | Databuddy',
		description:
			'Compare Databuddy with other analytics platforms. See why developers choose privacy-first analytics with better performance and data ownership.',
		url: 'https://www.databuddy.cc/compare',
		siteName: 'Databuddy',
		type: 'website',
	},
	twitter: {
		card: 'summary_large_image',
		title: 'Analytics Platform Comparisons | Databuddy',
		description:
			'Compare Databuddy with other analytics platforms. See why developers choose privacy-first analytics with better performance and data ownership.',
	},
	alternates: {
		canonical: 'https://www.databuddy.cc/compare',
	},
};

function CompetitorCard({
	slug,
	data,
}: {
	slug: string;
	data: (typeof competitors)[string];
}) {
	const { competitor } = data;
	const featuresWin = data.features.filter(
		(f) => f.databuddy && !f.competitor
	).length;
	const totalFeatures = data.features.length;

	return (
		<Link className="group block" href={`/compare/${slug}`}>
			<div className="relative h-full rounded border border-border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70 hover:shadow-lg">
				<div className="flex flex-col p-6">
					{/* Header */}
					<div className="mb-4 flex items-start justify-between">
						<div className="flex-1">
							<h3 className="mb-2 font-semibold text-foreground text-xl transition-colors group-hover:text-primary">
								vs {competitor.name}
							</h3>
							<p className="text-muted-foreground text-sm leading-relaxed">
								{competitor.tagline}
							</p>
						</div>
						<div
							className="flex h-12 w-12 items-center justify-center rounded-full font-bold text-lg text-white"
							style={{ backgroundColor: competitor.color }}
						>
							{competitor.name.charAt(0)}
						</div>
					</div>

					{/* Key Stats */}
					<div className="mb-4 space-y-3">
						<div className="flex items-center justify-between">
							<span className="text-muted-foreground text-sm">
								Databuddy advantages
							</span>
							<Badge
								className="border-primary/20 bg-primary/10 text-primary"
								variant="outline"
							>
								{featuresWin}/{totalFeatures} features
							</Badge>
						</div>

						<div className="flex items-center justify-between">
							<span className="text-muted-foreground text-sm">
								Their pricing
							</span>
							<span
								className="font-medium text-sm"
								style={{ color: competitor.color }}
							>
								{competitor.pricing.starting}
							</span>
						</div>

						<div className="flex items-center justify-between">
							<span className="text-muted-foreground text-sm">
								Databuddy pricing
							</span>
							<span className="font-bold text-primary text-sm">Free</span>
						</div>
					</div>

					{/* Top Features Preview */}
					<div className="mb-6">
						<h4 className="mb-3 font-medium text-foreground text-sm">
							Key Advantages:
						</h4>
						<div className="space-y-2">
							{data.features
								.filter((f) => f.databuddy && !f.competitor)
								.slice(0, 3)
								.map((feature) => (
									<div className="flex items-center gap-2" key={feature.name}>
										<CheckIcon
											className="h-4 w-4 flex-shrink-0 text-primary"
											weight="fill"
										/>
										<span className="text-muted-foreground text-xs leading-relaxed">
											{feature.name}
										</span>
									</div>
								))}
							{featuresWin > 3 && (
								<div className="flex items-center gap-2">
									<span className="text-primary text-xs">
										+{featuresWin - 3} more advantages
									</span>
								</div>
							)}
						</div>
					</div>

					{/* CTA */}
					<div className="mt-auto">
						<div className="rounded border border-border/50 bg-muted/20 p-3 text-center">
							<span className="font-medium text-foreground text-sm transition-colors group-hover:text-primary">
								View Full Comparison →
							</span>
						</div>
					</div>
				</div>

				{/* Sci-fi corners */}
				<div className="pointer-events-none absolute inset-0">
					<div className="absolute top-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-x-[1] absolute top-0 right-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-y-[1] absolute bottom-0 left-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
					<div className="-scale-[1] absolute right-0 bottom-0 h-2 w-2 group-hover:animate-[cornerGlitch_0.6s_ease-in-out]">
						<div className="absolute top-0 left-0.5 h-0.5 w-1.5 origin-left bg-foreground" />
						<div className="absolute top-0 left-0 h-2 w-0.5 origin-top bg-foreground" />
					</div>
				</div>
			</div>
		</Link>
	);
}

export default function ComparePage() {
	const competitorEntries = Object.entries(competitors);

	return (
		<div className="overflow-hidden">
			<Spotlight transform="translateX(-60%) translateY(-50%)" />

			{/* Navigation */}
			<div className="container mx-auto px-4 pt-8">
				<Link
					className="group relative inline-flex items-center gap-2 overflow-hidden rounded border border-border bg-foreground/5 px-4 py-2 font-medium text-foreground text-sm backdrop-blur-sm transition-all hover:bg-foreground/10 active:scale-[0.98]"
					href="/"
				>
					<ArrowLeftIcon
						className="group-hover:-translate-x-0.5 h-4 w-4 transition-transform"
						weight="fill"
					/>
					<span>Back to Home</span>
				</Link>
			</div>

			{/* Hero Section */}
			<Section className="overflow-hidden" customPaddings id="compare-hero">
				<section className="relative w-full pt-16 pb-16 sm:pt-20 sm:pb-20 lg:pt-24 lg:pb-24">
					<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
						<div className="text-center">
							<h1 className="mb-4 font-semibold text-3xl leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-[72px]">
								<span className="block">
									Compare{' '}
									<span className="text-muted-foreground">analytics</span>
								</span>
								<span className="block">
									<span className="text-muted-foreground">platforms</span>
								</span>
							</h1>
							<p className="mx-auto mb-8 max-w-3xl text-balance font-medium text-muted-foreground text-sm leading-relaxed tracking-tight sm:text-base lg:text-lg">
								See how Databuddy stacks up against other analytics platforms.
								Discover why developers choose privacy-first analytics with
								better performance.
							</p>
						</div>
					</div>
				</section>
			</Section>

			{/* Competitors Grid Section */}
			<Section
				className="border-border border-t border-b bg-background/50"
				id="competitors-grid"
			>
				<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
					<div className="mb-12 text-center">
						<h2 className="mb-4 font-semibold text-2xl sm:text-3xl lg:text-4xl">
							Choose Your{' '}
							<span className="text-muted-foreground">Comparison</span>
						</h2>
						<p className="mx-auto max-w-2xl text-muted-foreground text-sm sm:text-base lg:text-lg">
							Click any comparison below to see detailed feature breakdowns and
							understand why Databuddy is the superior choice for privacy-first
							analytics.
						</p>
					</div>

					{/* Competitors Grid */}
					<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
						{competitorEntries.map(([slug, data]) => (
							<CompetitorCard data={data} key={slug} slug={slug} />
						))}
					</div>

					{/* Bottom CTA */}
					<div className="mt-16 text-center">
						<div className="mx-auto max-w-2xl rounded border border-border bg-card/30 p-8 backdrop-blur-sm">
							<h3 className="mb-4 font-bold text-foreground text-xl">
								Don't see your platform?
							</h3>
							<p className="mb-6 text-muted-foreground">
								We're constantly adding new comparisons. Try Databuddy today and
								see the difference privacy-first analytics makes.
							</p>
							<div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
								<SciFiButton asChild>
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
				</div>
			</Section>

			{/* Gradient Divider */}
			<div className="w-full">
				<div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-border/30 to-transparent" />
			</div>
		</div>
	);
}
