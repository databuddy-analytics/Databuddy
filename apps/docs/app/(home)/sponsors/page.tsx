import type { Metadata } from 'next';
import { Footer } from '@/components/footer';
import Section from '@/components/landing/section';
import { Spotlight } from '@/components/landing/spotlight';
import HonorableMentions from './honorable-mentions';
import { honorableMentions, sponsorStats, sponsors } from './sponsors-data';
import SponsorsGrid from './sponsors-grid';
import SponsorsHero from './sponsors-hero';

export const metadata: Metadata = {
	title: 'Sponsors | Databuddy',
	description:
		'Support Databuddy and help us build the future of privacy-first analytics',
};

export default function SponsorsPage() {
	return (
		<div className="overflow-hidden">
			<Spotlight transform="translateX(-60%) translateY(-50%)" />

			{/* Hero Section */}
			<Section className="overflow-hidden" customPaddings id="sponsors-hero">
				<SponsorsHero
					featuredSponsors={sponsorStats.featuredSponsors}
					totalSponsors={sponsorStats.totalSponsors}
				/>
			</Section>

			{/* Current Sponsors Section */}
			<Section
				className="border-border border-t border-b bg-background/50"
				id="current-sponsors"
			>
				<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
					<SponsorsGrid sponsors={sponsors} />
				</div>
			</Section>

			{/* Honorable Mentions Section */}
			<Section
				className="border-border border-b bg-background/30"
				id="honorable-mentions"
			>
				<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
					<HonorableMentions mentions={honorableMentions} />
				</div>
			</Section>

			{/* Call to Action Section */}
			<Section className="bg-background/50" id="sponsor-cta">
				<div className="mx-auto w-full max-w-4xl px-4 text-center sm:px-6 lg:px-8">
					<h2 className="mb-6 font-semibold text-2xl sm:text-3xl lg:text-4xl">
						Ready to Support Databuddy?
					</h2>
					<p className="mx-auto mb-8 max-w-2xl text-muted-foreground text-sm sm:text-base lg:text-lg">
						Join our community of sponsors and help us build the future of
						privacy-first analytics. Your support enables us to continue
						developing innovative features and maintaining our open-source
						commitment.
					</p>
					<div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
						<a
							className="inline-flex items-center justify-center rounded bg-primary px-8 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
							href="mailto:sponsors@databuddy.cc?subject=Sponsorship%20Inquiry"
						>
							Become a Sponsor
						</a>
						<a
							className="inline-flex items-center justify-center rounded border border-border bg-background px-8 py-3 font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
							href="mailto:sponsors@databuddy.cc?subject=Sponsorship%20Questions"
						>
							Ask Questions
						</a>
					</div>
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
