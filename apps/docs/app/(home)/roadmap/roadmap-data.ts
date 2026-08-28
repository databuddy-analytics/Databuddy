import type {
	RoadmapItem,
	RoadmapMilestone,
	RoadmapStats,
} from "./roadmap-types";

export const roadmapItems: RoadmapItem[] = [
	{
		id: "core-analytics",
		title: "Core Analytics",
		description:
			"Page views, clicks, conversions, funnels, goals, and retention tracking",
		status: "completed",
		priority: "critical",
		category: "analytics",
		targetDate: "2025-06-16",
		completedDate: "2025-06-16",
		progress: 100,
		features: [
			"Event tracking",
			"Funnels",
			"Goals",
			"Retention cohorts",
			"Privacy-first",
		],
		tags: ["foundation"],
	},
	{
		id: "lightweight-sdks",
		title: "Lightweight SDKs",
		description: "JavaScript, React, Next.js, Vue, Nuxt, Bun, and Node.js SDKs",
		status: "completed",
		priority: "critical",
		category: "developer-experience",
		targetDate: "2025-05-07",
		completedDate: "2025-05-07",
		progress: 100,
		features: [
			"JS/React/Next.js",
			"Vue and Nuxt",
			"Bun support",
			"Node.js SDK",
			"GDPR compliant",
		],
		tags: ["sdk"],
	},
	{
		id: "error-tracking",
		title: "Error Tracking",
		description: "JavaScript error capture, analysis, and trend visualization",
		status: "completed",
		priority: "high",
		category: "analytics",
		targetDate: "2025-06-16",
		completedDate: "2025-06-16",
		progress: 100,
		features: [
			"Error capture",
			"Stack traces",
			"Error trends",
			"Top errors dashboard",
		],
		tags: ["errors", "debugging"],
	},
	{
		id: "user-tracking",
		title: "User Analytics",
		description: "Individual user behavior tracking with sessions and profiles",
		status: "completed",
		priority: "high",
		category: "analytics",
		targetDate: "2025-09-28",
		completedDate: "2025-09-28",
		progress: 100,
		features: ["User profiles", "Event history", "User journey"],
		tags: ["users", "sessions"],
	},
	{
		id: "feature-flags",
		title: "Feature Flags",
		description:
			"Type-safe feature flags with targeting, rollouts, and schedules",
		status: "completed",
		priority: "high",
		category: "developer-experience",
		targetDate: "2025-09-30",
		completedDate: "2025-09-30",
		progress: 100,
		features: [
			"Type-safe flags",
			"Progressive rollouts",
			"User targeting rules",
			"Target groups",
			"Flag dependencies",
			"Scheduled rollouts",
		],
		tags: ["feature-flags", "targeting"],
	},
	{
		id: "data-export",
		title: "Data Export",
		description: "Export analytics data in multiple formats",
		status: "completed",
		priority: "low",
		category: "developer-experience",
		targetDate: "2025-09-27",
		completedDate: "2025-09-27",
		progress: 100,
		features: ["CSV export", "JSON export", "Date range selection"],
		tags: ["export", "data"],
	},
	{
		id: "annotations",
		title: "Chart Annotations",
		description: "Add context to charts with annotations and markers",
		status: "completed",
		priority: "low",
		category: "analytics",
		targetDate: "2025-10-14",
		completedDate: "2025-10-14",
		progress: 100,
		features: ["Deploy markers", "Event annotations", "Custom notes"],
		tags: ["annotations", "visualization"],
	},
	{
		id: "web-vitals",
		title: "Web Vitals & Performance",
		description:
			"Core Web Vitals monitoring with LCP, FCP, CLS, INP, and TTFB tracking",
		status: "completed",
		priority: "high",
		category: "analytics",
		targetDate: "2025-12-02",
		completedDate: "2025-12-02",
		progress: 100,
		features: ["LCP/FCP/CLS/INP/TTFB", "Real Experience Score"],
		tags: ["performance", "vitals"],
	},
	{
		id: "sso",
		title: "SSO Authentication",
		description: "Enterprise SSO with OIDC and SAML support",
		status: "completed",
		priority: "medium",
		category: "developer-experience",
		targetDate: "2025-12-04",
		completedDate: "2025-12-04",
		progress: 100,
		features: ["OIDC providers", "SAML providers", "Organization provisioning"],
		tags: ["sso", "enterprise"],
	},
	{
		id: "uptime-monitoring",
		title: "Uptime Monitoring",
		description: "Endpoint monitoring with configurable check intervals",
		status: "completed",
		priority: "medium",
		category: "analytics",
		targetDate: "2026-01-13",
		completedDate: "2026-01-13",
		progress: 100,
		features: [
			"Configurable intervals",
			"Uptime heatmaps",
			"Status pages",
			"Downtime alerts",
		],
		tags: ["uptime", "monitoring"],
	},
	{
		id: "notifications",
		title: "Notification System",
		description: "Multi-channel notifications for alerts and reports",
		status: "completed",
		priority: "medium",
		category: "integrations",
		targetDate: "2026-01-13",
		completedDate: "2026-01-13",
		progress: 100,
		features: ["Slack notifications", "Email notifications", "Custom webhooks"],
		tags: ["notifications", "alerts"],
	},
	{
		id: "llm-analytics",
		title: "LLM Analytics",
		description: "Track and analyze AI/LLM API calls with cost and performance",
		status: "completed",
		priority: "high",
		category: "AI",
		targetDate: "2026-01-14",
		completedDate: "2026-01-14",
		progress: 100,
		features: [
			"Cost tracking",
			"Token usage",
			"Latency metrics",
			"Error analysis",
			"Trace visualization",
			"Model comparison",
		],
		tags: ["llm", "ai", "observability"],
	},
	{
		id: "link-shortener",
		title: "Link Shortener",
		description:
			"Full-featured link shortening with analytics and device targeting",
		status: "completed",
		priority: "medium",
		category: "analytics",
		targetDate: "2026-01-17",
		completedDate: "2026-01-17",
		progress: 100,
		features: [
			"Click analytics",
			"Custom OG tags",
			"Device targeting (iOS/Android)",
			"Bot detection",
			"Rate limiting",
			"QR codes",
		],
		tags: ["links", "marketing"],
	},
	{
		id: "smart-insights",
		title: "Automatic Investigations",
		description:
			"An intelligence agent investigates signals from your data and reports its findings in a case timeline",
		status: "completed",
		priority: "medium",
		category: "AI",
		targetDate: "2026-03-27",
		completedDate: "2026-03-27",
		progress: 100,
		features: [
			"Error spike detection",
			"Vitals degradation",
			"Route health",
			"Funnel drop-offs",
			"Goal changes",
		],
		tags: ["investigations", "automation"],
	},

	{
		id: "insights-brief",
		title: "Insights Brief",
		description:
			"A chronological brief of agent observations, including improvements and recoveries, with investigations as a smaller durable work queue",
		status: "in-progress",
		priority: "critical",
		category: "AI",
		features: [
			"Chronological observation feed",
			"Improvements and recoveries surfaced",
			"Quiet rechecks without alert noise",
			"Same case thread across dashboard, Slack, and MCP",
		],
		tags: ["insights", "investigations"],
	},
	{
		id: "investigation-quality",
		title: "Investigation Quality",
		description:
			"Grading agent output against real production data until root cause, impact, next action, and verification are consistently useful",
		status: "in-progress",
		priority: "high",
		category: "AI",
		features: [
			"Grading against production data",
			"Exact entity definitions preserved end to end",
			"Business meaning researched before asking",
			"Goal and funnel meaning captured during investigations",
		],
		tags: ["AI", "quality"],
	},

	{
		id: "deeper-website-runs",
		title: "Deeper Website Runs",
		description:
			"Let a website run continue past the first useful signal, with a cost cap and one independent agent turn per subject",
		status: "planned",
		priority: "high",
		category: "AI",
		features: [
			"Multiple signals per run",
			"Cost caps",
			"Independent agent turn per subject",
		],
		tags: ["AI", "investigations"],
	},
	{
		id: "investigation-to-pr",
		title: "Investigation to Pull Request",
		description:
			"The agent proposes a patch and verification plan, Databuddy validates it and opens one linked PR, then verifies the signal after merge",
		status: "planned",
		priority: "high",
		category: "AI",
		features: [
			"Patch proposals without write credentials",
			"Validated patches",
			"One linked PR per case",
			"Resume on review events",
			"Post-merge verification",
		],
		tags: ["AI", "automation"],
	},
];

