import {
	EyeIcon,
	GearIcon,
	PlusIcon,
	ChartBarIcon,
	ChartLineUpIcon,
	ChartPieIcon,
	TrendUpIcon,
	ActivityIcon,
	PulseIcon,
	UserIcon,
	UserCircleIcon,
	UsersThreeIcon,
	UserGearIcon,
	IdentificationCardIcon,
	GlobeIcon,
	GlobeSimpleIcon,
	BuildingsIcon,
	MonitorIcon,
	NetworkIcon,
	BookOpenIcon,
	PlayIcon,
	RoadHorizonIcon,
	SpeakerHighIcon,
	ShieldCheckIcon,
	KeyIcon,
	PlugIcon,
	DatabaseIcon,
	TableIcon,
	FileArrowDownIcon,
	MagnifyingGlassIcon,
	CreditCardIcon,
	CurrencyDollarIcon,
	ReceiptIcon,
	StorefrontIcon,
	FlagIcon,
	FunnelIcon,
	TargetIcon,
	RobotIcon,
	LightningIcon,
	BugIcon,
	MapPinIcon,
	WarningIcon,
	CalendarIcon,
	ArrowSquareOutIcon,
} from '@phosphor-icons/react';
import type { Category, NavigationSection } from './types';
	
const createNavItem = (
	name: string,
	icon: any,
	href: string,
	options: Record<string, any> = {}
) => ({
	name,
	icon,
	href,
	rootLevel: true,
	...options,
});

const createNavSection = (
	title: string,
	icon: any,
	items: NavigationSection['items']
): NavigationSection => ({
	title,
	icon,
	items,
});

export const filterCategoriesForRoute = (categories: Category[], pathname: string) => {
	const isDemo = pathname.startsWith('/demo');
	return categories.filter(category => !(category.hideFromDemo && isDemo));
};

const createDynamicNavigation = <T extends { id: string; name: string | null }>(
	items: T[],
	title: string,
	titleIcon: any,
	overviewName: string,
	overviewHref: string,
	itemIcon: any,
	itemHrefPrefix: string,
	emptyText: string,
	extraProps?: (item: T) => Record<string, any>
): NavigationSection[] => [
	createNavSection(title, titleIcon, [
		createNavItem(overviewName, ChartBarIcon, overviewHref, { highlight: true }),
		...(items.length > 0
			? items.map(item => 
				createNavItem(item.name || '', itemIcon, `${itemHrefPrefix}/${item.id}`, {
					highlight: true,
					...(extraProps?.(item) || {}),
				})
			)
			: [createNavItem(emptyText, PlusIcon, overviewHref, { highlight: true, disabled: true })]
		),
	]),
];

export const createWebsitesNavigation = (
	websites: Array<{ id: string; name: string | null; domain: string }>
): NavigationSection[] => 
	createDynamicNavigation(
		websites,
		'Websites',
		GlobeSimpleIcon,
		'Website Overview',
		'/websites',
		GlobeIcon,
		'/websites',
		'Add Your First Website',
		(website) => ({ domain: website.domain })
	);

export const personalNavigation: NavigationSection[] = [
	createNavSection('Personal Settings', UserGearIcon, [
		createNavItem('Profile', IdentificationCardIcon, '/settings?tab=profile'),
		createNavItem('Account', GearIcon, '/settings?tab=account'),
		createNavItem('Security', ShieldCheckIcon, '/settings?tab=security'),
		createNavItem('API Keys', KeyIcon, '/settings?tab=api-keys'),
		createNavItem('Integrations', PlugIcon, '/settings?tab=integrations'),
	]),
];

export const resourcesNavigation: NavigationSection[] = [
	createNavSection('Resources', BookOpenIcon, [
		createNavItem('Documentation', BookOpenIcon, 'https://databuddy.cc/docs', { external: true, highlight: true }),
		createNavItem('Video Guides', PlayIcon, 'https://youtube.com/@trydatabuddy', { external: true, highlight: true }),
		createNavItem('Roadmap', RoadHorizonIcon, 'https://trello.com/b/SOUXD4wE/databuddy', { external: true, highlight: true }),
		createNavItem('Feedback', SpeakerHighIcon, 'https://databuddy.featurebase.app/', { external: true, highlight: true }),
	]),
];

