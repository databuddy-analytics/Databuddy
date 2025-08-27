'use client';

import Link from 'next/link';
import { SciFiCard } from '@/components/scifi-card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface Contributor {
	login: string;
	id: number;
	avatar_url: string;
	html_url: string;
	contributions: number;
	rank: number;
	percentage: string;
}

interface ContributorsGridProps {
	contributors: Contributor[];
}

function ContributorCard({ contributor }: { contributor: Contributor }) {
	return (
		<Link
			className="block"
			href={contributor.html_url}
			rel="noopener noreferrer nofollow"
			target="_blank"
		>
			<SciFiCard className="h-full rounded border border-border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70 hover:shadow-lg">
				<div className="flex flex-col items-center p-6">
					{/* Rank Badge */}
					<div className="mb-4 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-bold text-primary text-sm">
						#{contributor.rank}
					</div>

					{/* Avatar */}
					<Avatar className="mb-4 h-16 w-16 border-2 border-border">
						<AvatarImage alt={contributor.login} src={contributor.avatar_url} />
						<AvatarFallback className="bg-muted font-medium text-lg text-muted-foreground">
							{contributor.login.charAt(0).toUpperCase()}
						</AvatarFallback>
					</Avatar>

					{/* Username */}
					<h3 className="mb-2 font-semibold text-foreground text-lg transition-colors group-hover:text-primary">
						@{contributor.login}
					</h3>

					{/* Stats */}
					<div className="text-center">
						<div className="font-bold text-2xl text-foreground">
							{contributor.contributions.toLocaleString()}
						</div>
						<div className="text-muted-foreground text-sm">contributions</div>
						<div className="mt-1 font-medium text-primary text-xs">
							{contributor.percentage}% of total
						</div>
					</div>
				</div>
			</SciFiCard>
		</Link>
	);
}

export default function ContributorsGrid({
	contributors,
}: ContributorsGridProps) {
	if (contributors.length === 0) {
		return (
			<div className="text-center">
				<h2 className="mb-4 font-semibold text-2xl">Top Contributors</h2>
				<p className="text-muted-foreground">No contributors data available</p>
			</div>
		);
	}

	return (
		<div>
			{/* Header */}
			<div className="mb-12 text-center">
				<h2 className="mb-4 font-semibold text-2xl sm:text-3xl lg:text-4xl">
					Top Contributors
				</h2>
				<p className="mx-auto max-w-2xl text-muted-foreground text-sm sm:text-base lg:text-lg">
					The amazing developers who make Databuddy possible through their code
					contributions
				</p>
			</div>

			{/* Contributors Grid */}
			<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
				{contributors.map((contributor) => (
					<ContributorCard contributor={contributor} key={contributor.id} />
				))}
			</div>
		</div>
	);
}
