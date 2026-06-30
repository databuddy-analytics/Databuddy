import {
	ArrowSquareOutIcon,
	BookOpenIcon,
	BracketsSquareIcon,
	CalendarIcon,
	CodeIcon,
	CompassIcon,
	DatabaseIcon,
	FileTextIcon,
	FlagIcon,
	GearIcon,
	GaugeIcon,
	GlobeSimpleIcon,
	Grid2x2Icon,
	IdBadgeIcon,
	LightbulbIcon,
	LockIcon,
	DownloadSimpleIcon,
	MediaPlayIcon,
	MonitorIcon,
	PackageIcon,
	PlugIcon,
	ShieldCheckIcon,
	StackIcon,
	WrenchIcon,
} from "@databuddy/ui/icons";

type SidebarIcon = React.ComponentType<{
	className?: string;
	size?: number | string;
	weight?: string;
}>;

export interface SidebarItem {
	children?: SidebarItem[];
	group?: boolean;
	href?: string;
	icon?: SidebarIcon;
	isNew?: boolean;
	title: string;
}

export interface SidebarSection {
	Icon: SidebarIcon;
	isNew?: boolean;
	list: SidebarItem[];
	title: string;
}

export const contents: SidebarSection[] = [
	{
		title: "Start",
		Icon: BookOpenIcon,
		list: [
			{
				title: "Overview",
				href: "/docs",
				icon: FileTextIcon,
			},
			{
				title: "Getting Started",
				href: "/docs/getting-started",
				icon: MediaPlayIcon,
			},
		],
	},
	{
		title: "Install",
		Icon: DownloadSimpleIcon,
		list: [
			{
				title: "Frameworks",
				icon: BracketsSquareIcon,
				children: [
					{
						title: "Next.js",
						href: "/docs/Integrations/nextjs",
					},
					{
						title: "React",
						href: "/docs/Integrations/react",
					},
					{
						title: "Angular",
						href: "/docs/Integrations/angular",
					},
					{
						title: "Svelte",
						href: "/docs/Integrations/svelte",
					},
					{
						title: "SvelteKit",
						href: "/docs/Integrations/sveltekit",
					},
					{
						title: "Laravel",
						href: "/docs/Integrations/laravel",
					},
				],
			},
			{
				title: "CMS & Builders",
				icon: PlugIcon,
				children: [
					{
						title: "WordPress",
						href: "/docs/Integrations/wordpress",
					},
					{
						title: "Webflow",
						href: "/docs/Integrations/webflow",
					},
					{
						title: "Wix",
						href: "/docs/Integrations/wix",
					},
					{
						title: "Squarespace",
						href: "/docs/Integrations/squarespace",
					},
					{
						title: "Framer",
						href: "/docs/Integrations/framer",
					},
					{
						title: "Bubble.io",
						href: "/docs/Integrations/bubble",
					},
					{
						title: "Mintlify",
						href: "/docs/Integrations/mintlify",
					},
				],
			},
			{
				title: "Stores & Scheduling",
				icon: CalendarIcon,
				children: [
					{
						title: "Shopify",
						href: "/docs/Integrations/shopify",
					},
					{
						title: "Cal.com",
						href: "/docs/Integrations/cal",
					},
				],
			},
			{
				title: "Static Sites & Tools",
				icon: GlobeSimpleIcon,
				children: [
					{
						title: "Hugo",
						href: "/docs/Integrations/hugo",
					},
					{
						title: "Jekyll",
						href: "/docs/Integrations/jekyll",
					},
					{
						title: "Google Tag Manager",
						href: "/docs/Integrations/gtm",
					},
				],
			},
			{
				title: "All Integrations",
				href: "/docs/Integrations",
				icon: Grid2x2Icon,
			},
		],
	},
	{
		title: "SDK & API",
		Icon: CodeIcon,
		list: [
			{
				title: "SDKs",
				group: true,
			},
			{
				title: "Overview",
				href: "/docs/sdk",
				icon: PackageIcon,
			},
			{
				title: "Configuration",
				href: "/docs/sdk/configuration",
				icon: GearIcon,
			},
			{
				title: "Web SDKs",
				icon: GlobeSimpleIcon,
				children: [
					{
						title: "React / Next.js",
						href: "/docs/sdk/react",
					},
					{
						title: "Nuxt",
						href: "/docs/sdk/nuxt",
					},
					{
						title: "Vue",
						href: "/docs/sdk/vue",
					},
					{
						title: "Vanilla JavaScript",
						href: "/docs/sdk/vanilla-js",
					},
				],
			},
			{
				title: "Server SDKs",
				icon: DatabaseIcon,
				children: [
					{
						title: "Node.js",
						href: "/docs/sdk/node",
					},
				],
			},
			{
				title: "Feature Flags",
				icon: FlagIcon,
				children: [
					{
						title: "Client Flags",
						href: "/docs/sdk/feature-flags",
					},
					{
						title: "Server Flags",
						href: "/docs/sdk/server-flags",
					},
				],
			},
			{
				title: "SDK Utilities",
				icon: WrenchIcon,
				children: [
					{
						title: "Tracker Helpers",
						href: "/docs/sdk/tracker",
					},
					{
						title: "DevTools",
						href: "/docs/sdk/devtools",
					},
				],
			},
			{
				title: "HTTP API",
				group: true,
			},
			{
				title: "API Reference",
				icon: StackIcon,
				children: [
					{
						title: "API Playground",
						href: "https://api.databuddy.cc/",
						icon: ArrowSquareOutIcon,
					},
					{
						title: "Overview",
						href: "/docs/api",
					},
					{
						title: "Authentication",
						href: "/docs/api/authentication",
					},
					{
						title: "MCP Server",
						href: "/docs/api/mcp",
						isNew: true,
					},
					{
						title: "API Keys",
						href: "/docs/api-keys",
					},
					{
						title: "Analytics Queries",
						href: "/docs/api/query",
					},
					{
						title: "Event Tracking",
						href: "/docs/api/events",
					},
					{
						title: "Link Analytics",
						href: "/docs/api/links",
					},
					{
						title: "Custom Queries",
						href: "/docs/api/custom-queries",
					},
					{
						title: "Error Handling",
						href: "/docs/api/errors",
					},
					{
						title: "Rate Limits",
						href: "/docs/api/rate-limits",
					},
				],
			},
		],
	},
	{
		title: "Recipes",
		Icon: LightbulbIcon,
		list: [
			{
				title: "Overview",
				href: "/docs/hooks",
			},
			{
				title: "Toast Tracking",
				href: "/docs/hooks/toast-tracking",
			},
			{
				title: "Form Tracking",
				href: "/docs/hooks/form-tracking",
			},
			{
				title: "Modal Tracking",
				href: "/docs/hooks/modal-tracking",
			},
			{
				title: "Feature Usage",
				href: "/docs/hooks/feature-usage",
			},
			{
				title: "Feedback Tracking",
				href: "/docs/hooks/feedback-tracking",
			},
		],
	},
	{
		title: "Guides",
		Icon: CompassIcon,
		list: [
			{
				title: "Dashboard",
				href: "/docs/dashboard",
				icon: MonitorIcon,
			},
			{
				title: "Core Web Vitals",
				href: "/docs/performance/core-web-vitals-guide",
				icon: GaugeIcon,
			},
			{
				title: "Cookieless Analytics",
				href: "/docs/privacy/cookieless-analytics-guide",
				icon: IdBadgeIcon,
			},
			{
				title: "GDPR Compliance",
				href: "/docs/compliance/gdpr-compliance-guide",
				icon: ShieldCheckIcon,
			},
			{
				title: "Security Guide",
				href: "/docs/security",
				icon: LockIcon,
			},
		],
	},
];