export const organizationNavigation: NavigationSection[] = [
	createNavSection('Organizations', BuildingsIcon, [
		createNavItem('Organization Overview', ChartPieIcon, '/organizations'),
	]),
	createNavSection('Team Management', UsersThreeIcon, [
		createNavItem('Members', UserIcon, '/organizations/members'),
		createNavItem('Invitations', CalendarIcon, '/organizations/invitations'),
	]),
	createNavSection('Organization Settings', GearIcon, [
		createNavItem('General', GearIcon, '/organizations/settings'),
		createNavItem('Website Access', GlobeSimpleIcon, '/organizations/settings/websites'),
		createNavItem('API Keys', KeyIcon, '/organizations/settings/api-keys'),
		createNavItem('Danger Zone', WarningIcon, '/organizations/settings/danger'),
	]),
];

export const billingNavigation: NavigationSection[] = [
	createNavSection('Billing & Usage', CreditCardIcon, [
		createNavItem('Usage Overview', ActivityIcon, '/billing?tab=overview'),
		createNavItem('Plans & Pricing', CurrencyDollarIcon, '/billing?tab=plans'),
		createNavItem('Payment History', ReceiptIcon, '/billing?tab=history'),
		createNavItem('Cost Breakdown', ChartLineUpIcon, '/billing/cost-breakdown', {
			badge: { text: 'Experimental', variant: 'purple' as const },
		}),
	]),
];

export const createDatabasesNavigation = (
	databases: Array<{ id: string; name: string; type: string }>
): NavigationSection[] => 
	createDynamicNavigation(
		databases,
		'Database Monitoring',
		MonitorIcon,
		'Database Overview',
		'/observability/database',
		DatabaseIcon,
		'/observability/database',
		'Add Your First Database',
		(database) => ({ type: database.type })
	);

export const observabilityNavigation: NavigationSection[] = [
	createNavSection('Database Monitoring', MonitorIcon, [
		createNavItem('Database Connections', NetworkIcon, '/observability/database'),
	]),
];

export const databaseNavigation: NavigationSection[] = [
	createNavSection('Database Monitoring', MonitorIcon, [
		createNavItem('Overview', EyeIcon, '', { rootLevel: false }),
		createNavItem('Performance', PulseIcon, '/performance', { rootLevel: false }),
		createNavItem('Queries', MagnifyingGlassIcon, '/queries', { rootLevel: false }),
		createNavItem('Tables', TableIcon, '/tables', { rootLevel: false }),
		createNavItem('Online Advisor', LightningIcon, '/online-advisor', { rootLevel: false }),
	]),
	createNavSection('Configuration', GearIcon, [
		createNavItem('Connection Settings', PlugIcon, '/settings', { rootLevel: false }),
		createNavItem('Monitoring Settings', MonitorIcon, '/monitoring', { rootLevel: false }),
		createNavItem('Plugin Marketplace', StorefrontIcon, '/plugins', { rootLevel: false }),
	]),
];

export const websiteNavigation: NavigationSection[] = [
	createNavSection('Web Analytics', ChartBarIcon, [
		createNavItem('Dashboard', EyeIcon, '', { rootLevel: false }),
		createNavItem('Geographic Data', MapPinIcon, '/map', { rootLevel: false }),
		createNavItem('Error Tracking', BugIcon, '/errors', { rootLevel: false }),
	]),
	createNavSection('Product Analytics', TrendUpIcon, [
		createNavItem('Users', UsersThreeIcon, '/users', { rootLevel: false }),
		createNavItem('Funnels', FunnelIcon, '/funnels', { rootLevel: false }),
		createNavItem('Goals', TargetIcon, '/goals', { rootLevel: false }),
		createNavItem('Feature Flags', FlagIcon, '/flags', { alpha: true, rootLevel: false }),
		createNavItem('Databunny AI', RobotIcon, '/assistant', { alpha: true, hideFromDemo: true, rootLevel: false }),
	]),
];

