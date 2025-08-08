'use client';

import {
	EyeIcon,
	LeafIcon,
	RocketLaunchIcon,
	ShieldIcon,
	TrendUpIcon,
	UsersFourIcon,
} from '@phosphor-icons/react';
import { SciFiGridCard } from './card';

const cards = [
	{
		id: 1,
		title: 'Privacy First Approach',
		description:
			'Build trust & reduce legal risk with built-in GDPR/CCPA compliance.',
		icon: ShieldIcon,
	},
	{
		id: 2,
		title: 'Real-time Analytics',
		description:
			'Make smarter, data-driven decisions instantly with live dashboards.',
		icon: TrendUpIcon,
	},
	{
		id: 3,
		title: 'Data Ownership',
		description: 'Full control of your valuable business data.',
		icon: UsersFourIcon,
	},
	{
		id: 4,
		title: 'Energy Efficient',
		description:
			'Up to 10x more eco-friendly with a significantly lower carbon footprint.',
		icon: LeafIcon,
	},
	{
		id: 5,
		title: 'Transparency',
		description: 'Fully transparent, no hidden fees or data games.',
		icon: EyeIcon,
	},
	{
		id: 6,
		title: 'Lightweight',
		description:
			'Lightweight, no cookies, no fingerprinting, no consent needed.',
		icon: RocketLaunchIcon,
	},
];

export const GridCards = () => {
	return (
		<div className="w-full">
			{/* Header Section */}
			<div className="mb-12 text-center lg:mb-16 lg:text-left">
				<h2 className="mx-auto max-w-4xl font-semibold text-3xl leading-tight sm:text-4xl lg:mx-0 lg:text-5xl">
					<span className="text-muted-foreground">Everything you need to </span>
					<span className="text-foreground">understand your users</span>
				</h2>
			</div>

			{/* Grid Section */}
			<div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3 lg:gap-10 xl:gap-12">
				{cards.map((card) => (
					<div className="flex" key={card.id}>
						<SciFiGridCard
							description={card.description}
							icon={card.icon}
							title={card.title}
						/>
					</div>
				))}
			</div>
		</div>
	);
};
