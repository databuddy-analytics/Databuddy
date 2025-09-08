import {
	BookOpenIcon,
	BugIcon,
	BuildingsIcon,
	ChartBarIcon,
	ChartLineIcon,
	ClockIcon,
	CreditCardIcon,
	CurrencyDollarIcon,
	DatabaseIcon,
	EyeIcon,
	FunnelIcon,
	GearIcon,
	GlobeIcon,
	HandEyeIcon,
	HouseIcon,
	IdentificationCardIcon,
	KeyIcon,
	MapPinIcon,
	PlayIcon,
	PlugIcon,
	RabbitIcon,
	RoadHorizonIcon,
	ShieldIcon,
	SparkleIcon,
	SpeakerHighIcon,
	TableIcon,
	TargetIcon,
	TestTubeIcon,
	UserCircleIcon,
	UserIcon,
	UsersIcon,
	UsersThreeIcon,
	WarningIcon,
} from '@phosphor-icons/react';
import type { NavigationSection } from './types';

export const createWebsitesNavigation = (
	websites: Array<{ id: string; name: string | null; domain: string }>
): NavigationSection[] => [
	{
		title: 'Websites',
		icon: GlobeIcon,
		items: [
			{
				name: 'All Websites',
				icon: HouseIcon,
				href: '/websites',
				rootLevel: true,
				highlight: true,
			},
			...(websites.length > 0
				? websites.map((website) => ({
						name: website.name || website.domain,
						icon: GlobeIcon,
						href: `/websites/${website.id}`,
						rootLevel: true,
						highlight: true,
						domain: website.domain,
					}))
				: [
						{
							name: 'Add Your First Website',
							icon: GlobeIcon,
							href: '/websites',
							rootLevel: true,
							highlight: true,
							disabled: true,
						},
					]),
		],
	},
];

export const personalNavigation: NavigationSection[] = [
	{
		title: 'Personal Settings',
		icon: UserCircleIcon,
		items: [
			{
				name: 'Profile',
				icon: IdentificationCardIcon,
				href: '/settings?tab=profile',
				rootLevel: true,
			},
			{
				name: 'Account Settings',
				icon: GearIcon,
				href: '/settings?tab=account',
				rootLevel: true,
			},
			{
				name: 'Privacy & Security',
				icon: ShieldIcon,
				href: '/settings?tab=security',
				rootLevel: true,
			},
			{
				name: 'Personal API Keys',
				icon: KeyIcon,
				href: '/settings?tab=api-keys',
				rootLevel: true,
			},
			{
				name: 'Integrations',
				icon: PlugIcon,
				href: '/settings?tab=integrations',
				rootLevel: true,
			},
		],
	},
];

export const resourcesNavigation: NavigationSection[] = [
	{
		title: 'Resources',
		icon: BookOpenIcon,
		items: [
			{
				name: 'Documentation',
				icon: BookOpenIcon,
				href: 'https://databuddy.cc/docs',
				rootLevel: true,
				external: true,
				highlight: true,
			},
			{
				name: 'Video Guides',
				icon: PlayIcon,
				href: 'https://youtube.com/@trydatabuddy',
				rootLevel: true,
				external: true,
				highlight: true,
			},
			{
				name: 'Roadmap',
				icon: RoadHorizonIcon,
				href: 'https://trello.com/b/SOUXD4wE/databuddy',
				rootLevel: true,
				external: true,
				highlight: true,
			},
			{
				name: 'Feedback',
				icon: SpeakerHighIcon,
				href: 'https://databuddy.featurebase.app/',
				rootLevel: true,
				external: true,
				highlight: true,
			},
		],
	},
];

