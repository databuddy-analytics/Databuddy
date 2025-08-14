'use client';

import type { IconWeight } from '@phosphor-icons/react';
import {
	CodeIcon,
	GitMergeIcon,
	GitPullRequestIcon,
	XIcon,
} from '@phosphor-icons/react';

interface Language {
	name: string;
	bytes: number;
	percentage: string;
}

interface Stats {
	totalContributors: number;
	totalContributions: number;
	openPRs: number;
	mergedPRs: number;
	closedPRs: number;
}

interface ActivityStatsProps {
	languages: Language[];
	stats: Stats;
}

const LANGUAGE_COLORS: Record<string, string> = {
	TypeScript: '#3178c6',
	JavaScript: '#f1e05a',
	CSS: '#563d7c',
	HTML: '#e34c26',
	Dockerfile: '#384d54',
	Shell: '#89e051',
	Python: '#3572A5',
	Go: '#00ADD8',
	Rust: '#dea584',
	Java: '#b07219',
	default: '#8b5cf6',
};

function LanguageBar({ language }: { language: Language }) {
	const color = LANGUAGE_COLORS[language.name] || LANGUAGE_COLORS.default;

	return (
		<div className="flex items-center justify-between py-3">
			<div className="flex items-center gap-3">
				<div
					className="h-3 w-3 rounded-full"
					style={{ backgroundColor: color }}
				/>
				<span className="font-medium text-foreground text-sm">
					{language.name}
				</span>
			</div>
			<span className="text-muted-foreground text-sm">
				{language.percentage}%
			</span>
		</div>
	);
}

function StatCard({
	icon: Icon,
	label,
	value,
	description,
	color = 'text-muted-foreground',
	href,
}: {
	icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
	label: string;
	value: number;
	description: string;
	color?: string;
	href?: string;
}) {
	const cardContent = (
		<div className="relative flex h-24 flex-col justify-center rounded border border-border bg-card/50 px-6 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70">
			<div className="flex items-center gap-3">
				<Icon className={`h-5 w-5 ${color}`} weight="duotone" />
				<div>
					<div className="font-bold text-xl">{value.toLocaleString()}</div>
					<div className="font-medium text-foreground text-sm">{label}</div>
					<div className="text-muted-foreground text-xs">{description}</div>
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

export default function ActivityStats({
	languages,
	stats,
}: ActivityStatsProps) {
	return (
		<div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:gap-12">
			{/* Language Breakdown */}
			<div>
				<div className="mb-6">
					<h3 className="mb-2 font-semibold text-xl sm:text-2xl">
						Language Breakdown
					</h3>
					<p className="text-muted-foreground text-sm sm:text-base">
						Code composition across the repository
					</p>
				</div>

				<div className="rounded border border-border bg-card/50 p-6 backdrop-blur-sm">
					{languages.length > 0 ? (
						<div className="space-y-1">
							{languages.map((language) => (
								<LanguageBar key={language.name} language={language} />
							))}
						</div>
					) : (
						<div className="py-8 text-center text-muted-foreground">
							No language data available
						</div>
					)}
				</div>
			</div>

			{/* Pull Request Stats */}
			<div>
				<div className="mb-6">
					<h3 className="mb-2 font-semibold text-xl sm:text-2xl">
						Pull Request Activity
					</h3>
					<p className="text-muted-foreground text-sm sm:text-base">
						Community engagement and contribution metrics
					</p>
				</div>

				<div className="space-y-4">
					<StatCard
						color="text-blue-500"
						description="Currently open"
						href="https://github.com/databuddy-analytics/Databuddy/pulls?q=is%3Apr+is%3Aopen"
						icon={GitPullRequestIcon}
						label="Open PRs"
						value={stats.openPRs}
					/>
					<StatCard
						color="text-green-500"
						description="Successfully merged"
						href="https://github.com/databuddy-analytics/Databuddy/pulls?q=is%3Apr+is%3Amerged"
						icon={GitMergeIcon}
						label="Merged PRs"
						value={stats.mergedPRs}
					/>
					<StatCard
						color="text-red-500"
						description="Closed without merge"
						href="https://github.com/databuddy-analytics/Databuddy/pulls?q=is%3Apr+is%3Aclosed+-is%3Amerged"
						icon={XIcon}
						label="Closed PRs"
						value={stats.closedPRs}
					/>
					<StatCard
						color="text-purple-500"
						description="All time contributions"
						href="https://github.com/databuddy-analytics/Databuddy/commits"
						icon={CodeIcon}
						label="Total Commits"
						value={stats.totalContributions}
					/>
				</div>
			</div>
		</div>
	);
}
