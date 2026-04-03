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
	dailyUsage: DailyUsageRow[];
	dailyUsageByType: DailyUsageByTypeRow[];
	dateRange: {
		startDate: string;
		endDate: string;
	};
	eventTypeBreakdown: EventTypeBreakdown[];
	totalEvents: number;
	websiteCount: number;
}
