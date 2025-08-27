'use client';

import Image from 'next/image';
import Link from 'next/link';
import { SciFiCard } from '@/components/scifi-card';
import type { HonorableMention } from './sponsors-data';

interface HonorableMentionsProps {
	mentions: HonorableMention[];
}

function MentionCard({ mention }: { mention: HonorableMention }) {
	const supportTypeColors = {
		'Free Plan': 'bg-blue-500/10 text-blue-600 border-blue-500/20',
		'Open Source': 'bg-green-500/10 text-green-600 border-green-500/20',
		'Community Support':
			'bg-purple-500/10 text-purple-600 border-purple-500/20',
		Educational: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
	};

	return (
		<Link
			className="block"
			href={mention.website}
			rel="noopener noreferrer"
			target="_blank"
		>
			<SciFiCard 
			className="h-full rounded border border-border bg-card/30 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/50 hover:shadow-lg"
			cornerOpacity="opacity-50"
		>
				<div className="flex flex-col items-center p-6">
					{/* Support Type Badge */}
					<div
						className={`mb-4 rounded-full border px-3 py-1 font-medium text-xs ${supportTypeColors[mention.supportType]}`}
					>
						{mention.supportType}
					</div>

					{/* Logo */}
					<div className="mb-4 flex h-16 w-full items-center justify-center">
						<Image
							alt={`${mention.name} logo`}
							className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105 dark:brightness-0 dark:invert"
							height={64}
							src={mention.logo}
							width={160}
						/>
					</div>

					{/* Name */}
					<h3 className="mb-2 text-center font-semibold text-foreground text-lg transition-colors group-hover:text-primary">
						{mention.name}
					</h3>

					{/* Description */}
					<p className="text-center text-muted-foreground text-sm leading-relaxed">
						{mention.description}
					</p>
				</div>
			</SciFiCard>
		</Link>
	);
}

export default function HonorableMentions({
	mentions,
}: HonorableMentionsProps) {
	if (mentions.length === 0) {
		return null;
	}

	return (
		<div>
			{/* Header */}
			<div className="mb-12 text-center">
				<h2 className="mb-4 font-semibold text-2xl sm:text-3xl lg:text-4xl">
					Honorable Mentions
				</h2>
				<p className="mx-auto max-w-2xl text-muted-foreground text-sm sm:text-base lg:text-lg">
					Special thanks to these amazing companies and tools that support open
					source projects through free plans and community programs
				</p>
			</div>

			{/* Mentions Grid */}
			<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{mentions.map((mention) => (
					<MentionCard key={mention.id} mention={mention} />
				))}
			</div>
		</div>
	);
}
