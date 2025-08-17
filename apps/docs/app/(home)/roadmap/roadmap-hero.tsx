'use client';

import { ClockIcon, MapPinIcon, RocketLaunchIcon } from '@phosphor-icons/react';
import type { RoadmapStats } from './roadmap-types';

interface Props {
	stats: RoadmapStats;
}

export default function RoadmapHero({ stats }: Props) {
	return (
		<div className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8 lg:py-24">
			<div className="text-center">
				{/* Hero Title */}
				<div className="mb-6">
					<h1 className="mb-4 font-bold text-4xl tracking-tight sm:text-5xl lg:text-6xl">
						Product{' '}
						<span className="bg-gradient-to-r from-foreground via-muted-foreground to-foreground bg-clip-text text-transparent">
							Roadmap
						</span>
					</h1>
					<p className="mx-auto max-w-3xl text-lg text-muted-foreground sm:text-xl lg:text-2xl">
						Discover what we're building next. Our transparent roadmap shows
						upcoming features, current progress, and completed milestones.
					</p>
				</div>

				{/* Progress Overview */}
				<div className="mb-12">
					<div className="mx-auto mb-6 max-w-md">
						<div className="mb-2 flex justify-between text-sm">
							<span className="font-medium">Overall Progress</span>
							<span className="font-bold">{stats.overallProgress}%</span>
						</div>
						<div className="h-3 w-full rounded-full bg-muted">
							<div
								className="h-3 rounded-full bg-gradient-to-r from-primary/80 to-primary transition-all duration-1000 ease-out"
								style={{ width: `${stats.overallProgress}%` }}
							/>
						</div>
					</div>
					<p className="text-muted-foreground text-sm">
						{stats.completedItems} of {stats.totalItems} items completed •{' '}
						{stats.inProgressItems} in progress
					</p>
				</div>

				{/* Key Stats Cards */}
				<div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
					{/* Current Quarter */}
					<div className="group relative rounded border border-border bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
						<div className="mb-3 flex items-center justify-center">
							<div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
								<ClockIcon
									className="h-6 w-6 text-blue-600 dark:text-blue-400"
									weight="duotone"
								/>
							</div>
						</div>
						<div className="font-bold text-2xl">{stats.currentQuarter}</div>
						<div className="text-muted-foreground text-sm">Current Quarter</div>
						<div className="mt-2 text-muted-foreground text-xs">
							{stats.inProgressItems} items in progress
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

					{/* Completed Items */}
					<div className="group relative rounded border border-border bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
						<div className="mb-3 flex items-center justify-center">
							<div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
								<RocketLaunchIcon
									className="h-6 w-6 text-green-600 dark:text-green-400"
									weight="duotone"
								/>
							</div>
						</div>
						<div className="font-bold text-2xl">{stats.completedItems}</div>
						<div className="text-muted-foreground text-sm">Completed</div>
						<div className="mt-2 text-muted-foreground text-xs">
							{Math.round((stats.completedItems / stats.totalItems) * 100)}% of
							total
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

					{/* Upcoming Milestones */}
					<div className="group relative rounded border border-border bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
						<div className="mb-3 flex items-center justify-center">
							<div className="flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
								<MapPinIcon
									className="h-6 w-6 text-purple-600 dark:text-purple-400"
									weight="duotone"
								/>
							</div>
						</div>
						<div className="font-bold text-2xl">{stats.upcomingMilestones}</div>
						<div className="text-muted-foreground text-sm">
							Upcoming Milestones
						</div>
						<div className="mt-2 text-muted-foreground text-xs">
							{stats.plannedItems} planned items
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
				</div>

				{/* Call to Action */}
				<div className="mt-12">
					<p className="mb-6 text-muted-foreground text-sm">
						Have feedback or suggestions? We'd love to hear from you.
					</p>
					<div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
						<a
							className="inline-flex items-center justify-center rounded bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
							href="https://github.com/databuddy-analytics/Databuddy/discussions"
							rel="noopener"
							target="_blank"
						>
							Join Discussion
						</a>
						<a
							className="inline-flex items-center justify-center rounded border border-border bg-background px-6 py-3 font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
							href="https://github.com/databuddy-analytics/Databuddy/issues/new"
							rel="noopener"
							target="_blank"
						>
							Request Feature
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}
