import type {
	RoadmapItem,
	RoadmapMilestone,
	RoadmapQuarter,
	RoadmapStats,
} from "./roadmap-types";

// Databuddy Product Roadmap - Clean and focused
export const roadmapItems: RoadmapItem[] = [
	// COMPLETED
	{
		id: "core-analytics",
		title: "Core Analytics",
		description:
			"Page views, clicks, conversions, funnels, goals, and retention tracking",
		status: "completed",
		priority: "critical",
		category: "analytics",
		targetDate: "2024-12-31",
		completedDate: "2024-12-31",
		progress: 100,
		features: [
			"Event tracking",
			"Funnels",
			"Goals",
			"Retention cohorts",
			"Privacy-first",
		],
		assignees: ["core-team"],
		tags: ["foundation"],
	},
	{
		id: "lightweight-sdks",
		title: "Lightweight SDKs",
		description: "JavaScript, React, Next.js, Bun, and Node.js SDKs",
		status: "completed",
		priority: "critical",
		category: "developer-experience",
		targetDate: "2024-12-31",
		completedDate: "2024-12-31",
		progress: 100,
		features: [
			"JS/React/Next.js",
			"Bun support",
			"Node.js SDK",
			"GDPR compliant",
		],
		assignees: ["sdk-team"],
		tags: ["sdk"],
	},
	{
		id: "web-vitals",
		title: "Web Vitals & Performance",
		description:
			"Core Web Vitals monitoring with LCP, FCP, CLS, INP, and TTFB tracking",
		status: "completed",
		priority: "high",
		category: "analytics",
		targetDate: "2025-01-15",
		completedDate: "2025-01-15",
		progress: 100,
		features: [
			"LCP/FCP/CLS/INP/TTFB",
			"Real Experience Score",
			"Performance insights",
			"Threshold alerts",
		],
		assignees: ["core-team"],
		tags: ["performance", "vitals"],
	},
	{
		id: "error-tracking",
		title: "Error Tracking",
		description: "JavaScript error capture, analysis, and trend visualization",
		status: "completed",
		priority: "high",
		category: "analytics",
		targetDate: "2025-01-15",
		completedDate: "2025-01-15",
		progress: 100,
		features: [
			"Error capture",
			"Stack traces",
			"Error trends",
			"Top errors dashboard",
		],
		assignees: ["core-team"],
		tags: ["errors", "debugging"],
	},
	{
		id: "user-tracking",
		title: "User Analytics",
		description:
			"Individual user behavior tracking with sessions and profiles",
		status: "completed",
		priority: "high",
		category: "analytics",
		targetDate: "2025-01-15",
		completedDate: "2025-01-15",
		progress: 100,
		features: [
			"User profiles",
			"Event history",
			"User journey",
		],
		assignees: ["core-team"],
		tags: ["users", "sessions"],
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
		assignees: ["core-team"],
		tags: ["links", "marketing"],
	},
	{
		id: "uptime-monitoring",
		title: "Uptime Monitoring",
		description: "Endpoint monitoring with configurable check intervals",
		status: "completed",
		priority: "medium",
		category: "analytics",
		targetDate: "2025-06-30",
		completedDate: "2025-06-30",
		progress: 100,
		features: [
			"Configurable intervals",
			"Uptime heatmaps",
			"Status pages",
			"Downtime alerts",
		],
		assignees: ["core-team"],
		tags: ["uptime", "monitoring"],
	},
	{
		id: "feature-flags",
		title: "Feature Flags",
		description: "Type-safe feature flags with targeting, rollouts, and schedules",
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
		assignees: ["platform-team"],
		tags: ["feature-flags", "targeting"],
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
		assignees: ["ai-team"],
		tags: ["llm", "ai", "observability"],
	},
	{
		id: "smart-insights",
		title: "Smart Insights",
		description: "Automated insights for anomalies, errors, and performance issues",
		status: "completed",
		priority: "medium",
		category: "AI",
		targetDate: "2025-09-30",
		completedDate: "2025-09-30",
		progress: 100,
		features: [
			"Error spike detection",
			"Vitals degradation alerts",
			"Traffic anomalies",
			"Uptime issues",
		],
		assignees: ["ai-team"],
		tags: ["insights", "automation"],
	},
	{
		id: "notifications",
		title: "Notification System",
		description: "Multi-channel notifications for alerts and reports",
		status: "completed",
		priority: "medium",
		category: "integrations",
		targetDate: "2025-06-30",
		completedDate: "2025-06-30",
		progress: 100,
		features: [
			"Slack webhooks",
			"Discord webhooks",
			"Email notifications",
			"Custom webhooks",
		],
		assignees: ["integrations-team"],
		tags: ["notifications", "alerts"],
	},
	{
		id: "data-export",
		title: "Data Export",
		description: "Export analytics data in multiple formats",
		status: "completed",
		priority: "low",
		category: "developer-experience",
		targetDate: "2025-06-30",
		completedDate: "2025-06-30",
		progress: 100,
		features: ["CSV export", "JSON export", "Date range selection"],
		assignees: ["core-team"],
		tags: ["export", "data"],
	},
	{
		id: "sso",
		title: "SSO Authentication",
		description: "Enterprise SSO with OIDC and SAML support",
		status: "completed",
		priority: "medium",
		category: "developer-experience",
		targetDate: "2025-06-30",
		completedDate: "2025-06-30",
		progress: 100,
		features: ["OIDC providers", "SAML providers", "Domain verification"],
		assignees: ["auth-team"],
		tags: ["sso", "enterprise"],
	},
	{
		id: "annotations",
		title: "Chart Annotations",
		description: "Add context to charts with annotations and markers",
		status: "completed",
		priority: "low",
		category: "analytics",
		targetDate: "2025-06-30",
		completedDate: "2025-06-30",
		progress: 100,
		features: ["Deploy markers", "Event annotations", "Custom notes"],
		assignees: ["core-team"],
		tags: ["annotations", "visualization"],
	},

	// IN PROGRESS
	{
		id: "ai-agent",
		title: "AI Agent",
		description: "Natural language querying with autonomous analytics agents",
		status: "in-progress",
		priority: "critical",
		category: "AI",
		targetDate: "2026-03-31",
		progress: 70,
		features: [
			"Natural language queries",
			"SQL generation",
			"Funnel analysis",
			"Annotations via chat",
			"Link management",
			"Multi-agent orchestration",
		],
		assignees: ["ai-team"],
		tags: ["AI", "agents"],
	},
	{
		id: "ai-capabilities",
		title: "Advanced AI Features",
		description: "Anomaly detection, correlation engine, and auto-insights",
		status: "in-progress",
		priority: "high",
		category: "AI",
		targetDate: "2026-06-30",
		progress: 40,
		features: [
			"Anomaly detection",
			"Correlation engine",
			"Auto-generated insights",
			"Weekly summaries",
		],
		assignees: ["ai-team"],
		tags: ["AI", "automation"],
	},

	// PLANNED
	{
		id: "ab-testing",
		title: "A/B Testing",
		description:
			"Experimentation framework with statistical analysis",
		status: "planned",
		priority: "high",
		category: "analytics",
		targetDate: "2026-06-30",
		progress: 0,
		features: [
			"Experiment setup",
			"Statistical significance",
			"Feature flag integration",
			"AI-generated summaries",
		],
		assignees: ["experimentation-team"],
		tags: ["experimentation", "feature-flags"],
	},
	{
		id: "database-analytics",
		title: "Database Analytics",
		description: "Connect databases and track query performance",
		status: "planned",
		priority: "medium",
		category: "analytics",
		targetDate: "2026-09-30",
		progress: 0,
		features: ["Query metrics", "Slow query detection", "Table growth"],
		assignees: ["database-team"],
		tags: ["database"],
	},
	{
		id: "heatmaps",
		title: "Heatmaps & Click Maps",
		description: "Visual representation of user interactions on pages",
		status: "planned",
		priority: "low",
		category: "analytics",
		targetDate: "2026-12-31",
		progress: 0,
		features: ["Click heatmaps", "Scroll depth", "Rage click detection"],
		assignees: ["core-team"],
		tags: ["heatmaps", "ux"],
	},
];

