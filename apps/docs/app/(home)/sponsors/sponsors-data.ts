export interface Sponsor {
	id: string;
	name: string;
	logo: string;
	website: string;
	tier: 'platinum' | 'gold' | 'silver' | 'bronze';
	description?: string;
	disabled?: boolean;
}

export interface HonorableMention {
	id: string;
	name: string;
	logo: string;
	website: string;
	description: string;
	supportType:
		| 'Free Plan'
		| 'Open Source'
		| 'Community Support'
		| 'Educational';
}

// Sample sponsors data - replace with real data
export const sponsors: Sponsor[] = [
	{
		id: 'neon',
		name: 'Neon',
		logo: 'neon.svg',
		website: 'https://neon.tech',
		tier: 'bronze',
		description: 'Neon is a modern database for the cloud era.',
	},
	{
		id: 'upstash',
		name: 'Upstash',
		logo: 'upstash.svg',
		website: 'https://upstash.com',
		tier: 'silver',
		description: 'Modern Serverless Data Platform for Developers',
		disabled: true,
	},
];

export const honorableMentions: HonorableMention[] = [
	{
		id: 'coderabbit',
		name: 'CodeRabbit',
		logo: 'coderabbit.svg',
		website: 'https://coderabbit.ai',
		description: 'AI-powered code reviews with comprehensive OSS plan',
		supportType: 'Free Plan',
	},
];

const activeSponsors = sponsors.filter((s) => !s.disabled);

export const sponsorStats = {
	totalSponsors: activeSponsors.length,
	featuredSponsors: activeSponsors.filter(
		(s) => s.tier === 'platinum' || s.tier === 'gold'
	).length,
};
