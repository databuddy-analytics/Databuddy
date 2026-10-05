import {
	ArrowSquareOutIcon,
	BookOpenIcon,
	BracketsSquareIcon,
	CalendarIcon,
	CodeIcon,
	CompassIcon,
	CreditCardIcon,
	DatabaseIcon,
	FileTextIcon,
	FlagIcon,
	GearIcon,
	GaugeIcon,
	GitBranchIcon,
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
				title: "Getting started",
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
				title: "CMS and builders",
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
						title: "Bubble",
						href: "/docs/Integrations/bubble",
					},
					{
						title: "Mintlify",
						href: "/docs/Integrations/mintlify",
					},
				],
			},
			{
				title: "Stores and scheduling",
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
				title: "Payments",
				href: "/docs/Integrations/payments",
				icon: CreditCardIcon,
			},
			{
				title: "Static sites and tools",
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
				title: "All integrations",
				href: "/docs/Integrations",
				icon: Grid2x2Icon,
			},
		],
	},
	{
		title: "SDK and API",
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
				title: "Identify users",
				href: "/docs/sdk/identify-users",
				icon: IdBadgeIcon,
			},
			{
				title: "Web SDKs",
				icon: GlobeSimpleIcon,
				children: [
					{
						title: "React SDK",
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
				title: "Feature flags",
				icon: FlagIcon,
				children: [
					{
						title: "Client flags",
						href: "/docs/sdk/feature-flags",
					},
					{
						title: "Server flags",
						href: "/docs/sdk/server-flags",
					},
				],
			},
			{
				title: "SDK utilities",
				icon: WrenchIcon,
				children: [
					{
						title: "Tracker helpers",
						href: "/docs/sdk/tracker",
					},
					{
						title: "AI agents",
						href: "/docs/sdk/ai-agents",
					},
					{
						title: "MCP server analytics",
						href: "/docs/sdk/mcp",
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
				title: "API reference",
				icon: StackIcon,
				children: [
					{
						title: "API playground",
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
						title: "Databuddy MCP server",
						href: "/docs/api/mcp",
						isNew: true,
					},
					{
						title: "API keys",
						href: "/docs/api-keys",
					},
					{
						title: "Analytics queries",
						href: "/docs/api/query",
					},
					{
						title: "Event tracking",
						href: "/docs/api/events",
					},
					{
						title: "Link analytics",
						href: "/docs/api/links",
					},
					{
						title: "Error handling",
						href: "/docs/api/errors",
					},
					{
						title: "Rate limits",
						href: "/docs/api/rate-limits",
					},
				],
			},
			{
				title: "Infrastructure as code",
				group: true,
			},
			{
				title: "Overview",
				href: "/docs/infrastructure-as-code",
				icon: GitBranchIcon,
			},
			{
				title: "Pulumi",
				href: "/docs/infrastructure-as-code/pulumi",
				icon: BracketsSquareIcon,
				isNew: true,
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
				title: "Toast tracking",
				href: "/docs/hooks/toast-tracking",
			},
			{
				title: "Form tracking",
				href: "/docs/hooks/form-tracking",
			},
			{
				title: "Modal tracking",
				href: "/docs/hooks/modal-tracking",
			},
			{
				title: "Feature usage",
				href: "/docs/hooks/feature-usage",
			},
			{
				title: "Feedback tracking",
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
				title: "Performance",
				icon: GaugeIcon,
				children: [
					{ title: "Overview", href: "/docs/performance" },
					{
						title: "Core Web Vitals",
						href: "/docs/performance/core-web-vitals-guide",
					},
				],
			},
			{
				title: "Privacy",
				icon: IdBadgeIcon,
				children: [
					{ title: "Overview", href: "/docs/privacy" },
					{
						title: "Cookieless analytics",
						href: "/docs/privacy/cookieless-analytics-guide",
					},
					{
						title: "Event scanner data",
						href: "/docs/privacy/event-scanner",
					},
				],
			},
			{
				title: "Compliance",
				icon: ShieldCheckIcon,
				children: [
					{ title: "Overview", href: "/docs/compliance" },
					{
						title: "GDPR compliance",
						href: "/docs/compliance/gdpr-compliance-guide",
					},
				],
			},
			{
				title: "Uptime monitoring",
				href: "/docs/uptime",
				icon: GlobeSimpleIcon,
			},
			{
				title: "Security guide",
				href: "/docs/security",
				icon: LockIcon,
			},
		],
	},
];
