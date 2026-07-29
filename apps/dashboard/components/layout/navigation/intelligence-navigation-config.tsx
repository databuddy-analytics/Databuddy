import {
	BellIcon,
	CodeIcon,
	CreditCardIcon,
	CurrencyDollarIcon,
	EyeIcon,
	GearIcon,
	GlobeIcon,
	IdBadgeIcon,
	KeyIcon,
	LightbulbIcon,
	PackageIcon,
	PlugIcon,
	ReceiptIcon,
	RobotIcon,
	UserIcon,
	UserSettingsIcon,
	UsersThreeIcon,
} from "@databuddy/ui/icons";
import type { NavigationGroup, NavigationItem } from "./types";

const createIntelligenceNavItem = (
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

export const intelligenceMainNavigation: NavigationGroup[] = [
	{
		label: "Intelligence",
		items: [
			createIntelligenceNavItem("Insights", LightbulbIcon, "/insights", {
				activeMatch: "prefix",
				searchItems: [
					{
						name: "Investigations",
						href: "/insights#investigations",
						icon: LightbulbIcon,
						searchTags: ["cases", "open work"],
					},
				],
			}),
			createIntelligenceNavItem(
				"Product Intelligence",
				PackageIcon,
				"/product-intelligence",
				{
					activeMatch: "prefix",
					tag: "SOON",
					searchTags: ["product", "funnels", "features", "releases"],
				}
			),
			createIntelligenceNavItem(
				"Customer Intelligence",
				UsersThreeIcon,
				"/customer-intelligence",
				{
					activeMatch: "prefix",
					tag: "SOON",
					searchTags: ["customers", "users", "segments", "retention"],
				}
			),
			createIntelligenceNavItem("Databunny", RobotIcon, "/agent", {
				activeMatch: "prefix",
				alpha: true,
			}),
		],
	},
	{
		label: "",
		items: [createIntelligenceNavItem("Websites", GlobeIcon, "/websites")],
	},
	{
		label: "",
		pinToBottom: true,
		items: [createIntelligenceNavItem("Settings", GearIcon, "/organizations/settings")],
	},
];

export const intelligenceWebsiteNavigation: NavigationGroup[] = [
	{
		back: { href: "/websites", label: "Websites" },
		label: "Settings",
		items: [
			createIntelligenceNavItem("Setup", CodeIcon, "/settings/tracking", {
				rootLevel: false,
				searchTags: [
					"tracking setup",
					"install script",
					"script tag",
					"react sdk",
					"vue sdk",
					"analytics sdk",
				],
			}),
			createIntelligenceNavItem("General", GearIcon, "/settings/general", {
				rootLevel: false,
				hideFromDemo: true,
			}),
		],
	},
];

export const intelligenceSettingsNavigation: NavigationGroup[] = [
	{
		back: { href: "/insights", label: "Insights" },
		label: "Organization",
		items: [
			createIntelligenceNavItem("General", GearIcon, "/organizations/settings", {
				searchItems: [
					{
						name: "Organization Details",
						href: "#details",
						icon: IdBadgeIcon,
						searchTags: ["workspace details", "organization id", "slug"],
					},
					{
						name: "Organization Websites",
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
			createIntelligenceNavItem(
				"Integrations",
				PlugIcon,
				"/organizations/settings/integrations",
				{ flag: "integrations" }
			),
			createIntelligenceNavItem("Members", UserIcon, "/organizations/members"),
			createIntelligenceNavItem("Billing", CreditCardIcon, "/billing"),
			createIntelligenceNavItem("Plans", CurrencyDollarIcon, "/billing/plans"),
			createIntelligenceNavItem("Invoices", ReceiptIcon, "/billing/history"),
		],
	},
	{
		label: "Account",
		items: [
			createIntelligenceNavItem("Profile", UserSettingsIcon, "/settings/account"),
			createIntelligenceNavItem("Appearance", EyeIcon, "/settings/appearance"),
			createIntelligenceNavItem("Notifications", BellIcon, "/settings/notifications"),
		],
	},
];

export const intelligenceComingSoonPages = {
	"product-intelligence": {
		title: "Product Intelligence",
		description:
			"Understand how product changes, funnels, and releases affect conversion and revenue.",
		icon: PackageIcon,
	},
	"customer-intelligence": {
		title: "Customer Intelligence",
		description:
			"See which customers are growing, churning, or stuck — and why it matters.",
		icon: UsersThreeIcon,
	},
} as const;
