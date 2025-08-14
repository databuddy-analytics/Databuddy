'use client';

import { RocketIcon, TagIcon } from '@phosphor-icons/react';
import { useMemo } from 'react';

interface ProcessedRelease {
	name: string;
	tagName: string;
	publishedAt: string;
	date: Date;
	isPrerelease: boolean;
}

interface Props {
	data: ProcessedRelease[];
}

// Helper function to calculate average days between releases
function calculateAverageDaysBetween(releases: ProcessedRelease[]): number {
	if (releases.length < 2) {
		return 0;
	}

	const daysDiffs: number[] = [];
	for (let i = 0; i < releases.length - 1; i++) {
		const diff = Math.abs(
			releases[i].date.getTime() - releases[i + 1].date.getTime()
		);
		daysDiffs.push(diff / (1000 * 60 * 60 * 24));
	}

	return Math.round(
		daysDiffs.reduce((sum, days) => sum + days, 0) / daysDiffs.length
	);
}

// Helper function to determine release frequency
function determineReleaseFrequency(avgDaysBetween: number): string {
	if (avgDaysBetween <= 0) {
		return 'No data';
	}
	if (avgDaysBetween <= 7) {
		return 'Weekly';
	}
	if (avgDaysBetween <= 21) {
		return 'Bi-weekly';
	}
	if (avgDaysBetween <= 45) {
		return 'Monthly';
	}
	if (avgDaysBetween <= 90) {
		return 'Quarterly';
	}
	return 'Irregular';
}

