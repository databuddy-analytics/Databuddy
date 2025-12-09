import {
	ActivityIcon,
	ArrowSquareOutIcon,
	BellIcon,
	BookOpenIcon,
	BugIcon,
	BuildingsIcon,
	CalendarIcon,
	ChartBarIcon,
	ChartLineUpIcon,
	ChartPieIcon,
	CreditCardIcon,
	CurrencyDollarIcon,
	EyeIcon,
	FileArrowDownIcon,
	FlagIcon,
	FunnelIcon,
	GearIcon,
	GlobeIcon,
	GlobeSimpleIcon,
	HeartbeatIcon,
	IdentificationCardIcon,
	KeyIcon,
	MapPinIcon,
	PlayIcon,
	PlugIcon,
	PlusIcon,
	ReceiptIcon,
	RepeatIcon,
	RoadHorizonIcon,
	RobotIcon,
	ShieldCheckIcon,
	SpeakerHighIcon,
	TargetIcon,
	TrendUpIcon,
	UserGearIcon,
	UserIcon,
	UsersThreeIcon,
	WarningIcon,
} from "@phosphor-icons/react";
import { GATED_FEATURES } from "@/types/features";
import type { Category, NavigationSection } from "./types";

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
	items: NavigationSection["items"],
	options: Partial<NavigationSection> = {}
): NavigationSection => ({
	title,
	icon,
	items,
	...options,
});

export const filterCategoriesForRoute = (
	categories: Category[],
	pathname: string
) => {
	const isDemo = pathname.startsWith("/demo");
	return categories.filter((category) => !(category.hideFromDemo && isDemo));
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
		createNavItem(overviewName, ChartBarIcon, overviewHref, {
			highlight: true,
		}),
		...(items.length > 0
			? items.map((item) =>
					createNavItem(
						item.name || "",
						itemIcon,
						`${itemHrefPrefix}/${item.id}`,
						{
							highlight: true,
							...(extraProps?.(item) || {}),
						}
					)
				)
			: [
					createNavItem(emptyText, PlusIcon, overviewHref, {
						highlight: true,
						disabled: true,
					}),
				]),
	]),
];

export const createWebsitesNavigation = (
	websites: Array<{ id: string; name: string | null; domain: string }>
): NavigationSection[] =>
	createDynamicNavigation(
		websites,
		"Websites",
		GlobeSimpleIcon,
		"Website Overview",
		"/websites",
		GlobeIcon,
		"/websites",
		"Add Your First Website",
		(website) => ({ domain: website.domain })
	);

export const personalNavigation: NavigationSection[] = [
	createNavSection("Personal", UserGearIcon, [
		createNavItem("Account", IdentificationCardIcon, "/settings/account"),
		createNavItem("Appearance", EyeIcon, "/settings/appearance"),
		createNavItem("Privacy & Data", ShieldCheckIcon, "/settings/privacy", {
			disabled: true,
			tag: "soon",
		}),
	]),
	createNavSection("Preferences", GearIcon, [
		createNavItem(
			"Analytics Behavior",
			ChartLineUpIcon,
			"/settings/analytics",
			{
				disabled: true,
				tag: "soon",
			}
		),
		createNavItem("Feature Access", FlagIcon, "/settings/features", {
			disabled: true,
			tag: "soon",
		}),
		createNavItem("Integrations", PlugIcon, "/settings/integrations", {
			disabled: true,
			tag: "soon",
		}),
		createNavItem("Notifications", BellIcon, "/settings/notifications", {
			disabled: true,
			tag: "soon",
		}),
	]),
];

export const resourcesNavigation: NavigationSection[] = [
	createNavSection("Resources", BookOpenIcon, [
		createNavItem("Documentation", BookOpenIcon, "https://databuddy.cc/docs", {
			external: true,
			highlight: true,
		}),
		createNavItem(
			"Video Guides",
			PlayIcon,
			"https://youtube.com/@trydatabuddy",
			{ external: true, highlight: true }
		),
		createNavItem(
			"Roadmap",
			RoadHorizonIcon,
			"https://trello.com/b/SOUXD4wE/databuddy",
			{ external: true, highlight: true }
		),
		createNavItem(
			"Feedback",
			SpeakerHighIcon,
			"https://databuddy.featurebase.app/",
			{ external: true, highlight: true }
		),
	]),
];

export const organizationNavigation: NavigationSection[] = [
	createNavSection("Organizations", BuildingsIcon, [
		createNavItem("Overview", ChartPieIcon, "/organizations"),
	]),
	createNavSection("Team Management", UsersThreeIcon, [
		createNavItem("Members", UserIcon, "/organizations/members"),
		createNavItem("Invitations", CalendarIcon, "/organizations/invitations"),
	]),
	createNavSection("Organization Settings", GearIcon, [
		createNavItem("General", GearIcon, "/organizations/settings"),
		createNavItem(
			"Website Access",
			GlobeSimpleIcon,
			"/organizations/settings/websites"
		),
		createNavItem("API Keys", KeyIcon, "/organizations/settings/api-keys"),
		// createNavItem(
		// 	"Single Sign-On",
		// 	FingerprintIcon,
		// 	"/organizations/settings/sso"
		// ),
		createNavItem("Danger Zone", WarningIcon, "/organizations/settings/danger"),
	]),
];

export const billingNavigation: NavigationSection[] = [
	createNavSection("Billing & Usage", CreditCardIcon, [
		createNavItem("Usage Overview", ActivityIcon, "/billing"),
		createNavItem("Plans & Pricing", CurrencyDollarIcon, "/billing/plans"),
		createNavItem("Payment History", ReceiptIcon, "/billing/history"),
		createNavItem(
			"Cost Breakdown",
			ChartLineUpIcon,
			"/billing/cost-breakdown",
			{
				badge: { text: "Experimental", variant: "purple" as const },
			}
		),
	]),
];