export const organizationNavigation: NavigationSection[] = [
	{
		title: 'Organizations',
		icon: BuildingsIcon,
		items: [
			{
				name: 'All Organizations',
				icon: BuildingsIcon,
				href: '/organizations',
				rootLevel: true,
			},
		],
	},
	{
		title: 'Team Management',
		icon: UsersThreeIcon,
		items: [
			{
				name: 'Members',
				icon: UserIcon,
				href: '/organizations/members',
				rootLevel: true,
			},
			{
				name: 'Invitations',
				icon: ClockIcon,
				href: '/organizations/invitations',
				rootLevel: true,
			},
		],
	},
	{
		title: 'Organization Settings',
		icon: GearIcon,
		items: [
			{
				name: 'General',
				icon: GearIcon,
				href: '/organizations/settings',
				rootLevel: true,
			},
			{
				name: 'Website Access',
				icon: GlobeIcon,
				href: '/organizations/settings/websites',
				rootLevel: true,
			},
			{
				name: 'API Keys',
				icon: KeyIcon,
				href: '/organizations/settings/api-keys',
				rootLevel: true,
			},
			{
				name: 'Danger Zone',
				icon: WarningIcon,
				href: '/organizations/settings/danger',
				rootLevel: true,
			},
		],
	},
];

export const billingNavigation: NavigationSection[] = [
	{
		title: 'Billing & Usage',
		icon: CreditCardIcon,
		items: [
			{
				name: 'Usage & Metrics',
				icon: ChartBarIcon,
				href: '/billing?tab=overview',
				rootLevel: true,
			},
			{
				name: 'Plans & Pricing',
				icon: CurrencyDollarIcon,
				href: '/billing?tab=plans',
				rootLevel: true,
			},
			{
				name: 'Payment History',
				icon: ClockIcon,
				href: '/billing?tab=history',
				rootLevel: true,
			},
		],
	},
];

export const createDatabasesNavigation = (
	databases: Array<{ id: string; name: string; type: string }>
): NavigationSection[] => [
	{
		title: 'Database Monitoring',
		icon: HandEyeIcon,
		items: [
			{
				name: 'All Connections',
				icon: HouseIcon,
				href: '/observability/database',
				rootLevel: true,
				highlight: true,
			},
			...(databases.length > 0
				? databases.map((database) => ({
						name: database.name,
						icon: DatabaseIcon,
						href: `/observability/database/${database.id}`,
						rootLevel: true,
						highlight: true,
						type: database.type,
					}))
				: [
						{
							name: 'Add Your First Database',
							icon: DatabaseIcon,
							href: '/observability/database',
							rootLevel: true,
							highlight: true,
							disabled: true,
						},
					]),
		],
	},
];

export const observabilityNavigation: NavigationSection[] = [
	{
		title: 'Database Monitoring',
		icon: HandEyeIcon,
		items: [
			{
				name: 'Connections',
				icon: DatabaseIcon,
				href: '/observability/database',
				rootLevel: true,
			},
		],
	},
];

export const databaseNavigation: NavigationSection[] = [
	{
		title: 'Database Monitoring',
		icon: HandEyeIcon,
		items: [
			{ name: 'Overview', icon: EyeIcon, href: '' },
			{ name: 'Performance', icon: ChartLineIcon, href: '/performance' },
			{ name: 'Queries', icon: DatabaseIcon, href: '/queries' },
			{ name: 'Tables', icon: TableIcon, href: '/tables' },
		],
	},
	{
		title: 'Configuration',
		icon: GearIcon,
		items: [
			{
				name: 'Connection Settings',
				icon: PlugIcon,
				href: '/settings',
			},
			{
				name: 'Monitoring Config',
				icon: HandEyeIcon,
				href: '/monitoring',
			},
			{
				name: 'Plugin Marketplace',
				icon: SparkleIcon,
				href: '/plugins',
			},
		],
	},
];

export const websiteNavigation: NavigationSection[] = [
	{
		title: 'Web Analytics',
		icon: ChartBarIcon,
		items: [
			{ name: 'Dashboard', icon: EyeIcon, href: '' },
			{ name: 'Sessions', icon: UserIcon, href: '/sessions' },
			{ name: 'Geographic', icon: MapPinIcon, href: '/map' },
			{ name: 'Errors', icon: BugIcon, href: '/errors' },
		],
	},
	{
		title: 'Product Analytics',
		icon: UsersIcon,
		items: [
			{
				name: 'Profiles',
				icon: UserCircleIcon,
				href: '/profiles',
			},
			{
				name: 'Funnels',
				icon: FunnelIcon,
				href: '/funnels',
			},
			{
				name: 'Goals',
				icon: TargetIcon,
				href: '/goals',
			},
			{
				name: 'Databunny AI',
				icon: RabbitIcon,
				href: '/assistant',
				alpha: true,
			},
		],
	},
];

