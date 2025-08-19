export interface ComparisonFeature {
	name: string;
	databuddy: boolean;
	competitor: boolean;
	benefit: string;
	category?: 'privacy' | 'performance' | 'features' | 'pricing' | 'technical';
}

export interface CompetitorInfo {
	name: string;
	slug: string;
	description: string;
	website: string;
	logo?: string;
	tagline: string;
	color: string;
	pricing: {
		starting: string;
		note?: string;
	};
}

export interface ComparisonData {
	competitor: CompetitorInfo;
	features: ComparisonFeature[];
	hero: {
		title: string;
		description: string;
		cta: string;
	};
	seo: {
		title: string;
		description: string;
	};
}

export const competitors: Record<string, ComparisonData> = {
	plausible: {
		competitor: {
			name: 'Plausible',
			slug: 'plausible',
			description: 'Privacy-focused web analytics',
			website: 'https://plausible.io',
			tagline: 'Simple and privacy-friendly Google Analytics alternative',
			color: '#5850EC',
			pricing: {
				starting: '$9/month',
				note: 'For 10K monthly pageviews',
			},
		},
		hero: {
			title: 'Databuddy vs Plausible',
			description:
				'Both prioritize privacy, but Databuddy offers AI-powered insights, better performance, and data ownership at a lower cost.',
			cta: 'Choose the smarter alternative',
		},
		seo: {
			title: 'Databuddy vs Plausible: Complete Analytics Comparison 2024',
			description:
				'Compare Databuddy and Plausible analytics platforms. See why Databuddy offers better performance, AI insights, and data ownership at a lower cost.',
		},
		features: [
			{
				name: 'Cookie-free tracking',
				databuddy: true,
				competitor: true,
				benefit: 'No consent banners needed, higher data accuracy',
				category: 'privacy',
			},
			{
				name: 'GDPR Compliant by default',
				databuddy: true,
				competitor: true,
				benefit: 'Reduced legal risk and compliance costs',
				category: 'privacy',
			},
			{
				name: '65x faster script',
				databuddy: true,
				competitor: false,
				benefit: 'Better Core Web Vitals and SEO rankings',
				category: 'performance',
			},
			{
				name: 'Data ownership',
				databuddy: true,
				competitor: true,
				benefit: 'Full control of your valuable business data',
				category: 'privacy',
			},
			{
				name: 'Export raw data',
				databuddy: true,
				competitor: false,
				benefit: 'Integrate with your existing business tools',
				category: 'features',
			},
			{
				name: 'AI-powered insights',
				databuddy: true,
				competitor: false,
				benefit: 'Predictive analytics and automated recommendations',
				category: 'features',
			},
			{
				name: 'Real-time analytics',
				databuddy: true,
				competitor: true,
				benefit: 'Make data-driven decisions instantly',
				category: 'features',
			},
			{
				name: 'Self-hosting option',
				databuddy: true,
				competitor: true,
				benefit: 'Complete control over your infrastructure',
				category: 'technical',
			},
			{
				name: 'Advanced event tracking',
				databuddy: true,
				competitor: false,
				benefit: 'Track custom user interactions and conversions',
				category: 'features',
			},
			{
				name: 'Multiple domains',
				databuddy: true,
				competitor: true,
				benefit: 'Manage multiple websites from one dashboard',
				category: 'features',
			},
			{
				name: 'API access',
				databuddy: true,
				competitor: true,
				benefit: 'Build custom integrations and dashboards',
				category: 'technical',
			},
			{
				name: 'Team collaboration',
				databuddy: true,
				competitor: true,
				benefit: 'Share insights across your organization',
				category: 'features',
			},
			{
				name: 'Custom dashboards',
				databuddy: true,
				competitor: false,
				benefit: 'Tailor analytics to your specific needs',
				category: 'features',
			},
			{
				name: 'Funnels & goals',
				databuddy: true,
				competitor: true,
				benefit: 'Track conversion paths and key metrics',
				category: 'features',
			},
			{
				name: 'Transparent pricing',
				databuddy: true,
				competitor: true,
				benefit: 'No hidden costs or surprise charges',
				category: 'pricing',
			},
		],
	},
	'google-analytics': {
		competitor: {
			name: 'Google Analytics',
			slug: 'google-analytics',
			description: "Google's web analytics platform",
			website: 'https://analytics.google.com',
			tagline: 'The most popular web analytics platform',
			color: '#4285F4',
			pricing: {
				starting: 'Free',
				note: 'With data sampling and limits',
			},
		},
		hero: {
			title: 'Databuddy vs Google Analytics',
			description:
				'Get the power of enterprise analytics without privacy concerns, complex setup, or data sampling limitations.',
			cta: 'Switch to privacy-first analytics',
		},
		seo: {
			title: 'Databuddy vs Google Analytics: Privacy-First Alternative 2024',
			description:
				'Compare Databuddy and Google Analytics. Discover why businesses are switching to privacy-first analytics with better performance and data ownership.',
		},
		features: [
			{
				name: 'Cookie-free tracking',
				databuddy: true,
				competitor: false,
				benefit: 'No consent banners needed, higher data accuracy',
				category: 'privacy',
			},
			{
				name: 'GDPR Compliant by default',
				databuddy: true,
				competitor: false,
				benefit: 'Reduced legal risk and compliance costs',
				category: 'privacy',
			},
			{
				name: '65x faster script',
				databuddy: true,
				competitor: false,
				benefit: 'Better Core Web Vitals and SEO rankings',
				category: 'performance',
			},
			{
				name: 'Data ownership',
				databuddy: true,
				competitor: false,
				benefit: 'Full control of your valuable business data',
				category: 'privacy',
			},
			{
				name: 'No data sampling',
				databuddy: true,
				competitor: false,
				benefit: 'Get accurate data for all traffic volumes',
				category: 'features',
			},
			{
				name: 'Simple setup',
				databuddy: true,
				competitor: false,
				benefit: 'Start tracking in minutes, not hours',
				category: 'features',
			},
			{
				name: 'Real-time analytics',
				databuddy: true,
				competitor: true,
				benefit: 'Make data-driven decisions instantly',
				category: 'features',
			},
			{
				name: 'Advanced event tracking',
				databuddy: true,
				competitor: true,
				benefit: 'Track custom user interactions and conversions',
				category: 'features',
			},
			{
				name: 'Custom reports',
				databuddy: true,
				competitor: true,
				benefit: 'Create reports tailored to your needs',
				category: 'features',
			},
			{
				name: 'No ads influence',
				databuddy: true,
				competitor: false,
				benefit: 'Pure analytics without advertising bias',
				category: 'privacy',
			},
			{
				name: 'Predictable costs',
				databuddy: true,
				competitor: false,
				benefit: 'Clear pricing without hidden enterprise fees',
				category: 'pricing',
			},
			{
				name: 'Export raw data',
				databuddy: true,
				competitor: false,
				benefit: 'Integrate with your existing business tools',
				category: 'features',
			},
			{
				name: 'AI-powered insights',
				databuddy: true,
				competitor: false,
				benefit: 'Automated recommendations and predictions',
				category: 'features',
			},
			{
				name: 'Multiple domains',
				databuddy: true,
				competitor: true,
				benefit: 'Manage multiple websites from one dashboard',
				category: 'features',
			},
			{
				name: 'API access',
				databuddy: true,
				competitor: true,
				benefit: 'Build custom integrations and dashboards',
				category: 'technical',
			},
		],
	},
	fathom: {
		competitor: {
			name: 'Fathom Analytics',
			slug: 'fathom',
			description: 'Simple, privacy-focused website analytics',
			website: 'https://usefathom.com',
			tagline:
				"Google Analytics alternative that doesn't compromise visitor privacy",
			color: '#8B5A3C',
			pricing: {
				starting: '$14/month',
				note: 'For 100K monthly pageviews',
			},
		},
		hero: {
			title: 'Databuddy vs Fathom Analytics',
			description:
				'Both respect privacy, but Databuddy offers superior performance, AI insights, and data ownership at better value.',
			cta: 'Get more for less',
		},
		seo: {
			title: 'Databuddy vs Fathom Analytics: Feature & Price Comparison 2024',
			description:
				'Compare Databuddy and Fathom Analytics. See why Databuddy offers better performance, more features, and superior value for privacy-first analytics.',
		},
		features: [
			{
				name: 'Cookie-free tracking',
				databuddy: true,
				competitor: true,
				benefit: 'No consent banners needed, higher data accuracy',
				category: 'privacy',
			},
			{
				name: 'GDPR Compliant by default',
				databuddy: true,
				competitor: true,
				benefit: 'Reduced legal risk and compliance costs',
				category: 'privacy',
			},
			{
				name: '65x faster script',
				databuddy: true,
				competitor: false,
				benefit: 'Better Core Web Vitals and SEO rankings',
				category: 'performance',
			},
			{
				name: 'Data ownership',
				databuddy: true,
				competitor: false,
				benefit: 'Full control of your valuable business data',
				category: 'privacy',
			},
			{
				name: 'Export raw data',
				databuddy: true,
				competitor: false,
				benefit: 'Integrate with your existing business tools',
				category: 'features',
			},
			{
				name: 'AI-powered insights',
				databuddy: true,
				competitor: false,
				benefit: 'Predictive analytics and automated recommendations',
				category: 'features',
			},
			{
				name: 'Real-time analytics',
				databuddy: true,
				competitor: true,
				benefit: 'Make data-driven decisions instantly',
				category: 'features',
			},
			{
				name: 'Advanced event tracking',
				databuddy: true,
				competitor: false,
				benefit: 'Track custom user interactions and conversions',
				category: 'features',
			},
			{
				name: 'Custom dashboards',
				databuddy: true,
				competitor: false,
				benefit: 'Tailor analytics to your specific needs',
				category: 'features',
			},
			{
				name: 'Team collaboration',
				databuddy: true,
				competitor: true,
				benefit: 'Share insights across your organization',
				category: 'features',
			},
			{
				name: 'API access',
				databuddy: true,
				competitor: true,
				benefit: 'Build custom integrations and dashboards',
				category: 'technical',
			},
			{
				name: 'Self-hosting option',
				databuddy: true,
				competitor: false,
				benefit: 'Complete control over your infrastructure',
				category: 'technical',
			},
			{
				name: 'Multiple domains',
				databuddy: true,
				competitor: true,
				benefit: 'Manage multiple websites from one dashboard',
				category: 'features',
			},
			{
				name: 'Funnels & goals',
				databuddy: true,
				competitor: false,
				benefit: 'Track conversion paths and key metrics',
				category: 'features',
			},
			{
				name: 'Better pricing',
				databuddy: true,
				competitor: false,
				benefit: 'More features at a lower cost per pageview',
				category: 'pricing',
			},
		],
	},
};

export function getComparisonData(slug: string): ComparisonData | null {
	return competitors[slug] || null;
}

export function getAllCompetitorSlugs(): string[] {
	return Object.keys(competitors);
}
