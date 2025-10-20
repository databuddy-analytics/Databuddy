// Billing and usage types

export interface DailyUsageRow {
	date: string;
	event_count: number;
}

export interface DailyUsageByTypeRow {
	date: string;
	event_category: string;
	event_count: number;
}

export interface EventTypeBreakdown {
	event_category: string;
	event_count: number;
}

export interface UsageResponse {
	totalEvents: number;
	dailyUsage: DailyUsageRow[];
	dailyUsageByType: DailyUsageByTypeRow[];
	eventTypeBreakdown: EventTypeBreakdown[];
	websiteCount: number;
	dateRange: {
		startDate: string;
		endDate: string;
	};
}
