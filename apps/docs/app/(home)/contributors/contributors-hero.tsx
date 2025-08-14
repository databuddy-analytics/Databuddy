'use client';

import type { IconWeight } from '@phosphor-icons/react';
import {
	GitForkIcon,
	StarIcon,
	UsersIcon,
	WarningCircleIcon,
} from '@phosphor-icons/react';

interface ContributorsHeroProps {
	stars: number;
	forks: number;
	issues: number;
	contributors: number;
}

function formatNumber(num: number): string {
	return num.toLocaleString();
}

function StatCard({
	icon: Icon,
	label,
	value,
	description,
	href,
}: {
	icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
	label: string;
	value: number;
	description: string;
	href?: string;
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

	if (href) {
		return (
			<a
				className="group relative block cursor-pointer"
				href={href}
				rel="noopener noreferrer"
				target="_blank"
			>
				{cardContent}
				{corners}
			</a>
		);
	}

	return (
		<div className="group relative">
			{cardContent}
			{corners}
		</div>
	);
}

export default function ContributorsHero({
	stars,
	forks,
	issues,
	contributors,
}: ContributorsHeroProps) {
	return (
		<section className="relative w-full pt-24 pb-16 sm:pt-28 sm:pb-20 lg:pt-32 lg:pb-24">
			<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
				{/* Header */}
				<div className="mb-12 text-center lg:mb-16">
					<h1 className="mb-4 font-semibold text-3xl leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl xl:text-[72px]">
						<span className="block">
							Meet the <span className="text-muted-foreground">builders</span>
						</span>
						<span className="block">
							behind <span className="text-muted-foreground">Databuddy</span>
						</span>
					</h1>
					<p className="mx-auto max-w-3xl text-balance font-medium text-muted-foreground text-sm leading-relaxed tracking-tight sm:text-base lg:text-lg">
						Privacy-first analytics built by passionate developers who believe
						in transparency, open source, and putting developers first.
					</p>
				</div>

				{/* Stats Grid */}
				<div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 lg:gap-8">
					<StatCard
						description="GitHub stars"
						href="https://github.com/databuddy-analytics/Databuddy/stargazers"
						icon={StarIcon}
						label="Stars"
						value={stars}
					/>
					<StatCard
						description="Community forks"
						href="https://github.com/databuddy-analytics/Databuddy/forks"
						icon={GitForkIcon}
						label="Forks"
						value={forks}
					/>
					<StatCard
						description="Open issues"
						href="https://github.com/databuddy-analytics/Databuddy/issues?q=is%3Aissue+is%3Aopen"
						icon={WarningCircleIcon}
						label="Issues"
						value={issues}
					/>
					<StatCard
						description="Total contributors"
						href="https://github.com/databuddy-analytics/Databuddy/graphs/contributors"
						icon={UsersIcon}
						label="Contributors"
						value={contributors}
					/>
				</div>
			</div>
		</section>
	);
}
