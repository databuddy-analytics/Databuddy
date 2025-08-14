'use client';

import type { IconWeight } from '@phosphor-icons/react';
import {
	GiftIcon,
	HeartIcon,
	RocketLaunchIcon,
	SparkleIcon,
} from '@phosphor-icons/react';

function FeatureCard({
	icon: Icon,
	title,
	description,
}: {
	icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
	title: string;
	description: string;
}) {
	return (
		<div className="group relative">
			<div className="relative flex h-20 w-full flex-col items-center justify-center rounded border border-border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70 sm:h-24 lg:h-28">
				<Icon
					className="mb-1 h-5 w-5 text-muted-foreground transition-colors duration-300 group-hover:text-foreground sm:h-6 sm:w-6 lg:h-7 lg:w-7"
					weight="duotone"
				/>
				<div className="px-3 text-center">
					<div className="font-semibold text-foreground text-xs sm:text-sm lg:text-base">
						{title}
					</div>
					<div className="mt-0.5 text-muted-foreground text-xs">
						{description}
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
	);
}

export default function AmbassadorHero() {
	return (
		<section className="relative w-full pt-16 pb-8 sm:pt-20 sm:pb-12 lg:pt-24 lg:pb-16">
			<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
				{/* Header */}
				<div className="mb-8 text-center lg:mb-12">
					<h1 className="mb-4 font-semibold text-2xl leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl">
						<span className="block">
							Become an{' '}
							<span className="text-muted-foreground">ambassador</span>
						</span>
						<span className="block">
							for <span className="text-muted-foreground">Databuddy</span>
						</span>
					</h1>
					<p className="mx-auto max-w-3xl text-balance font-medium text-muted-foreground text-sm leading-relaxed tracking-tight sm:text-base lg:text-lg">
						Join our exclusive ambassador program and help us revolutionize
						privacy-first analytics. Get early access, exclusive perks, and be
						part of building the future.
					</p>
				</div>

				{/* Features Grid */}
				<div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 lg:gap-8">
					<FeatureCard
						description="Shape the future"
						icon={RocketLaunchIcon}
						title="Early Access"
					/>
					<FeatureCard
						description="Exclusive benefits"
						icon={GiftIcon}
						title="Perks & Rewards"
					/>
					<FeatureCard
						description="Join our mission"
						icon={HeartIcon}
						title="Community"
					/>
					<FeatureCard
						description="Stand out"
						icon={SparkleIcon}
						title="Recognition"
					/>
				</div>
			</div>
		</section>
	);
}
