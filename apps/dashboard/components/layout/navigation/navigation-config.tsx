import {
	BookOpenIcon,
	BugIcon,
	BuildingsIcon,
	ChartBarIcon,
	ClockIcon,
	CreditCardIcon,
	CurrencyDollarIcon,
	EyeIcon,
	FunnelIcon,
	GearIcon,
	GlobeIcon,
	HouseIcon,
	IdentificationCardIcon,
	KeyIcon,
	MapPinIcon,
	PlayIcon,
	RabbitIcon,
	RoadHorizonIcon,
	ShieldIcon,
	SpeakerHighIcon,
	TargetIcon,
	TestTubeIcon,
	UserCircleIcon,
	UserIcon,
	UsersIcon,
	UsersThreeIcon,
} from '@phosphor-icons/react';
import type { NavigationSection } from './types';

// Function to create dynamic websites navigation
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

// Personal settings and preferences
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
			{
				name: 'Overview',
				icon: ChartBarIcon,
				href: '/organizations?tab=organizations',
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
				href: '/organizations?view=members',
				rootLevel: true,
			},
			{
				name: 'Invitations',
				icon: ClockIcon,
				href: '/organizations?view=invitations',
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
				href: '/organizations?settings=general',
				rootLevel: true,
			},
			{
				name: 'Website Access',
				icon: GlobeIcon,
				href: '/organizations?settings=websites',
				rootLevel: true,
			},
			{
				name: 'API Keys',
				icon: KeyIcon,
				href: '/organizations?settings=apikeys',
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

// Generate demo navigation from website navigation (filtered for demo purposes)
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
			{ id: 'websites', name: 'Websites', icon: GlobeIcon },
			{ id: 'organizations', name: 'Organizations', icon: UsersIcon },
			{ id: 'billing', name: 'Billing', icon: CreditCardIcon },
			{ id: 'settings', name: 'Settings', icon: GearIcon },
			{ id: 'resources', name: 'Resources', icon: BookOpenIcon },
		],
		defaultCategory: 'websites',
		navigationMap: {
			websites: [],
			organizations: organizationNavigation,
			billing: billingNavigation,
			settings: personalNavigation,
			resources: resourcesNavigation,
		},
	},
	website: {
		categories: [{ id: 'analytics', name: 'Analytics', icon: ChartBarIcon }],
		defaultCategory: 'analytics',
		navigationMap: {
			analytics: websiteNavigation, // All analytics sections in one category
		},
	},
	demo: {
		categories: [{ id: 'demo', name: 'Demo', icon: TestTubeIcon }],
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
	if (pathname.startsWith('/settings')) {
		return 'settings';
	}

	return config.defaultCategory;
};

// Function to create loading navigation for websites
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

export const getNavigationWithWebsites = (
	pathname: string,
	websites: Array<{ id: string; name: string | null; domain: string }> = [],
	isLoading = false
) => {
	const config = getContextConfig(pathname);

	if (config === categoryConfig.main) {
		return {
			...config,
			navigationMap: {
				...config.navigationMap,
				websites: isLoading
					? createLoadingWebsitesNavigation()
					: createWebsitesNavigation(websites),
			},
		};
	}

	return config;
};
