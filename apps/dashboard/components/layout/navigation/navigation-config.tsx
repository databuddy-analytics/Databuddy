import {
	BugIcon,
	ChatCircleIcon,
	CodeIcon,
	CurrencyDollarIcon,
	FileTextIcon,
	FunnelIcon,
	GearIcon,
	GlobeIcon,
	HeartIcon,
	HouseIcon,
	// LinkIcon,
	MapPinIcon,
	RobotIcon,
	TargetIcon,
	TestTubeIcon,
	UserIcon,
	UsersIcon,
} from '@phosphor-icons/react';
import type { NavigationSection } from './types';

export const mainNavigation: NavigationSection[] = [
	{
		title: 'Main',
		items: [
			{
				name: 'Websites',
				icon: GlobeIcon,
				href: '/websites',
				rootLevel: true,
				highlight: true,
			},
			{
				name: 'Billing',
				icon: CurrencyDollarIcon,
				href: '/billing',
				rootLevel: true,
				highlight: true,
			},
			{
				name: 'Settings',
				icon: GearIcon,
				href: '/settings',
				rootLevel: true,
				highlight: true,
			},
		],
	},
	// {
	//   title: "Early Access",
	//   items: [
	//     { name: "Revenue", icon: CurrencyDollarIcon, href: "/revenue", rootLevel: true, highlight: true, alpha: true },
	//   ],
	// },
	{
		title: 'Resources',
		items: [
			{
				name: 'Roadmap',
				icon: MapPinIcon,
				href: 'https://trello.com/b/SOUXD4wE/databuddy',
				rootLevel: true,
				external: true,
				highlight: true,
			},
			{
				name: 'Feedback',
				icon: ChatCircleIcon,
				href: 'https://databuddy.featurebase.app/',
				rootLevel: true,
				external: true,
				highlight: true,
			},
		],
	},
];

export const websiteNavigation: NavigationSection[] = [
	{
		title: 'Web Analytics',
		items: [
			{ name: 'Overview', icon: HouseIcon, href: '', highlight: true },
			{ name: 'Sessions', icon: UserIcon, href: '/sessions', highlight: true },
			{ name: 'Errors', icon: BugIcon, href: '/errors', highlight: true },
			{ name: 'Map', icon: MapPinIcon, href: '/map', highlight: true },
		],
	},
	{
		title: 'API Analytics',
		items: [
			{
				name: 'API Metrics',
				icon: CodeIcon,
				href: '/api-analytics',
				highlight: true,
				alpha: true,
				production: false,
			},
		],
	},
	{
		title: 'Product Analytics',
		items: [
			{ name: 'Profiles', icon: UsersIcon, href: '/profiles', highlight: true },
			{ name: 'Funnels', icon: FunnelIcon, href: '/funnels', highlight: true },
			{ name: 'Goals', icon: TargetIcon, href: '/goals', highlight: true },
			// { name: "Journeys", icon: GitBranchIcon, href: "/journeys", highlight: true },
			// { name: "Revenue", icon: CurrencyDollarIcon, href: "/revenue", highlight: true, alpha: true },
		],
	},
	{
		title: 'Engagement',
		items: [
			{
				name: 'Databunny',
				icon: RobotIcon,
				href: '/assistant',
				highlight: true,
				alpha: true,
			},
		],
	},
	{
		title: 'Observability',
		items: [
			{
				name: 'Status',
				icon: HeartIcon,
				href: '/status',
				highlight: true,
				alpha: true,
				production: false,
			},
		],
	},
	{
		title: 'Automation',
		items: [
			{
				name: 'Reports',
				icon: FileTextIcon,
				href: '/reports',
				highlight: true,
				alpha: true,
				production: false,
			},
		],
	},
	// {
	//   title: "Configuration",
	//   items: [{ name: "Settings", icon: GearIcon, href: "/settings", highlight: true }],
	// },
];

export const demoNavigation: NavigationSection[] = [
	{
		title: 'Demo Analytics',
		items: [
			{ name: 'Overview', icon: HouseIcon, href: '', highlight: true },
			{ name: 'Sessions', icon: UserIcon, href: '/sessions', highlight: true },
			{ name: 'Profiles', icon: UsersIcon, href: '/profiles', highlight: true },
			{ name: 'Map', icon: MapPinIcon, href: '/map', highlight: true },
		],
	},
];

export const sandboxNavigation: NavigationSection[] = [
	{
		title: 'Test Pages',
		items: [
			{ name: 'Overview', icon: HouseIcon, href: '', highlight: true },
			{
				name: 'UI Components',
				icon: TestTubeIcon,
				href: '/ui-components',
				highlight: true,
			},
		],
	},
];