export const roadmapQuarters: RoadmapQuarter[] = [
	{
		id: "q4-2024",
		name: "Q4 2024",
		startDate: "2024-10-01",
		endDate: "2024-12-31",
		items: roadmapItems.filter(
			(item) =>
				item.targetDate &&
				item.targetDate >= "2024-10-01" &&
				item.targetDate <= "2024-12-31"
		),
	},
	{
		id: "q1-2025",
		name: "Q1 2025",
		startDate: "2025-01-01",
		endDate: "2025-03-31",
		items: roadmapItems.filter(
			(item) =>
				item.targetDate &&
				item.targetDate >= "2025-01-01" &&
				item.targetDate <= "2025-03-31"
		),
	},
	{
		id: "q2-2025",
		name: "Q2 2025",
		startDate: "2025-04-01",
		endDate: "2025-06-30",
		items: roadmapItems.filter(
			(item) =>
				item.targetDate &&
				item.targetDate >= "2025-04-01" &&
				item.targetDate <= "2025-06-30"
		),
	},
	{
		id: "q3-2025",
		name: "Q3 2025",
		startDate: "2025-07-01",
		endDate: "2025-09-30",
		items: roadmapItems.filter(
			(item) =>
				item.targetDate &&
				item.targetDate >= "2025-07-01" &&
				item.targetDate <= "2025-09-30"
		),
	},
	{
		id: "q4-2025",
		name: "Q4 2025",
		startDate: "2025-10-01",
		endDate: "2025-12-31",
		items: roadmapItems.filter(
			(item) =>
				item.targetDate &&
				item.targetDate >= "2025-10-01" &&
				item.targetDate <= "2025-12-31"
		),
	},
	{
		id: "q1-2026",
		name: "Q1 2026",
		startDate: "2026-01-01",
		endDate: "2026-03-31",
		items: roadmapItems.filter(
			(item) =>
				item.targetDate &&
				item.targetDate >= "2026-01-01" &&
				item.targetDate <= "2026-03-31"
		),
	},
	{
		id: "q2-2026",
		name: "Q2 2026",
		startDate: "2026-04-01",
		endDate: "2026-06-30",
		items: roadmapItems.filter(
			(item) =>
				item.targetDate &&
				item.targetDate >= "2026-04-01" &&
				item.targetDate <= "2026-06-30"
		),
	},
	{
		id: "q3-2026",
		name: "Q3 2026",
		startDate: "2026-07-01",
		endDate: "2026-09-30",
		items: roadmapItems.filter(
			(item) =>
				item.targetDate &&
				item.targetDate >= "2026-07-01" &&
				item.targetDate <= "2026-09-30"
		),
	},
	{
		id: "q4-2026",
		name: "Q4 2026",
		startDate: "2026-10-01",
		endDate: "2026-12-31",
		items: roadmapItems.filter(
			(item) =>
				item.targetDate &&
				item.targetDate >= "2026-10-01" &&
				item.targetDate <= "2026-12-31"
		),
	},
];