export const createDemoNavigation = (): NavigationSection[] => [
	{
		title: 'Demo Analytics',
		icon: TestTubeIcon,
		items: [
			{ name: 'Live Demo', icon: EyeIcon, href: '' },
			{ name: 'Sample Sessions', icon: UserIcon, href: '/sessions' },
			{ name: 'User Profiles', icon: UserCircleIcon, href: '/profiles' },
			{ name: 'Location Data', icon: MapPinIcon, href: '/map' },
		],
	},
];

export const categoryConfig = {
	main: {
		categories: [
			{ id: 'websites', name: 'Websites', icon: GlobeIcon, production: true },
			{
				id: 'organizations',
				name: 'Organizations',
				icon: UsersIcon,
				production: true,
			},
			{
				id: 'billing',
				name: 'Billing',
				icon: CreditCardIcon,
				production: true,
			},
			{
				id: 'observability',
				name: 'Observability BETA',
				icon: HandEyeIcon,
				production: false,
			},
			{ id: 'settings', name: 'Settings', icon: GearIcon, production: true },
			{
				id: 'resources',
				name: 'Resources',
				icon: BookOpenIcon,
				production: true,
			},
		],
		defaultCategory: 'websites',
		navigationMap: {
			websites: [],
			organizations: organizationNavigation,
			billing: billingNavigation,
			observability: observabilityNavigation,
			settings: personalNavigation,
			resources: resourcesNavigation,
		},
	},
	website: {
		categories: [
			{
				id: 'analytics',
				name: 'Analytics',
				icon: ChartBarIcon,
				production: true,
			},
		],
		defaultCategory: 'analytics',
		navigationMap: {
			analytics: websiteNavigation, // All analytics sections in one category
		},
	},
	database: {
		categories: [
			{
				id: 'monitoring',
				name: 'Monitoring',
				icon: HandEyeIcon,
				production: false,
			},
		],
		defaultCategory: 'monitoring',
		navigationMap: {
			monitoring: databaseNavigation, // All database sections in one category
		},
	},
	demo: {
		categories: [
			{ id: 'demo', name: 'Demo', icon: TestTubeIcon, production: true },
		],
		defaultCategory: 'demo',
		navigationMap: {
			demo: createDemoNavigation(),
		},
	},
} as const;

export const getContextConfig = (pathname: string) => {
	if (pathname.startsWith('/websites/')) {
		return categoryConfig.website;
	}
	if (
		pathname.startsWith('/observability/database/') &&
		pathname !== '/observability/database' &&
		pathname !== '/observability/database/'
	) {
		return categoryConfig.database;
	}
	if (pathname.startsWith('/demo/')) {
		return categoryConfig.demo;
	}
	return categoryConfig.main;
};

export const getDefaultCategory = (pathname: string) => {
	const config = getContextConfig(pathname);

	if (pathname.startsWith('/organizations')) {
		return 'organizations';
	}
	if (pathname.startsWith('/billing')) {
		return 'billing';
	}
	if (pathname.startsWith('/observability')) {
		return 'observability';
	}
	if (pathname.startsWith('/settings')) {
		return 'settings';
	}

	return config.defaultCategory;
};

export const createLoadingWebsitesNavigation = (): NavigationSection[] => [
	{
		title: 'Websites',
		icon: GlobeIcon,
		items: [
			{
				name: 'All Websites',
				icon: HouseIcon,
				href: '/websites',
				rootLevel: true,
				highlight: true,
			},
			{
				name: 'Loading websites...',
				icon: GlobeIcon,
				href: '/websites',
				rootLevel: true,
				highlight: true,
				disabled: true,
			},
		],
	},
];

export const createLoadingDatabasesNavigation = (): NavigationSection[] => [
	{
		title: 'Database Monitoring',
		icon: HandEyeIcon,
		items: [
			{
				name: 'All Connections',
				icon: HouseIcon,
				href: '/observability/database',
				rootLevel: true,
				highlight: true,
			},
			{
				name: 'Loading databases...',
				icon: DatabaseIcon,
				href: '/observability/database',
				rootLevel: true,
				highlight: true,
				disabled: true,
			},
		],
	},
];
