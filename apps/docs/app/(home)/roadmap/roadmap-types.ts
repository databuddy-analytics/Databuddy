export type RoadmapStatus =
	| 'completed'
	| 'in-progress'
	| 'planned'
	| 'cancelled'
	| 'on-hold';

export type RoadmapPriority = 'critical' | 'high' | 'medium' | 'low';

export type RoadmapCategory =
	| 'analytics'
	| 'AI'
	| 'integrations'
	| 'developer-experience';

export interface RoadmapItem {
	id: string;
	title: string;
	description: string;
	status: RoadmapStatus;
	priority: RoadmapPriority;
	category: RoadmapCategory;
	startDate?: string; // ISO date string
	targetDate?: string; // ISO date string
	completedDate?: string; // ISO date string
	progress?: number; // 0-100 percentage
	features?: string[]; // List of key features/tasks
	githubIssue?: string; // GitHub issue URL
	githubPR?: string; // GitHub PR URL
	assignees?: string[]; // GitHub usernames
	tags?: string[]; // Additional tags
}

export interface RoadmapQuarter {
	id: string;
	name: string; // e.g., "Q1 2024"
	startDate: string;
	endDate: string;
	items: RoadmapItem[];
}

export interface RoadmapStats {
	totalItems: number;
	completedItems: number;
	inProgressItems: number;
	plannedItems: number;
	onHoldItems: number;
	cancelledItems: number;
	overallProgress: number; // 0-100 percentage
	currentQuarter: string;
	upcomingMilestones: number;
}

export interface RoadmapMilestone {
	id: string;
	title: string;
	description: string;
	targetDate: string;
	status: 'upcoming' | 'current' | 'completed' | 'delayed';
	items: string[]; // RoadmapItem IDs
	progress: number; // 0-100 percentage
}
