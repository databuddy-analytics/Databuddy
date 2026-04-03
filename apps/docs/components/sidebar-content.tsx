import {
	ArrowSquareOutIcon,
	AtomIcon,
	BookOpenIcon,
	BrainIcon,
	ChartBarIcon,
	CodeIcon,
	CurrencyDollarIcon,
	DatabaseIcon,
	FileTextIcon,
	type IconWeight,
	KeyIcon,
	LockIcon,
	MonitorIcon,
	PlugIcon,
	RocketIcon,
	ShieldCheckIcon,
	ShieldStarIcon,
	SpeedometerIcon,
	TrendUpIcon,
	UserCheckIcon,
} from "@phosphor-icons/react";

export interface SidebarItem {
	children?: SidebarItem[];
	group?: boolean;
	href?: string;
	icon?: React.ComponentType<{ className?: string; weight?: IconWeight }>;
	isNew?: boolean;
	title: string;
}

export interface SidebarSection {
	Icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
	isNew?: boolean;
	list: SidebarItem[];
	title: string;
}

export const contents: SidebarSection[] = [
	{
		title: "Introduction",
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
				icon: RocketIcon,
			},
		],
	},
	{
		title: "Implementation",
		Icon: CodeIcon,
		list: [
			{
				title: "SDK Reference",
				icon: AtomIcon,
				children: [
					{
						title: "Overview",
						href: "/docs/sdk",
					},
					{
						title: "React / Next.js",
						href: "/docs/sdk/react",
					},
					{
						title: "Vue",
						href: "/docs/sdk/vue",
					},
					{
						title: "Vanilla JavaScript",
						href: "/docs/sdk/vanilla-js",
					},
					{
						title: "Node.js",
						href: "/docs/sdk/node",
					},
					{
						title: "Tracker Helpers",
						href: "/docs/sdk/tracker",
					},
					{
						title: "Feature Flags",
						href: "/docs/sdk/feature-flags",
					},
					{
						title: "Server Flags",
						href: "/docs/sdk/server-flags",
					},
					{
						title: "Configuration",
						href: "/docs/sdk/configuration",
					},
				],
			},
			{
				title: "LLM Observability",
				icon: BrainIcon,
				isNew: true,
				children: [
					{
						title: "Overview",
						href: "/docs/ai",
					},
					{
						title: "Vercel AI SDK",
						href: "/docs/ai/vercel",
					},
					{
						title: "OpenAI SDK",
						href: "/docs/ai/openai",
					},
					{
						title: "Anthropic SDK",
						href: "/docs/ai/anthropic",
					},
				],
			},
			{
				title: "API Reference",
				icon: DatabaseIcon,
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
						title: "MCP (Model Context Protocol)",
						href: "/docs/api/mcp",
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
			{
				title: "API Keys",
				href: "/docs/api-keys",
				icon: KeyIcon,
			},
		],
	},
	{
		title: "Integrations",
		Icon: PlugIcon,
		list: [
			{
				title: "Angular",
				href: "/docs/Integrations/angular",
			},
			{
				title: "React",
				href: "/docs/Integrations/react",
			},
			{
				title: "Next.js",
				href: "/docs/Integrations/nextjs",
			},
			{
				title: "Svelte",
				children: [
					{
						title: "Svelte",
						href: "/docs/Integrations/svelte",
					},
					{
						title: "SvelteKit",
						href: "/docs/Integrations/sveltekit",
					},
				],
			},
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
				title: "Shopify",
				href: "/docs/Integrations/shopify",
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
				title: "Cal.com",
				href: "/docs/Integrations/cal",
			},
			{
				title: "Google Tag Manager",
				href: "/docs/Integrations/gtm",
			},
			{
				title: "Hugo",
				href: "/docs/Integrations/hugo",
			},
			{
				title: "Jekyll",
				href: "/docs/Integrations/jekyll",
			},
			{
				title: "Laravel",
				href: "/docs/Integrations/laravel",
			},
		],
	},
	{
		title: "Dashboard & Analytics",
		Icon: ChartBarIcon,
		list: [
			{
				title: "Dashboard",
				href: "/docs/dashboard",
				icon: MonitorIcon,
			},
			{
				title: "Revenue Tracking",
				icon: CurrencyDollarIcon,
				children: [
					{
						title: "Overview",
						href: "/docs/revenue",
					},
					{
						title: "Stripe",
						href: "/docs/revenue/stripe",
					},
					{
						title: "Paddle",
						href: "/docs/revenue/paddle",
					},
					{
						title: "Autumn",
						href: "/docs/revenue/autumn",
					},
				],
			},
		],
	},
	{
		title: "Hook Examples",
		Icon: CodeIcon,
		list: [
			{
				title: "Overview",
				href: "/docs/hooks",
				icon: FileTextIcon,
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
		title: "Privacy & Compliance",
		Icon: ShieldCheckIcon,
		list: [
			{
				title: "GDPR Compliance",
				href: "/docs/compliance/gdpr-compliance-guide",
				icon: ShieldStarIcon,
			},
			{
				title: "Cookieless Analytics",
				href: "/docs/privacy/cookieless-analytics-guide",
				icon: UserCheckIcon,
			},
		],
	},
	{
		title: "Performance",
		Icon: TrendUpIcon,
		list: [
			{
				title: "Core Web Vitals",
				href: "/docs/performance/core-web-vitals-guide",
				icon: SpeedometerIcon,
			},
		],
	},
	{
		title: "Security",
		Icon: LockIcon,
		list: [
			{
				title: "Security Guide",
				href: "/docs/security",
				icon: ShieldCheckIcon,
			},
		],
	},
];

export const examples: SidebarSection[] = [
	{
		title: "Examples",
		Icon: CodeIcon,
		list: [
			{
				title: "Coming Soon",
				group: true,
				icon: FileTextIcon,
			},
		],
	},
];