export const roadmapMilestones: RoadmapMilestone[] = [
	{
		id: "core-platform",
		title: "Core Platform",
		description: "Analytics, SDKs, performance monitoring, and error tracking",
		targetDate: "2025-01-15",
		status: "completed",
		items: ["core-analytics", "lightweight-sdks", "web-vitals", "error-tracking"],
		progress: 100,
	},
	{
		id: "developer-tools",
		title: "Developer Tools",
		description: "Feature flags, SSO, exports, and notifications",
		targetDate: "2025-09-30",
		status: "completed",
		items: ["feature-flags", "sso", "data-export", "notifications"],
		progress: 100,
	},
	{
		id: "ai-observability",
		title: "AI Observability",
		description: "LLM analytics, smart insights, and cost tracking",
		targetDate: "2026-01-14",
		status: "completed",
		items: ["llm-analytics", "smart-insights"],
		progress: 100,
	},
	{
		id: "ai-agent-launch",
		title: "AI Agent Launch",
		description: "Natural language querying with autonomous analytics agents",
		targetDate: "2026-03-31",
		status: "current",
		items: ["ai-agent", "ai-capabilities"],
		progress: 55,
	},
	{
		id: "experimentation-platform",
		title: "Experimentation Platform",
		description: "A/B testing and statistical analysis for data-driven decisions",
		targetDate: "2026-06-30",
		status: "upcoming",
		items: ["ab-testing"],
		progress: 0,
	},
	{
		id: "advanced-analytics",
		title: "Advanced Analytics",
		description: "Heatmaps, and database analytics",
		targetDate: "2026-12-31",
		status: "upcoming",
		items: ["heatmaps", "database-analytics"],
		progress: 0,
	},
];

// Calculate stats dynamically
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

	// Calculate overall progress based on completed items and progress of in-progress items
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
