import {
	AtomIcon,
	BookOpenIcon,
	ChartBarIcon,
	ChartLineIcon,
	CodeIcon,
	CreditCardIcon,
	DatabaseIcon,
	FileTextIcon,
	GlobeIcon,
	GoogleLogoIcon,
	type IconWeight,
	KeyIcon,
	LightningIcon,
	LockIcon,
	MonitorIcon,
	PaletteIcon,
	PlugIcon,
	RocketIcon,
	ShieldCheckIcon,
	ShieldStarIcon,
	ShoppingCartIcon,
	SpeedometerIcon,
	TrendUpIcon,
	UserCheckIcon,
} from '@phosphor-icons/react';

export interface SidebarItem {
	title: string;
	href?: string;
	icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
	isNew?: boolean;
	group?: boolean;
}

export interface SidebarSection {
	title: string;
	Icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
	isNew?: boolean;
	list: SidebarItem[];
}

export const contents: SidebarSection[] = [
	{
		title: 'Introduction',
		Icon: BookOpenIcon,
		list: [
			{
				title: 'Overview',
				href: '/docs',
				icon: FileTextIcon,
			},
			{
				title: 'Getting Started',
				href: '/docs/getting-started',
				icon: RocketIcon,
			},
		],
	},
	{
		title: 'Implementation',
		Icon: CodeIcon,
		list: [
			{
				title: 'SDK',
				href: '/docs/sdk',
				icon: AtomIcon,
			},
			{
				title: 'API',
				href: '/docs/api',
				icon: DatabaseIcon,
			},
			{
				title: 'API Keys',
				href: '/docs/api-keys',
				icon: KeyIcon,
			},
		],
	},
	{
		title: 'Integrations',
		Icon: PlugIcon,
		list: [
			{
				title: 'React',
				href: '/docs/integrations/react',
				icon: AtomIcon,
			},
			{
				title: 'Next.js',
				href: '/docs/integrations/nextjs',
				icon: LightningIcon,
			},
			{
				title: 'WordPress',
				href: '/docs/integrations/wordpress',
				icon: GlobeIcon,
			},
			{
				title: 'Shopify',
				href: '/docs/integrations/shopify',
				icon: ShoppingCartIcon,
			},
			{
				title: 'Stripe',
				href: '/docs/integrations/stripe',
				icon: CreditCardIcon,
			},
			{
				title: 'Framer',
				href: '/docs/integrations/framer',
				icon: PaletteIcon,
			},
			{
				title: 'Google Tag Manager',
				href: '/docs/integrations/gtm',
				icon: GoogleLogoIcon,
			},
		],
	},
	{
		title: 'Dashboard & Analytics',
		Icon: ChartBarIcon,
		list: [
			{
				title: 'Dashboard',
				href: '/docs/dashboard',
				icon: MonitorIcon,
			},
			{
				title: 'Comparisons',
				href: '/docs/comparisons',
				icon: ChartLineIcon,
			},
		],
	},
	{
		title: 'Privacy & Compliance',
		Icon: ShieldCheckIcon,
		list: [
			{
				title: 'GDPR Compliance',
				href: '/docs/compliance/gdpr-compliance-guide',
				icon: ShieldStarIcon,
			},
			{
				title: 'Cookieless Analytics',
				href: '/docs/privacy/cookieless-analytics-guide',
				icon: UserCheckIcon,
			},
		],
	},
	{
		title: 'Performance',
		Icon: TrendUpIcon,
		list: [
			{
				title: 'Core Web Vitals',
				href: '/docs/performance/core-web-vitals-guide',
				icon: SpeedometerIcon,
			},
		],
	},
	{
		title: 'Security',
		Icon: LockIcon,
		list: [
			{
				title: 'Security Guide',
				href: '/docs/security',
				icon: ShieldCheckIcon,
			},
		],
	},
];

export const examples: SidebarSection[] = [
	{
		title: 'Examples',
		Icon: CodeIcon,
		list: [
			{
				title: 'Coming Soon',
				group: true,
				icon: FileTextIcon,
			},
		],
	},
];
