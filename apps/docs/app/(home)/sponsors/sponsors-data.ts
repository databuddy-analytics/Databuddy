export interface Sponsor {
	description?: string;
	disabled?: boolean;
	id: string;
	logo: string;
	name: string;
	tier: "platinum" | "gold" | "silver" | "bronze";
	website: string;
}

export interface HonorableMention {
	description: string;
	id: string;
	logo: string;
	name: string;
	supportType:
		| "Free Plan"
		| "Open Source"
		| "Community Support"
		| "Educational";
	website: string;
}

export const sponsors: Sponsor[] = [
	{
		id: "neon",
		name: "Neon",
		logo: "neon.svg",
		website: "https://neon.tech",
		tier: "bronze",
		description: "Neon is a modern database for the cloud era.",
	},
	{
		id: "upstash",
		name: "Upstash",
		logo: "upstash.svg",
		website: "https://upstash.com",
		tier: "silver",
		description: "Modern Serverless Data Platform for Developers",
	},
];

export const honorableMentions: HonorableMention[] = [
	{
		id: "coderabbit",
		name: "CodeRabbit",
		logo: "coderabbit.svg",
		website: "https://coderabbit.ai",
		description: "AI-powered code reviews with comprehensive OSS plan",
		supportType: "Free Plan",
	},
];

const activeSponsors = sponsors.filter((s) => !s.disabled);

export const sponsorStats = {
	totalSponsors: activeSponsors.length,
	featuredSponsors: activeSponsors.filter(
		(s) => s.tier === "platinum" || s.tier === "gold"
	).length,
};
