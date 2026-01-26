import {
	AtomIcon,
	BookOpenIcon,
	BrainIcon,
	CalendarIcon,
	ChartBarIcon,
	CircleIcon,
	CodeIcon,
	CreditCardIcon,
	DatabaseIcon,
	DiamondIcon,
	FileTextIcon,
	FlagIcon,
	GearIcon,
	GlobeIcon,
	GoogleLogoIcon,
	HardDrivesIcon,
	HexagonIcon,
	type IconWeight,
	KeyIcon,
	LightningIcon,
	LockIcon,
	MonitorIcon,
	PaletteIcon,
	PlugIcon,
	RocketIcon,
	ShieldCheckIcon,
	ShieldStarIcon,
	ShoppingCartIcon,
	SparkleIcon,
	SpeedometerIcon,
	SquareIcon,
	StarIcon,
	TerminalIcon,
	TrendUpIcon,
	TriangleIcon,
	UserCheckIcon,
} from "@phosphor-icons/react";

export interface SidebarItem {
	title: string;
	href?: string;
	icon?: React.ComponentType<{ className?: string; weight?: IconWeight }>;
	isNew?: boolean;
	group?: boolean;
	children?: SidebarItem[];
}

export interface SidebarSection {
	title: string;
	Icon: React.ComponentType<{ className?: string; weight?: IconWeight }>;
	isNew?: boolean;
	list: SidebarItem[];
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
						icon: FileTextIcon,
					},
					{
						title: "React / Next.js",
						href: "/docs/sdk/react",
						icon: AtomIcon,
					},
					{
						title: "Vue",
						href: "/docs/sdk/vue",
						icon: DiamondIcon,
					},
					{
						title: "Vanilla JavaScript",
						href: "/docs/sdk/vanilla-js",
						icon: FileTextIcon,
					},
					{
						title: "Node.js",
						href: "/docs/sdk/node",
						icon: HardDrivesIcon,
					},
					{
						title: "Tracker Helpers",
						href: "/docs/sdk/tracker",
						icon: TerminalIcon,
					},
					{
						title: "AI / LLM Analytics",
						href: "/docs/sdk/ai",
						icon: BrainIcon,
						isNew: true,
					},
					{
						title: "Feature Flags",
						href: "/docs/sdk/feature-flags",
						icon: FlagIcon,
					},
					{
						title: "Server Flags",
						href: "/docs/sdk/server-flags",
						icon: HardDrivesIcon,
					},
					{
						title: "Configuration",
						href: "/docs/sdk/configuration",
						icon: GearIcon,
					},
				],
			},
			{
				title: "API Reference",
				icon: DatabaseIcon,
				children: [
					{
						title: "Overview",
						href: "/docs/api",
						icon: FileTextIcon,
					},
					{
						title: "Authentication",
						href: "/docs/api/authentication",
						icon: KeyIcon,
					},
					{
						title: "Analytics Queries",
						href: "/docs/api/query",
						icon: ChartBarIcon,
					},
					{
						title: "Event Tracking",
						href: "/docs/api/events",
						icon: LightningIcon,
					},
					{
						title: "Link Analytics",
						href: "/docs/api/links",
						icon: GlobeIcon,
					},
					{
						title: "Custom Queries",
						href: "/docs/api/custom-queries",
						icon: CodeIcon,
					},
					{
						title: "Error Handling",
						href: "/docs/api/errors",
						icon: ShieldCheckIcon,
					},
					{
						title: "Rate Limits",
						href: "/docs/api/rate-limits",
						icon: SpeedometerIcon,
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
				icon: CircleIcon,
			},
			{
				title: "React",
				href: "/docs/Integrations/react",
				icon: AtomIcon,
			},
			{
				title: "Next.js",
				href: "/docs/Integrations/nextjs",
				icon: LightningIcon,
			},
			{
				title: "Svelte",
				icon: HexagonIcon,
				children: [
					{
						title: "Svelte",
						href: "/docs/Integrations/svelte",
						icon: HexagonIcon,
					},
					{
						title: "SvelteKit",
						href: "/docs/Integrations/sveltekit",
						icon: DiamondIcon,
					},
				],
			},
			{
				title: "WordPress",
				href: "/docs/Integrations/wordpress",
				icon: GlobeIcon,
			},
			{
				title: "Webflow",
				href: "/docs/Integrations/webflow",
				icon: SquareIcon,
			},
			{
				title: "Wix",
				href: "/docs/Integrations/wix",
				icon: TriangleIcon,
			},
			{
				title: "Shopify",
				href: "/docs/Integrations/shopify",
				icon: ShoppingCartIcon,
			},
			{
				title: "Squarespace",
				href: "/docs/Integrations/squarespace",
				icon: StarIcon,
			},
			{
				title: "Stripe",
				href: "/docs/Integrations/stripe",
				icon: CreditCardIcon,
			},
			{
				title: "Framer",
				href: "/docs/Integrations/framer",
				icon: PaletteIcon,
			},
			{
				title: "Bubble.io",
				href: "/docs/Integrations/bubble",
				icon: SparkleIcon,
			},
			{
				title: "Cal.com",
				href: "/docs/Integrations/cal",
				icon: CalendarIcon,
			},
			{
				title: "Google Tag Manager",
				href: "/docs/Integrations/gtm",
				icon: GoogleLogoIcon,
			},
			{
				title: "Hugo",
				href: "/docs/Integrations/hugo",
				icon: FileTextIcon,
			},
			{
				title: "Jekyll",
				href: "/docs/Integrations/jekyll",
				icon: BookOpenIcon,
			},
			{
				title: "Laravel",
				href: "/docs/Integrations/laravel",
				icon: CodeIcon,
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
				icon: AtomIcon,
			},
			{
				title: "Form Tracking",
				href: "/docs/hooks/form-tracking",
				icon: FileTextIcon,
			},
			{
				title: "Modal Tracking",
				href: "/docs/hooks/modal-tracking",
				icon: MonitorIcon,
			},
			{
				title: "Feature Usage",
				href: "/docs/hooks/feature-usage",
				icon: LightningIcon,
			},
			{
				title: "Feedback Tracking",
				href: "/docs/hooks/feedback-tracking",
				icon: UserCheckIcon,
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