export default function ReleasesTimeline({ data }: Props) {
	const { releases, insights } = useMemo(() => {
		if (!data.length) {
			return {
				releases: [],
				insights: {
					totalReleases: 0,
					stableReleases: 0,
					prereleases: 0,
					avgDaysBetween: 0,
					lastReleaseDate: null as string | null,
					releaseFrequency: 'No data',
				},
			};
		}

		// Sort releases by date (newest first)
		const sortedReleases = [...data].sort(
			(a, b) => b.date.getTime() - a.date.getTime()
		);

		// Calculate insights
		const totalReleases = sortedReleases.length;
		const stableReleases = sortedReleases.filter((r) => !r.isPrerelease).length;
		const prereleases = sortedReleases.filter((r) => r.isPrerelease).length;
		const avgDaysBetween = calculateAverageDaysBetween(sortedReleases);
		const releaseFrequency = determineReleaseFrequency(avgDaysBetween);
		const lastReleaseDate = sortedReleases[0]?.publishedAt || null;

		return {
			releases: sortedReleases.slice(0, 8), // Show last 8 releases
			insights: {
				totalReleases,
				stableReleases,
				prereleases,
				avgDaysBetween,
				lastReleaseDate,
				releaseFrequency,
			},
		};
	}, [data]);

	if (!releases.length) {
		return (
			<div>
				<div className="mb-8">
					<h3 className="mb-2 font-semibold text-2xl sm:text-3xl lg:text-4xl">
						Release Timeline
					</h3>
					<p className="text-muted-foreground text-sm sm:text-base lg:text-lg">
						Project delivery momentum and release cadence
					</p>
				</div>
				<div className="group relative rounded border border-border bg-card/50 p-8 backdrop-blur-sm">
					<div className="py-8 text-center text-muted-foreground">
						No releases data available
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
		);
	}

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	};

	const getTimeSince = (dateString: string) => {
		const date = new Date(dateString);
		const now = new Date();
		const diffTime = Math.abs(now.getTime() - date.getTime());
		const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

		if (diffDays === 0) {
			return 'Today';
		}
		if (diffDays === 1) {
			return '1 day ago';
		}
		if (diffDays < 30) {
			return `${diffDays} days ago`;
		}
		if (diffDays < 365) {
			const months = Math.floor(diffDays / 30);
			return months === 1 ? '1 month ago' : `${months} months ago`;
		}
		const years = Math.floor(diffDays / 365);
		return years === 1 ? '1 year ago' : `${years} years ago`;
	};

	return (
		<div>
			<div className="mb-8">
				<h3 className="mb-2 font-semibold text-2xl sm:text-3xl lg:text-4xl">
					Release Timeline
				</h3>
				<p className="text-muted-foreground text-sm sm:text-base lg:text-lg">
					Recent releases showing project delivery momentum •{' '}
					{insights.totalReleases} total releases
				</p>
			</div>

			{/* Insights Cards */}
			<div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				<div className="group relative rounded border border-border bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
					<div className="font-bold text-2xl">{insights.totalReleases}</div>
					<div className="text-muted-foreground text-sm">Total Releases</div>

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

				<div className="group relative rounded border border-border bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
					<div className="font-bold text-2xl">{insights.stableReleases}</div>
					<div className="text-muted-foreground text-sm">Stable Releases</div>

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

				<div className="group relative rounded border border-border bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
					<div className="font-bold text-2xl">{insights.releaseFrequency}</div>
					<div className="text-muted-foreground text-sm">Release Frequency</div>

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

				<div className="group relative rounded border border-border bg-card/50 p-6 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
					<div className="font-bold text-2xl">
						{insights.lastReleaseDate
							? getTimeSince(insights.lastReleaseDate)
							: 'N/A'}
					</div>
					<div className="text-muted-foreground text-sm">Last Release</div>

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

			{/* Timeline */}
			<div className="group relative rounded border border-border bg-card/50 p-6 backdrop-blur-sm">
				<h3 className="mb-6 font-semibold text-foreground text-lg">
					Recent Releases
				</h3>

				<div className="space-y-6">
					{releases.map((release, index) => (
						<div className="relative" key={release.tagName}>
							{/* Timeline line */}
							{index < releases.length - 1 && (
								<div className="absolute top-8 left-4 h-full w-px bg-border" />
							)}

							<div className="flex gap-4">
								{/* Timeline dot */}
								<div
									className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
										release.isPrerelease
											? 'border-orange-500 bg-orange-100'
											: 'border-green-500 bg-green-100'
									}`}
								>
									{release.isPrerelease ? (
										<TagIcon
											className="h-4 w-4 text-orange-600"
											weight="fill"
										/>
									) : (
										<RocketIcon
											className="h-4 w-4 text-green-600"
											weight="fill"
										/>
									)}
								</div>

								{/* Release info */}
								<div className="min-w-0 flex-1 pb-2">
									<div className="flex flex-wrap items-center gap-2">
										<h4 className="font-semibold text-foreground">
											{release.name}
										</h4>
										{release.isPrerelease && (
											<span className="rounded bg-orange-100 px-2 py-1 font-medium text-orange-700 text-xs">
												Pre-release
											</span>
										)}
									</div>

									<div className="mt-1 flex flex-wrap items-center gap-4 text-muted-foreground text-sm">
										<span className="font-mono">{release.tagName}</span>
										<span>•</span>
										<span>{formatDate(release.publishedAt)}</span>
										<span>•</span>
										<span>{getTimeSince(release.publishedAt)}</span>
									</div>
								</div>
							</div>
						</div>
					))}
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

			{/* Additional Insights */}
			<div className="group relative mt-8 rounded border border-border bg-card/50 p-4 backdrop-blur-sm">
				<p className="text-muted-foreground text-sm">
					<span className="font-medium">Release pattern:</span> The project has
					shipped {insights.totalReleases} total releases with a{' '}
					<span className="font-medium">
						{insights.releaseFrequency.toLowerCase()}
					</span>{' '}
					cadence
					{insights.avgDaysBetween > 0 && (
						<>, averaging {insights.avgDaysBetween} days between releases</>
					)}
					.{' '}
					{insights.stableReleases > insights.prereleases
						? 'Focus on stable releases indicates mature development practices.'
						: 'Active pre-release testing shows careful development approach.'}
				</p>

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
	);
}
