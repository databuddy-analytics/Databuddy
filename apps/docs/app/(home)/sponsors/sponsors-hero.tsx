'use client';

import type { IconWeight } from '@phosphor-icons/react';
import { HeartIcon, SparkleIcon } from '@phosphor-icons/react';

interface SponsorsHeroProps {
	totalSponsors: number;
	featuredSponsors: number;
}

function formatNumber(num: number): string {
	return num.toLocaleString();
}

function StatCard({
	icon: Icon,
	label,
	value,
	description,
}: {
	icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
	label: string;
	value: number;
	description: string;
}) {
	const cardContent = (
		<div className="relative flex h-32 w-full flex-col items-center justify-center rounded border border-border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70 sm:h-36 lg:h-40">
			<Icon
				className="mb-2 h-6 w-6 text-muted-foreground transition-colors duration-300 group-hover:text-foreground sm:h-7 sm:w-7 lg:h-8 lg:w-8"
				weight="duotone"
			/>
			<div className="text-center">
				<div className="font-bold text-2xl sm:text-3xl lg:text-4xl">
					{formatNumber(value)}
				</div>
				<div className="font-medium text-foreground text-sm sm:text-base lg:text-lg">
					{label}
				</div>
				<div className="mt-1 text-muted-foreground text-xs sm:text-sm">
					{description}
				</div>
			</div>
		</div>
	);

	const corners = (
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
	);

	return (
		<div className="group relative">
			{cardContent}
			{corners}
		</div>
	);
}

export default function SponsorsHero({
	totalSponsors,
	featuredSponsors,
}: SponsorsHeroProps) {
	return (
		<section className="relative w-full pt-24 pb-16 sm:pt-28 sm:pb-20 lg:pt-32 lg:pb-24">
			<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
				{/* Header */}
				<div className="mb-12 text-center lg:mb-16">
					<h1 className="mb-4 font-semibold text-3xl leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-[72px]">
						<span className="block">
							Our amazing{' '}
							<span className="text-muted-foreground">sponsors</span>
						</span>
						<span className="block">
							powering <span className="text-muted-foreground">innovation</span>
						</span>
					</h1>
					<p className="mx-auto max-w-3xl text-balance font-medium text-muted-foreground text-sm leading-relaxed tracking-tight sm:text-base lg:text-lg">
						We&apos;re grateful to the companies and individuals who support
						Databuddy&apos;s mission to provide privacy-first analytics for
						everyone.
					</p>
				</div>

				{/* Stats Grid */}
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:gap-8">
					<StatCard
						description="Supporting our mission"
						icon={HeartIcon}
						label="Total Sponsors"
						value={totalSponsors}
					/>
					<StatCard
						description="Featured partners"
						icon={SparkleIcon}
						label="Featured Sponsors"
						value={featuredSponsors}
					/>
				</div>
			</div>
		</section>
	);
}
