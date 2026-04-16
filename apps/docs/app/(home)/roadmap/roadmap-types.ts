export type RoadmapStatus =
	| "completed"
	| "in-progress"
	| "planned"
	| "cancelled"
	| "on-hold";

export type RoadmapPriority = "critical" | "high" | "medium" | "low";

export type RoadmapCategory =
	| "analytics"
	| "AI"
	| "integrations"
	| "developer-experience";

export interface RoadmapItem {
	assignees?: string[]; // GitHub usernames
	category: RoadmapCategory;
	completedDate?: string; // ISO date string
	description: string;
	features?: string[]; // List of key features/tasks
	githubIssue?: string; // GitHub issue URL
	githubPR?: string; // GitHub PR URL
	id: string;
	priority: RoadmapPriority;
	progress?: number; // 0-100 percentage
	startDate?: string; // ISO date string
	status: RoadmapStatus;
	tags?: string[]; // Additional tags
	targetDate?: string; // ISO date string
	title: string;
}

export interface RoadmapQuarter {
	endDate: string;
	id: string;
	items: RoadmapItem[];
	name: string; // e.g., "Q1 2024"
	startDate: string;
}

export interface RoadmapStats {
	cancelledItems: number;
	completedItems: number;
	currentQuarter: string;
	inProgressItems: number;
	onHoldItems: number;
	overallProgress: number; // 0-100 percentage
	plannedItems: number;
	totalItems: number;
	upcomingMilestones: number;
}

export interface RoadmapMilestone {
	description: string;
	id: string;
	items: string[]; // RoadmapItem IDs
	progress: number; // 0-100 percentage
	status: "upcoming" | "current" | "completed" | "delayed";
	targetDate: string;
	title: string;
}