const roadmapMilestones: RoadmapMilestone[] = [
	{
		id: "core-platform",
		title: "Core Platform",
		description: "Analytics, SDKs, performance monitoring, and error tracking",
		targetDate: "2025-12-02",
		status: "completed",
		items: [
			"core-analytics",
			"lightweight-sdks",
			"web-vitals",
			"error-tracking",
		],
		progress: 100,
	},
	{
		id: "developer-tools",
		title: "Developer Tools",
		description: "Feature flags, SSO, exports, and notifications",
		targetDate: "2026-01-13",
		status: "completed",
		items: ["feature-flags", "sso", "data-export", "notifications"],
		progress: 100,
	},
	{
		id: "ai-observability",
		title: "AI Observability",
		description: "LLM analytics, automatic investigations, and cost tracking",
		targetDate: "2026-03-27",
		status: "completed",
		items: ["llm-analytics", "smart-insights"],
		progress: 100,
	},
	{
		id: "intelligence-quality",
		title: "Intelligence Quality",
		description:
			"A useful insights brief and investigations graded against production data",
		status: "current",
		items: ["insights-brief", "investigation-quality"],
		progress: 0,
	},
	{
		id: "investigation-to-fix",
		title: "Investigation to Fix",
		description:
			"Deeper website runs and agent-proposed patches verified after merge",
		status: "upcoming",
		items: ["deeper-website-runs", "investigation-to-pr"],
		progress: 0,
	},
];

export const calculateRoadmapStats = (): RoadmapStats => {
	const totalItems = roadmapItems.length;
	const completedItems = roadmapItems.filter(
		(item) => item.status === "completed"
	).length;
	const inProgressItems = roadmapItems.filter(
		(item) => item.status === "in-progress"
	).length;
	const plannedItems = roadmapItems.filter(
		(item) => item.status === "planned"
	).length;
	const onHoldItems = roadmapItems.filter(
		(item) => item.status === "on-hold"
	).length;
	const cancelledItems = roadmapItems.filter(
		(item) => item.status === "cancelled"
	).length;

	const completedProgress = completedItems * 100;
	const inProgressProgress = roadmapItems
		.filter((item) => item.status === "in-progress")
		.reduce((sum, item) => sum + (item.progress || 0), 0);

	const overallProgress =
		totalItems > 0
			? Math.round((completedProgress + inProgressProgress) / totalItems)
			: 0;

	const currentDate = new Date();
	const currentQuarter = `Q${Math.ceil((currentDate.getMonth() + 1) / 3)} ${currentDate.getFullYear()}`;

	const upcomingMilestones = roadmapMilestones.filter(
		(milestone) =>
			milestone.status === "upcoming" || milestone.status === "current"
	).length;

	return {
		totalItems,
		completedItems,
		inProgressItems,
		plannedItems,
		onHoldItems,
		cancelledItems,
		overallProgress,
		currentQuarter,
		upcomingMilestones,
	};
};
