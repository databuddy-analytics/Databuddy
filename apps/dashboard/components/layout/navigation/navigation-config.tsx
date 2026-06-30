import { GATED_FEATURES } from "@databuddy/shared/types/features";
import {
	OpenExternalIcon as ArrowSquareOutIcon,
	BellIcon,
	BugIcon,
	ChartPieIcon as ChartPieSliceIcon,
	CodeIcon,
	CreditCardIcon,
	CurrencyDollarIcon,
	EyeIcon,
	FileDownloadIcon as FileArrowDownIcon,
	FlagIcon,
	FilterIcon as FunnelIcon,
	GaugeIcon,
	GearIcon,
	GlobeIcon,
	GlobeSimpleIcon,
	HeartPulseIcon as HeartbeatIcon,
	HouseIcon,
	IdBadgeIcon,
	IdBadge2Icon as IdentificationBadgeIcon,
	KeyIcon,
	LightbulbIcon,
	BoltLightningIcon as LightningIcon,
	LinkIcon,
	ListBulletsIcon,
	LockIcon,
	MapPinIcon,
	PlugIcon,
	ChartActivityIcon as PulseIcon,
	ReceiptIcon,
	RobotIcon,
	SignalIcon,
	TargetIcon,
	UserIcon,
	UserSettingsIcon,
	Users3Icon as UsersThreeIcon,
	TriangleWarningIcon as WarningIcon,
} from "@databuddy/ui/icons";
import type { NavigationGroup, NavigationItem } from "./types";

export const createNavItem = (
	name: string,
	icon: NavigationItem["icon"],
	href: string,
	options: Partial<Omit<NavigationItem, "name" | "icon" | "href">> = {}
): NavigationItem => ({
	name,
	icon,
	href,
	rootLevel: true,
	...options,
});

export const mainNavigation: NavigationGroup[] = [
	{
		label: "",
		items: [
			createNavItem("Home", HouseIcon, "/home"),
			createNavItem("Websites", GlobeIcon, "/websites"),
			createNavItem("Insights", LightbulbIcon, "/insights"),
			createNavItem("Databunny", RobotIcon, "/agent", {
				activeMatch: "prefix",
				alpha: true,
			}),
		],
	},
	{
		label: "Tracking",
		items: [
			createNavItem("Links", LinkIcon, "/links", {
				activeMatch: "prefix",
				tag: "BETA",
			}),
			createNavItem("Events", LightningIcon, "/events", {
				activeMatch: "prefix",
				searchItems: [
					{
						name: "Events Stream",
						href: "/events/stream",
						icon: ListBulletsIcon,
						searchTags: ["custom events", "global events", "event log"],
					},
				],
				searchTags: [
					"custom events",
					"global events",
					"unattached events",
					"event analytics",
				],
			}),
		],
	},
	{
		label: "Monitoring",
		items: [
			createNavItem("Monitors", HeartbeatIcon, "/monitors", {
				activeMatch: "prefix",
				tag: "BETA",
			}),
			createNavItem("Status Pages", GlobeSimpleIcon, "/monitors/status-pages", {
				activeMatch: "prefix",
				hideFromSidebar: true,
				tag: "BETA",
			}),
		],
	},
	{
		label: "",
		pinToBottom: true,
		items: [createNavItem("Settings", GearIcon, "/organizations/settings")],
	},
];