export const websiteNavigation: NavigationSection[] = [
	createNavSection("Web Analytics", ChartBarIcon, [
		createNavItem("Dashboard", EyeIcon, "", { rootLevel: false }),
		createNavItem("Audience", UsersThreeIcon, "/audience", {
			rootLevel: false,
		}),
		createNavItem("Web Vitals", HeartbeatIcon, "/vitals", {
			rootLevel: false,
			alpha: true,
			gatedFeature: GATED_FEATURES.WEB_VITALS,
		}),
		createNavItem("Performance", ActivityIcon, "/performance", {
			rootLevel: false,
			tag: "deprecated",
		}),
		createNavItem("Geographic", MapPinIcon, "/map", {
			rootLevel: false,
			gatedFeature: GATED_FEATURES.GEOGRAPHIC,
		}),
		createNavItem("Error Tracking", BugIcon, "/errors", {
			rootLevel: false,
			gatedFeature: GATED_FEATURES.ERROR_TRACKING,
		}),
	]),
	createNavSection("Product Analytics", TrendUpIcon, [
		createNavItem("Users", UsersThreeIcon, "/users", {
			rootLevel: false,
			gatedFeature: GATED_FEATURES.USERS,
		}),
		createNavItem("Funnels", FunnelIcon, "/funnels", {
			rootLevel: false,
			gatedFeature: GATED_FEATURES.FUNNELS,
		}),
		createNavItem("Goals", TargetIcon, "/goals", {
			rootLevel: false,
			gatedFeature: GATED_FEATURES.GOALS,
		}),
		createNavItem("Retention", RepeatIcon, "/retention", {
			rootLevel: false,
			alpha: true,
			gatedFeature: GATED_FEATURES.RETENTION,
		}),
		createNavItem("Feature Flags", FlagIcon, "/flags", {
			alpha: true,
			rootLevel: false,
			gatedFeature: GATED_FEATURES.FEATURE_FLAGS,
		}),
		createNavItem("AI Agent", RobotIcon, "/agent", {
			alpha: true,
			rootLevel: false,
			tag: "WIP",
			flag: "agent",
			// gatedFeature: GATED_FEATURES.AI_AGENT,
		}),
	]),
	createNavSection(
		"Pulse",
		HeartbeatIcon,
		[
			createNavItem("Uptime", ChartLineUpIcon, "/pulse", {
				rootLevel: false,
				alpha: true,
			}),
		],
		{
			flag: "pulse",
		}
	),
];

export const websiteSettingsNavigation: NavigationSection[] = [
	createNavSection("Website Settings", GearIcon, [
		createNavItem("General", GearIcon, "/settings/general", {
			rootLevel: false,
		}),
		createNavItem("Privacy", ShieldCheckIcon, "/settings/privacy", {
			rootLevel: false,
		}),
		createNavItem(
			"Transfer Website",
			ArrowSquareOutIcon,
			"/settings/transfer",
			{ rootLevel: false }
		),
		createNavItem("Data Export", FileArrowDownIcon, "/settings/export", {
			rootLevel: false,
			gatedFeature: GATED_FEATURES.DATA_EXPORT,
		}),
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
			{
				id: "websites",
				name: "Websites",
				icon: GlobeSimpleIcon,
				production: true,
			},
			{
				id: "organizations",
				name: "Organizations",
				icon: BuildingsIcon,
				production: true,
			},
			{
				id: "billing",
				name: "Billing",
				icon: CreditCardIcon,
				production: true,
			},
			{
				id: "settings",
				name: "Settings",
				icon: GearIcon,
				production: true,
				hideFromDemo: true,
			},
			{
				id: "resources",
				name: "Resources",
				icon: BookOpenIcon,
				production: true,
			},
		],
		"websites",
		{
			websites: [],
			organizations: organizationNavigation,
			billing: billingNavigation,
			settings: personalNavigation,
			resources: resourcesNavigation,
		}
	),
	website: createCategoryConfig(
		[
			{
				id: "analytics",
				name: "Analytics",
				icon: ChartBarIcon,
				production: true,
			},
			{
				id: "settings",
				name: "Settings",
				icon: GearIcon,
				production: true,
				hideFromDemo: true,
			},
		],
		"analytics",
		{
			analytics: websiteNavigation,
			settings: websiteSettingsNavigation,
		}
	),
};

const PATH_CONFIG_MAP = [
	{ pattern: ["/websites/", "/demo/"], config: "website" as const },
] as const;

const CATEGORY_PATH_MAP = [
	{ pattern: "/organizations", category: "organizations" as const },
	{ pattern: "/billing", category: "billing" as const },
	{ pattern: "/settings", category: "settings" as const },
] as const;

export const getContextConfig = (pathname: string) => {
	for (const item of PATH_CONFIG_MAP) {
		if (item.pattern.some((p) => pathname.startsWith(p))) {
			return categoryConfig[item.config];
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
		createNavItem(overviewName, ChartBarIcon, overviewHref, {
			highlight: true,
		}),
		createNavItem(loadingName, loadingIcon, overviewHref, {
			highlight: true,
			disabled: true,
		}),
	]),
];

export const createLoadingWebsitesNavigation = (): NavigationSection[] =>
	createLoadingNavigation(
		"Websites",
		GlobeSimpleIcon,
		"Website Overview",
		"/websites",
		"Loading websites...",
		GlobeIcon
	);
