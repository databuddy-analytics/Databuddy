'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { Sponsor } from './sponsors-data';

interface SponsorsGridProps {
	sponsors: Sponsor[];
}

function SponsorCard({ sponsor }: { sponsor: Sponsor }) {
	const tierColors = {
		platinum: 'border-purple-500/30 bg-purple-500/5',
		gold: 'border-yellow-500/30 bg-yellow-500/5',
		silver: 'border-gray-400/30 bg-gray-400/5',
		bronze: 'border-orange-600/30 bg-orange-600/5',
	};

	const tierLabels = {
		platinum: 'Platinum',
		gold: 'Gold',
		silver: 'Silver',
		bronze: 'Bronze',
	};

	return (
		<Link
			className="group block"
			href={sponsor.website}
			rel="noopener noreferrer"
			target="_blank"
		>
			<div
				className={`relative h-full rounded border backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70 hover:shadow-lg ${tierColors[sponsor.tier]}`}
			>
				<div className="flex flex-col items-center p-6 sm:p-8">
					{/* Tier Badge */}
					<div className="mb-3 rounded-full bg-primary/10 px-3 py-1 font-medium text-primary text-xs uppercase tracking-wide">
						{tierLabels[sponsor.tier]}
					</div>

					{/* Logo */}
					<div className="mb-4 flex h-20 w-full items-center justify-center sm:mb-6 sm:h-24">
						<Image
							alt={`${sponsor.name} logo`}
							className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105 dark:brightness-0 dark:invert"
							height={96}
							src={sponsor.logo}
							width={200}
						/>
					</div>

					{/* Name */}
					<h3 className="mb-3 text-center font-semibold text-foreground text-lg transition-colors group-hover:text-primary sm:text-xl">
						{sponsor.name}
					</h3>

					{/* Description */}
					{sponsor.description && (
						<p className="text-center text-muted-foreground text-sm leading-relaxed">
							{sponsor.description}
						</p>
					)}
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

export default function SponsorsGrid({ sponsors }: SponsorsGridProps) {
	if (sponsors.length === 0) {
		return (
			<div className="text-center">
				<h2 className="mb-4 font-semibold text-2xl">Our Sponsors</h2>
				<p className="text-muted-foreground">
					No sponsors to display at the moment
				</p>
			</div>
		);
	}

	const sponsorsByTier = sponsors
		.filter((sponsor) => !sponsor.disabled)
		.reduce(
			(acc, sponsor) => {
				if (!acc[sponsor.tier]) {
					acc[sponsor.tier] = [];
				}
				acc[sponsor.tier].push(sponsor);
				return acc;
			},
			{} as Record<string, Sponsor[]>
		);

	const tierOrder = ['platinum', 'gold', 'silver', 'bronze'] as const;

	return (
		<div>
			{/* Header */}
			<div className="mb-12 text-center">
				<h2 className="mb-4 font-semibold text-2xl sm:text-3xl lg:text-4xl">
					Our Sponsors
				</h2>
				<p className="mx-auto max-w-2xl text-muted-foreground text-sm sm:text-base lg:text-lg">
					Thank you to these amazing companies and individuals for supporting
					our mission
				</p>
			</div>

			{/* Sponsors by Tier */}
			<div className="space-y-12 lg:space-y-16">
				{tierOrder.map((tier) => {
					const tierSponsors = sponsorsByTier[tier];
					if (!tierSponsors || tierSponsors.length === 0) {
						return null;
					}

					const tierLabels: Record<typeof tier, string> = {
						platinum: 'Platinum Sponsors',
						gold: 'Gold Sponsors',
						silver: 'Silver Sponsors',
						bronze: 'Bronze Sponsors',
					};

					// Dynamic grid columns based on number of items
					const getGridCols = (count: number, tierType: string) => {
						if (count === 1) {
							return 'grid-cols-1 place-items-center max-w-md mx-auto';
						}
						if (count === 2) {
							return 'grid-cols-1 sm:grid-cols-2 max-w-2xl mx-auto';
						}

						const tierCols: Record<string, string> = {
							platinum: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-2',
							gold: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
							silver:
								'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
							bronze:
								'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
						};
						return tierCols[tierType] || tierCols.bronze;
					};

					return (
						<div key={tier}>
							<h3 className="mb-6 text-center font-semibold text-xl sm:text-2xl lg:mb-8">
								{tierLabels[tier]}
							</h3>
							<div
								className={`grid gap-4 sm:gap-6 ${getGridCols(tierSponsors.length, tier)}`}
							>
								{tierSponsors.map((sponsor) => (
									<SponsorCard key={sponsor.id} sponsor={sponsor} />
								))}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