export const websiteSettingsNavigation: NavigationSection[] = [
	createNavSection('Website Settings', GearIcon, [
		createNavItem('General Settings', GearIcon, '/settings/general', { rootLevel: false }),
		createNavItem('Privacy Settings', ShieldCheckIcon, '/settings/privacy', { rootLevel: false }),
		createNavItem('Transfer Website', ArrowSquareOutIcon, '/settings/transfer', { rootLevel: false }),
		createNavItem('Data Export', FileArrowDownIcon, '/settings/export', { rootLevel: false }),
	]),
];

const createCategoryConfig = (
	categories: Category[],
	defaultCategory: string,
	navigationMap: Record<string, NavigationSection[]>
) => ({ categories, defaultCategory, navigationMap });

export const categoryConfig = {
	main: createCategoryConfig(
		[
			{ id: 'websites', name: 'Websites', icon: GlobeSimpleIcon, production: true },
			{ id: 'organizations', name: 'Organizations', icon: BuildingsIcon, production: true },
			{ id: 'billing', name: 'Billing', icon: CreditCardIcon, production: true },
			{ id: 'observability', name: 'Observability BETA', icon: MonitorIcon, production: false },
			{ id: 'settings', name: 'Settings', icon: GearIcon, production: true, hideFromDemo: true },
			{ id: 'resources', name: 'Resources', icon: BookOpenIcon, production: true },
		],
		'websites',
		{
			websites: [],
			organizations: organizationNavigation,
			billing: billingNavigation,
			observability: observabilityNavigation,
			settings: personalNavigation,
			resources: resourcesNavigation,
		}
	),
	website: createCategoryConfig(
		[
			{ id: 'analytics', name: 'Analytics', icon: ChartBarIcon, production: true },
			{ id: 'settings', name: 'Settings', icon: GearIcon, production: true, hideFromDemo: true },
		],
		'analytics',
		{
			analytics: websiteNavigation,
			settings: websiteSettingsNavigation,
		}
	),
	database: createCategoryConfig(
		[
			{ id: 'monitoring', name: 'Monitoring', icon: MonitorIcon, production: false },
		],
		'monitoring',
		{
			monitoring: databaseNavigation,
		}
	),
};

const PATH_CONFIG_MAP = [
	{ pattern: ['/websites/', '/demo/'], config: 'website' as const },
	{ pattern: ['/observability/database/'], config: 'database' as const, exclude: ['/observability/database', '/observability/database/'] },
] as const;

const CATEGORY_PATH_MAP = [
	{ pattern: '/organizations', category: 'organizations' as const },
	{ pattern: '/billing', category: 'billing' as const },
	{ pattern: '/observability', category: 'observability' as const },
	{ pattern: '/settings', category: 'settings' as const },
] as const;

export const getContextConfig = (pathname: string) => {
	for (const item of PATH_CONFIG_MAP) {
		if (item.pattern.some(p => pathname.startsWith(p))) {
			if (!('exclude' in item) || !item.exclude.some((e: string) => pathname === e)) {
				return categoryConfig[item.config];
			}
		}
	}
	return categoryConfig.main;
};

export const getDefaultCategory = (pathname: string) => {
	for (const { pattern, category } of CATEGORY_PATH_MAP) {
		if (pathname.startsWith(pattern)) {
			return category;
		}
	}
	return getContextConfig(pathname).defaultCategory;
};

const createLoadingNavigation = (
	title: string,
	titleIcon: any,
	overviewName: string,
	overviewHref: string,
	loadingName: string,
	loadingIcon: any
): NavigationSection[] => [
	createNavSection(title, titleIcon, [
		createNavItem(overviewName, ChartBarIcon, overviewHref, { highlight: true }),
		createNavItem(loadingName, loadingIcon, overviewHref, { highlight: true, disabled: true }),
	]),
];

export const createLoadingWebsitesNavigation = (): NavigationSection[] => 
	createLoadingNavigation('Websites', GlobeSimpleIcon, 'Website Overview', '/websites', 'Loading websites...', GlobeIcon);

export const createLoadingDatabasesNavigation = (): NavigationSection[] => 
	createLoadingNavigation('Database Monitoring', MonitorIcon, 'Database Overview', '/observability/database', 'Loading databases...', DatabaseIcon);
