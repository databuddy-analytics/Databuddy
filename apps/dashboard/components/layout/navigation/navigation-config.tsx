import { GATED_FEATURES } from "@databuddy/shared/types/features";
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
	CodeIcon,
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
	HouseIcon,
	IdentificationCardIcon,
	KeyIcon,
	LightningIcon,
	LinkIcon,
	LockIcon,
	MapPinIcon,
	PlayIcon,
	PlugIcon,
	ReceiptIcon,
	RoadHorizonIcon,
	RobotIcon,
	ShieldCheckIcon,
	SparkleIcon,
	SpeakerHighIcon,
	SquaresFourIcon,
	TargetIcon,
	TrendUpIcon,
	UserGearIcon,
	UserIcon,
	UsersThreeIcon,
	WarningIcon,
} from "@phosphor-icons/react/ssr";
import type { Category, NavigationEntry, NavigationSection } from "./types";

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

/**
 * Hides flag-gated categories until the client has mounted, then applies the same
 * rule as main navigation: only show when the flag is ready and on. Prevents
 * hydration mismatches from `isOn` / flag store differing between SSR and first paint.
 */
export function filterCategoriesByFlags(
	categories: Category[],
	hasMounted: boolean,
	getFlag: (key: string) => { status: string; on: boolean }
): Category[] {
	return categories.filter((category) => {
		if (!category.flag) {
			return true;
		}
		if (!hasMounted) {
			return false;
		}
		const flagState = getFlag(category.flag);
		return flagState.status === "ready" && flagState.on;
	});
}

export const homeNavigation: NavigationEntry[] = [
	createNavSection("Overview", SquaresFourIcon, [
		createNavItem("Home", HouseIcon, "/home", {
			highlight: true,
		}),
		createNavItem("Websites", GlobeIcon, "/websites", {
			highlight: true,
		}),
		createNavItem("Insights", SparkleIcon, "/insights", {
			highlight: true,
		}),
	]),
	createNavSection("Observability", ActivityIcon, [
		createNavItem("Links", LinkIcon, "/links", {
			highlight: true,
		}),
		createNavItem("Custom Events", LightningIcon, "/events", {
			highlight: true,
		}),
	]),
];

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
		createNavItem("Feedback & Credits", SpeakerHighIcon, "/feedback"),
	]),
];

export const monitorsNavigation: NavigationSection[] = [
	createNavSection("Monitoring", HeartbeatIcon, [
		createNavItem("All Monitors", HeartbeatIcon, "/monitors", {
			highlight: true,
		}),
		createNavItem("Status Pages", GlobeSimpleIcon, "/monitors/status-pages", {
			highlight: true,
		}),
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
			gatedFeature: GATED_FEATURES.WEB_VITALS,
		}),
		createNavItem("Geographic", MapPinIcon, "/map", {
			rootLevel: false,
			gatedFeature: GATED_FEATURES.GEOGRAPHIC,
		}),
		createNavItem("Error Tracking", BugIcon, "/errors", {
			rootLevel: false,
			gatedFeature: GATED_FEATURES.ERROR_TRACKING,
		}),
		createNavItem("Anomalies", WarningIcon, "/anomalies", {
			rootLevel: false,
			alpha: true,
			flag: "anomalies",
		}),
		createNavItem("Pulse", HeartbeatIcon, "/pulse", {
			rootLevel: false,
			flag: "pulse",
			alpha: true,
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
		createNavItem("Feature Flags", FlagIcon, "/flags", {
			alpha: true,
			rootLevel: false,
			gatedFeature: GATED_FEATURES.FEATURE_FLAGS,
		}),
		createNavItem("Revenue", CurrencyDollarIcon, "/revenue", {
			alpha: true,
			rootLevel: false,
			flag: "revenue",
		}),
		createNavItem("AI Agent", RobotIcon, "/agent", {
			alpha: true,
			rootLevel: false,
		}),
	]),
];

export const websiteSettingsNavigation: NavigationSection[] = [
	createNavSection("Website Settings", GearIcon, [
		createNavItem("General", GearIcon, "/settings/general", {
			rootLevel: false,
		}),
		createNavItem("Privacy", ShieldCheckIcon, "/settings/privacy", {
			rootLevel: false,
		}),
		createNavItem("Security", LockIcon, "/settings/security", {
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
		}),
		createNavItem("Setup", CodeIcon, "/settings/tracking", {
			rootLevel: false,
		}),
	]),
];

const createCategoryConfig = (
	categories: Category[],
	defaultCategory: string,
	navigationMap: Record<string, NavigationEntry[]>
) => ({ categories, defaultCategory, navigationMap });

export const categoryConfig = {
	main: createCategoryConfig(
		[
			{
				id: "home",
				name: "Home",
				icon: HouseIcon,
				production: true,
			},
			{
				id: "monitors",
				name: "Monitors",
				icon: HeartbeatIcon,
				production: true,
				flag: "monitors",
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
		"home",
		{
			home: homeNavigation,
			monitors: monitorsNavigation,
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
	{ pattern: "/monitors", category: "monitors" as const },
	{ pattern: "/organizations", category: "organizations" as const },
	{ pattern: "/billing", category: "billing" as const },
	{ pattern: "/feedback", category: "billing" as const },
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
		if (pathname.includes(pattern)) {
			return category;
		}
	}
	return getContextConfig(pathname).defaultCategory;
};
