'use client';

import type { IconWeight } from '@phosphor-icons/react';
import {
	CrownIcon,
	DiamondIcon,
	GiftIcon,
	StarIcon,
	TrophyIcon,
	UsersIcon,
} from '@phosphor-icons/react';
import { SciFiCard } from '@/components/scifi-card';
import { cn } from '@/lib/utils';

interface Reward {
	icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
	title: string;
	description: string;
	value: string;
	highlight?: boolean;
	soon?: boolean;
}

const rewards: Reward[] = [
	{
		icon: DiamondIcon,
		title: 'Free Premium Access',
		description: 'Lifetime access to all premium features and analytics',
		value: '$99/month value',
		highlight: true,
	},
	{
		icon: GiftIcon,
		title: 'Exclusive Swag',
		description: 'Limited edition Databuddy merchandise and swag box',
		value: '$150 value',
		soon: true,
	},
	{
		icon: StarIcon,
		title: 'Early Access',
		description: 'First access to new features and beta releases',
		value: 'Priceless',
	},
	{
		icon: UsersIcon,
		title: 'Private Community',
		description: 'Access to exclusive ambassador-only Discord channels',
		value: 'Exclusive',
	},
	{
		icon: TrophyIcon,
		title: 'Revenue Share',
		description: 'Earn commission on referrals and partnerships',
		value: 'Up to 30%',
		highlight: true,
		soon: true,
	},
	{
		icon: CrownIcon,
		title: 'VIP Support',
		description: 'Priority support and direct line to our team',
		value: 'Premium',
	},
];

function RewardCard({ reward }: { reward: Reward }) {
	return (
		<SciFiCard variant={reward.highlight ? 'primary' : 'foreground'}>
			<div
				className={cn(
					'relative h-full rounded border bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-border/80 hover:bg-card/70 hover:shadow-lg',
					reward.highlight ? 'border-primary/50 bg-primary/5' : 'border-border'
				)}
			>
				<div className="flex flex-col p-6">
					{/* Icon and Value */}
					<div className="mb-4 flex items-start justify-between">
						<div className="flex items-center gap-2">
							<reward.icon
								className={`h-8 w-8 ${
									reward.highlight ? 'text-primary' : 'text-muted-foreground'
								} transition-colors duration-300 group-hover:text-foreground`}
								weight="duotone"
							/>
							{reward.soon && (
								<span className="rounded bg-orange-500/20 px-1.5 py-0.5 font-semibold text-orange-500 text-xs uppercase tracking-wide">
									Soon
								</span>
							)}
						</div>
						<span
							className={`rounded-full px-2 py-1 font-medium text-xs ${
								reward.highlight
									? 'bg-primary/20 text-primary'
									: 'bg-muted/50 text-muted-foreground'
							}`}
						>
							{reward.value}
						</span>
					</div>

					{/* Content */}
					<div className="flex-1">
						<h3
							className={`mb-2 font-semibold text-lg transition-colors group-hover:text-primary ${
								reward.highlight ? 'text-foreground' : 'text-foreground'
							}`}
						>
							{reward.title}
						</h3>
						<p className="text-muted-foreground text-sm leading-relaxed">
							{reward.description}
						</p>
					</div>
				</div>
			</div>
		</SciFiCard>
	);
}

export default function AmbassadorRewards() {
	return (
		<div>
			{/* Header */}
			<div className="mb-12 text-center">
				<h2 className="mb-4 font-semibold text-2xl sm:text-3xl lg:text-4xl">
					Ambassador Rewards
				</h2>
				<p className="mx-auto max-w-2xl text-muted-foreground text-sm sm:text-base lg:text-lg">
					Join our program and unlock exclusive benefits, early access, and
					revenue opportunities
				</p>
			</div>

			{/* Rewards Grid */}
			<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
				{rewards.map((reward) => (
					<RewardCard key={reward.title} reward={reward} />
				))}
			</div>

			{/* Bottom CTA */}
			<div className="mt-12 text-center">
				<p className="text-muted-foreground text-sm sm:text-base">
					Ready to join? Fill out the form below to get started.
				</p>
			</div>
		</div>
	);
}
