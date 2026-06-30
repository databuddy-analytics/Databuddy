"use client";

type IconWeight = "regular" | "bold" | "fill" | "duotone";

import {
	CodeIcon,
	CompassIcon,
	StarIcon as HeartIcon,
	LightningIcon,
} from "@databuddy/ui/icons";
import { SciFiCard } from "@/components/scifi-card";

function ValueCard({
	icon: Icon,
	title,
	description,
}: {
	icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
	title: string;
	description: string;
}) {
	return (
		<SciFiCard className="flex h-20 w-full flex-col items-center justify-center rounded border border-border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70 sm:h-24 lg:h-28">
			<Icon
				className="mb-1 size-5 text-muted-foreground duration-300 group-hover:text-foreground sm:h-6 sm:w-6 lg:h-7 lg:w-7"
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
		</SciFiCard>
	);
}

export default function CareersHero() {
	return (
		<section className="relative w-full pt-16 pb-8 sm:pt-20 sm:pb-12 lg:pt-24 lg:pb-16">
			<div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
				<div className="mb-8 text-center lg:mb-12">
					<h1 className="mb-4 text-balance font-semibold text-2xl leading-tight tracking-tight sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl">
						<span className="block">Work with us on</span>
						<span className="block">
							<span className="text-muted-foreground">privacy-first</span>{" "}
							analytics
						</span>
					</h1>
					<p className="mx-auto max-w-3xl text-balance font-medium text-muted-foreground text-sm leading-relaxed tracking-tight sm:text-base lg:text-lg">
						We're a small, remote team building Databuddy in the open. We don't
						have a recruiting pipeline and we hire rarely, but we always want to
						hear from sharp builders who care about the same things we do.
					</p>
				</div>

				<div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4 lg:gap-8">
					<ValueCard
						description="Ship real things"
						icon={LightningIcon}
						title="Small team"
					/>
					<ValueCard
						description="Work from anywhere"
						icon={CompassIcon}
						title="Remote-first"
					/>
					<ValueCard
						description="Every line in public"
						icon={CodeIcon}
						title="Open source"
					/>
					<ValueCard
						description="Users before metrics"
						icon={HeartIcon}
						title="Privacy-first"
					/>
				</div>
			</div>
		</section>
	);
}
