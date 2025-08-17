import type {
	RoadmapItem,
	RoadmapMilestone,
	RoadmapQuarter,
	RoadmapStats,
} from './roadmap-types';

// Databuddy Product Roadmap - Clean and focused
export const roadmapItems: RoadmapItem[] = [
	// COMPLETED
	{
		id: 'core-analytics',
		title: 'Core Analytics',
		description:
			'Page views, clicks, conversions, funnels, and retention tracking',
		status: 'completed',
		priority: 'critical',
		category: 'analytics',
		targetDate: '2024-12-31',
		completedDate: '2024-12-31',
		progress: 100,
		features: ['Event tracking', 'Funnels', 'Retention', 'Privacy-first'],
		assignees: ['core-team'],
		tags: ['foundation'],
	},
	{
		id: 'lightweight-sdks',
		title: 'Lightweight SDKs',
		description: 'JavaScript, React, Next.js, Bun, and Node.js SDKs',
		status: 'completed',
		priority: 'critical',
		category: 'developer-experience',
		targetDate: '2024-12-31',
		completedDate: '2024-12-31',
		progress: 100,
		features: ['JS/React/Next.js', 'Bun support', 'GDPR compliant'],
		assignees: ['sdk-team'],
		tags: ['sdk'],
	},

	// IN PROGRESS
	{
		id: 'ai-agent',
		title: 'AI Agent',
		description: 'Natural language querying and automated insights',
		status: 'in-progress',
		priority: 'high',
		category: 'AI',
		targetDate: '2025-09-30',
		progress: 35,
		features: [
			'Natural language queries',
			'Weekly summaries',
			'Anomaly detection',
		],
		assignees: ['ai-team'],
		tags: ['AI'],
	},
	{
		id: 'integrations',
		title: 'Core Integrations',
		description: 'Slack, GitHub, Stripe, and database connections',
		status: 'in-progress',
		priority: 'high',
		category: 'integrations',
		targetDate: '2025-09-30',
		progress: 25,
		features: ['Slack alerts', 'GitHub tracking', 'Stripe events'],
		assignees: ['integrations-team'],
		tags: ['integrations'],
	},

	// PLANNED - Mid term
	{
		id: 'feature-flags',
		title: 'Feature Flags',
		description: 'Type-safe feature flags with progressive rollouts',
		status: 'planned',
		priority: 'medium',
		category: 'developer-experience',
		targetDate: '2025-12-31',
		progress: 0,
		features: ['Type-safe flags', 'Progressive rollouts', 'Cohort targeting'],
		assignees: ['platform-team'],
		tags: ['feature-flags'],
	},
	{
		id: 'ab-testing',
		title: 'A/B Testing',
		description:
			'Experimentation framework to compare features and measure impact',
		status: 'planned',
		priority: 'medium',
		category: 'analytics',
		targetDate: '2026-03-31',
		progress: 0,
		features: [
			'Experiment setup',
			'Automatic statistical analysis',
			'Integration with feature flags',
			'AI-generated experiment summaries',
		],
		assignees: ['experimentation-team'],
		tags: ['experimentation', 'feature-flags', 'ai'],
	},
	{
		id: 'database-analytics',
		title: 'Database Analytics',
		description: 'Connect databases and track query performance',
		status: 'planned',
		priority: 'high',
		category: 'analytics',
		targetDate: '2026-06-30',
		progress: 0,
		features: ['Query metrics', 'Slow query detection', 'Table growth'],
		assignees: ['database-team'],
		tags: ['database'],
	},
];

export const roadmapQuarters: RoadmapQuarter[] = [
	{
		id: 'q4-2024',
		name: 'Q4 2024',
		startDate: '2024-10-01',
		endDate: '2024-12-31',
		items: roadmapItems.filter(
			(item) =>
				item.targetDate &&
				item.targetDate >= '2024-10-01' &&
				item.targetDate <= '2024-12-31'
		),
	},
	{
		id: 'q1-2025',
		name: 'Q1 2025',
		startDate: '2025-01-01',
		endDate: '2025-03-31',
		items: roadmapItems.filter(
			(item) =>
				item.targetDate &&
				item.targetDate >= '2025-01-01' &&
				item.targetDate <= '2025-03-31'
		),
	},
	{
		id: 'q2-2025',
		name: 'Q2 2025',
		startDate: '2025-04-01',
		endDate: '2025-06-30',
		items: roadmapItems.filter(
			(item) =>
				item.targetDate &&
				item.targetDate >= '2025-04-01' &&
				item.targetDate <= '2025-06-30'
		),
	},
	{
		id: 'q3-2025',
		name: 'Q3 2025',
		startDate: '2025-07-01',
		endDate: '2025-09-30',
		items: roadmapItems.filter(
			(item) =>
				item.targetDate &&
				item.targetDate >= '2025-07-01' &&
				item.targetDate <= '2025-09-30'
		),
	},
	{
		id: 'q4-2025',
		name: 'Q4 2025',
		startDate: '2025-10-01',
		endDate: '2025-12-31',
		items: roadmapItems.filter(
			(item) =>
				item.targetDate &&
				item.targetDate >= '2025-10-01' &&
				item.targetDate <= '2025-12-31'
		),
	},
];

export const roadmapMilestones: RoadmapMilestone[] = [
	{
		id: 'ai-launch',
		title: 'AI Agent Launch',
		description: 'Natural language querying and automated insights',
		targetDate: '2025-09-30',
		status: 'current',
		items: ['ai-agent'],
		progress: 35,
	},
	{
		id: 'integrations-complete',
		title: 'Core Integrations',
		description: 'Slack, GitHub, Stripe, and database connections',
		targetDate: '2025-06-30',
		status: 'current',
		items: ['integrations', 'database-analytics'],
		progress: 20,
	},
	{
		id: 'experimentation-platform',
		title: 'Experimentation Platform',
		description: 'Feature flags and A/B testing for data-driven decisions',
		targetDate: '2025-12-31',
		status: 'upcoming',
		items: ['feature-flags', 'ab-testing'],
		progress: 0,
	},
];

// Calculate stats dynamically
export const calculateRoadmapStats = (): RoadmapStats => {
	const totalItems = roadmapItems.length;
	const completedItems = roadmapItems.filter(
		(item) => item.status === 'completed'
	).length;
	const inProgressItems = roadmapItems.filter(
		(item) => item.status === 'in-progress'
	).length;
	const plannedItems = roadmapItems.filter(
		(item) => item.status === 'planned'
	).length;
	const onHoldItems = roadmapItems.filter(
		(item) => item.status === 'on-hold'
	).length;
	const cancelledItems = roadmapItems.filter(
		(item) => item.status === 'cancelled'
	).length;

	// Calculate overall progress based on completed items and progress of in-progress items
	const completedProgress = completedItems * 100;
	const inProgressProgress = roadmapItems
		.filter((item) => item.status === 'in-progress')
		.reduce((sum, item) => sum + (item.progress || 0), 0);

	const overallProgress =
		totalItems > 0
			? Math.round((completedProgress + inProgressProgress) / totalItems)
			: 0;

	const currentDate = new Date();
	const currentQuarter = `Q${Math.ceil((currentDate.getMonth() + 1) / 3)} ${currentDate.getFullYear()}`;

	const upcomingMilestones = roadmapMilestones.filter(
		(milestone) =>
			milestone.status === 'upcoming' || milestone.status === 'current'
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