export const websiteNavigation: NavigationGroup[] = [
	{
		back: { href: "/websites", label: "Websites" },
		label: "",
		items: [
			createNavItem("Dashboard", ChartPieSliceIcon, "", { rootLevel: false }),
			createNavItem("Realtime", SignalIcon, "/realtime", {
				rootLevel: false,
				flag: "realtime",
				alpha: true,
				hideFromDemo: true,
			}),
			createNavItem("Audience", UsersThreeIcon, "/audience", {
				rootLevel: false,
			}),
			createNavItem("Error Tracking", BugIcon, "/errors", {
				rootLevel: false,
				gatedFeature: GATED_FEATURES.ERROR_TRACKING,
			}),
		],
	},
	{
		label: "Performance",
		items: [
			createNavItem("Web Vitals", GaugeIcon, "/vitals", {
				rootLevel: false,
				gatedFeature: GATED_FEATURES.WEB_VITALS,
			}),
			createNavItem("Geographic", MapPinIcon, "/map", {
				rootLevel: false,
				gatedFeature: GATED_FEATURES.GEOGRAPHIC,
			}),
			createNavItem("Anomalies", WarningIcon, "/anomalies", {
				rootLevel: false,
				alpha: true,
				flag: "anomalies",
				hideFromDemo: true,
			}),
			createNavItem("Pulse", PulseIcon, "/pulse", {
				rootLevel: false,
				flag: "pulse",
				alpha: true,
			}),
		],
	},
	{
		label: "Product",
		items: [
			createNavItem("Events", LightningIcon, "/events", {
				rootLevel: false,
				searchItems: [
					{
						name: "Events Stream",
						href: "/events/stream",
						icon: ListBulletsIcon,
						searchTags: ["custom events", "website events", "event log"],
					},
				],
				searchTags: [
					"custom events",
					"website events",
					"site events",
					"attached events",
					"event analytics",
				],
			}),
			createNavItem("Users", IdentificationBadgeIcon, "/users", {
				rootLevel: false,
				gatedFeature: GATED_FEATURES.USERS,
				hideFromDemo: true,
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
				hideFromDemo: true,
			}),
			createNavItem("Revenue", CurrencyDollarIcon, "/revenue", {
				alpha: true,
				rootLevel: false,
				flag: "revenue",
				hideFromDemo: true,
			}),
		],
	},
	{
		label: "AI",
		items: [
			createNavItem("Databunny", RobotIcon, "/agent", {
				alpha: true,
				rootLevel: false,
				hideFromDemo: true,
			}),
		],
	},
	{
		label: "Settings",
		pinToBottom: true,
		items: [
			createNavItem("General", GearIcon, "/settings/general", {
				rootLevel: false,
				hideFromDemo: true,
			}),
			createNavItem("Security", LockIcon, "/settings/security", {
				rootLevel: false,
				hideFromDemo: true,
			}),
			createNavItem("Transfer", ArrowSquareOutIcon, "/settings/transfer", {
				rootLevel: false,
				hideFromDemo: true,
			}),
			createNavItem("Data Export", FileArrowDownIcon, "/settings/export", {
				rootLevel: false,
				hideFromDemo: true,
			}),
			createNavItem("Setup", CodeIcon, "/settings/tracking", {
				rootLevel: false,
				hideFromDemo: true,
				searchTags: [
					"tracking setup",
					"install script",
					"script tag",
					"react sdk",
					"vue sdk",
					"analytics sdk",
				],
			}),
		],
	},
];

export const settingsNavigation: NavigationGroup[] = [
	{
		back: { href: "/home", label: "Home" },
		label: "Organization",
		items: [
			createNavItem("General", GearIcon, "/organizations/settings", {
				searchItems: [
					{
						name: "Organization Details",
						href: "#details",
						icon: IdBadgeIcon,
						searchTags: ["workspace details", "organization id", "slug"],
					},
					{
						name: "Workspace Websites",
						href: "#websites",
						icon: GlobeIcon,
						searchTags: ["organization websites", "workspace sites"],
					},
					{
						name: "API Keys",
						href: "#api-keys",
						icon: KeyIcon,
						searchTags: [
							"api key",
							"api token",
							"access token",
							"server sdk",
							"node sdk",
							"automation key",
							"sdk key",
						],
					},
				],
				searchTags: [
					"organization settings",
					"workspace settings",
					"general settings",
				],
			}),
			createNavItem(
				"Integrations",
				PlugIcon,
				"/organizations/settings/integrations",
				{ flag: "integrations" }
			),
			createNavItem("Members", UserIcon, "/organizations/members"),
			createNavItem("Billing", CreditCardIcon, "/billing"),
			createNavItem("Plans", CurrencyDollarIcon, "/billing/plans"),
			createNavItem("Invoices", ReceiptIcon, "/billing/history"),
		],
	},
	{
		label: "Account",
		items: [
			createNavItem("Profile", UserSettingsIcon, "/settings/account"),
			createNavItem("Appearance", EyeIcon, "/settings/appearance"),
			createNavItem("Notifications", BellIcon, "/settings/notifications"),
		],
	},
];

const SETTINGS_PREFIXES = [
	"/organizations",
	"/billing",
	"/settings",
	"/feedback",
] as const;

export type NavContext = "main" | "settings" | "website";

const CONTEXT_DEPTH: Record<NavContext, number> = {
	main: 0,
	settings: 1,
	website: 1,
};

export function getNavContext(pathname: string): NavContext {
	if (pathname.startsWith("/websites/") || pathname.startsWith("/demo/")) {
		return "website";
	}
	if (SETTINGS_PREFIXES.some((p) => pathname.startsWith(p))) {
		return "settings";
	}
	return "main";
}

export function getNavigation(pathname: string): NavigationGroup[] {
	const ctx = getNavContext(pathname);
	if (ctx === "website") {
		return websiteNavigation;
	}
	if (ctx === "settings") {
		return settingsNavigation;
	}
	return mainNavigation;
}

export function getNavDirection(
	prev: NavContext,
	next: NavContext
): "left" | "right" | null {
	if (prev === next) {
		return null;
	}
	return CONTEXT_DEPTH[next] > CONTEXT_DEPTH[prev] ? "left" : "right";
}
