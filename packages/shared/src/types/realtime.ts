// Real-time analytics types

export interface ActiveStatsData {
	active_users: number;
}

export interface LatestEventData {
	[key: string]: any;
}

export interface TodayMetricsData {
	pageviews: number;
	sessions: number;
	visitors: number;
}

export interface EventsByDateData {
	active_stats: ActiveStatsData;
	bounce_rate: number;
	date: string;
	latest_events: LatestEventData;
	median_session_duration: number;
	pageviews: number;
	revenue_by_card_brand: unknown;
	revenue_by_currency: unknown;
	sessions: number;
	unique_visitors: number;
	visitors: number;
}
