import type { Metadata } from 'next';
import { Footer } from '@/components/footer';
import Section from '@/components/landing/section';
import { Spotlight } from '@/components/landing/spotlight';
import { SciFiCard } from '@/components/scifi-card';
import { StructuredData } from '@/components/structured-data';
import { calculateRoadmapStats, roadmapItems } from './roadmap-data';
import RoadmapHero from './roadmap-hero';
import RoadmapStatsComponent from './roadmap-stats';
import RoadmapTimeline from './roadmap-timeline';

export const metadata: Metadata = {
	title: 'Roadmap | Databuddy',
	description:
		"Discover what we're building next. Our transparent roadmap shows upcoming features, current progress, and completed milestones.",
	alternates: {
		canonical: 'https://www.databuddy.cc/roadmap',
	},
	openGraph: {
		title: 'Roadmap | Databuddy',
		description:
			"Discover what we're building next. Our transparent roadmap shows upcoming features, current progress, and completed milestones.",
		url: 'https://www.databuddy.cc/roadmap',
		images: ['/og-image.png'],
	},
};

export default function RoadmapPage() {
	const stats = calculateRoadmapStats();

	const title = 'Roadmap | Databuddy';
	const description =
		"Discover what we're building next. Our transparent roadmap shows upcoming features, current progress, and completed milestones.";
	const url = 'https://www.databuddy.cc/roadmap';

	return (
		<div className="overflow-hidden">
			<StructuredData
				page={{
					title,
					description,
					url,
				}}
			/>
			<Spotlight transform="translateX(-60%) translateY(-50%)" />

			{/* Hero Section */}
			<Section className="overflow-hidden" customPaddings id="roadmap-hero">
				<RoadmapHero stats={stats} />
			</Section>

			{/* Stats Section */}
			<Section
				className="border-border border-t border-b bg-background/50"
				id="roadmap-stats"
			>
				<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
					<div className="mb-8">
						<h2 className="mb-2 font-semibold text-2xl sm:text-3xl lg:text-4xl">
							Progress Overview
						</h2>
						<p className="text-muted-foreground text-sm sm:text-base lg:text-lg">
							Detailed breakdown of our development progress across categories
							and priorities
						</p>
					</div>
					<RoadmapStatsComponent items={roadmapItems} stats={stats} />
				</div>
			</Section>

			{/* Timeline Section */}
			<Section
				className="border-border border-b bg-background/30"
				id="roadmap-timeline"
			>
				<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
					<div className="mb-8">
						<h2 className="mb-2 font-semibold text-2xl sm:text-3xl lg:text-4xl">
							Development Timeline
						</h2>
						<p className="text-muted-foreground text-sm sm:text-base lg:text-lg">
							Complete timeline of features, from completed milestones to future
							plans
						</p>
					</div>
					<RoadmapTimeline items={roadmapItems} />
				</div>
			</Section>

			{/* Community Section */}
			<Section className="bg-background/50" id="roadmap-community">
				<div className="mx-auto w-full max-w-4xl px-4 text-center sm:px-6 lg:px-8">
					<h2 className="mb-6 font-semibold text-2xl sm:text-3xl lg:text-4xl">
						Shape Our Future
					</h2>
					<p className="mx-auto mb-8 max-w-2xl text-muted-foreground text-sm sm:text-base lg:text-lg">
						Our roadmap is a living document that evolves based on user
						feedback, market needs, and technical discoveries. Your input helps
						us prioritize what matters most.
					</p>

					{/* Community Stats */}
					<div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
						<SciFiCard className="rounded border border-border bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
							<div className="font-bold text-2xl">500+</div>
							<div className="text-muted-foreground text-sm">
								Community Members
							</div>
						</SciFiCard>

						<SciFiCard className="rounded border border-border bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
							<div className="font-bold text-2xl">150+</div>
							<div className="text-muted-foreground text-sm">
								Feature Requests
							</div>
						</SciFiCard>

						<SciFiCard className="rounded border border-border bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
							<div className="font-bold text-2xl">95%</div>
							<div className="text-muted-foreground text-sm">
								User Satisfaction
							</div>
						</SciFiCard>
					</div>

					<div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
						<a
							className="inline-flex items-center justify-center rounded bg-primary px-8 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
							href="https://github.com/databuddy-analytics/Databuddy/discussions"
							rel="noopener"
							target="_blank"
						>
							Join Discussion
						</a>
						<a
							className="inline-flex items-center justify-center rounded border border-border bg-background px-8 py-3 font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
							href="https://github.com/databuddy-analytics/Databuddy/issues/new?template=feature_request.md"
							rel="noopener"
							target="_blank"
						>
							Request Feature
						</a>
						<a
							className="inline-flex items-center justify-center rounded border border-border bg-background px-8 py-3 font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
							href="https://discord.gg/JTk7a38tCZ"
							rel="noopener"
							target="_blank"
						>
							Join Discord
						</a>
					</div>
				</div>
			</Section>

			{/* Transparency Note */}
			<Section
				className="border-border border-b bg-background/30"
				id="roadmap-transparency"
			>
				<div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
					<SciFiCard className="rounded border border-border bg-card/50 p-8 backdrop-blur-sm">
						<h3 className="mb-4 font-semibold text-foreground text-lg">
							Our Commitment to Transparency
						</h3>
						<div className="space-y-4 text-muted-foreground text-sm leading-relaxed">
							<p>
								This roadmap represents our current plans and priorities, but
								software development is inherently unpredictable. Dates are
								estimates and may change based on technical challenges, user
								feedback, or market conditions.
							</p>
							<p>
								We believe in building in the open and keeping our community
								informed. All major decisions, delays, and pivots will be
								communicated transparently through our GitHub discussions,
								Discord community, and blog updates.
							</p>
							<p>
								<strong>Last updated:</strong>{' '}
								{new Date().toLocaleDateString('en-US', {
									year: 'numeric',
									month: 'long',
									day: 'numeric',
								})}{' '}
								• <strong>Next review:</strong> End of current quarter
							</p>
						</div>
					</SciFiCard>
				</div>
			</Section>

			{/* Gradient Divider */}
			<div className="w-full">
				<div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-border/30 to-transparent" />
			</div>

			{/* Footer Section */}
			<Footer />

			{/* Final Gradient Divider */}
			<div className="w-full">
				<div className="mx-auto h-px max-w-6xl bg-gradient-to-r from-transparent via-border/30 to-transparent" />
			</div>
		</div>
	);
}
