export interface FunnelStep {
	conditions?: Record<string, unknown>;
	name: string;
	target: string;
	type: "PAGE_VIEW" | "EVENT" | "CUSTOM";
}

export interface FunnelFilter {
	field: string;
	label?: string;
	operator: "equals" | "contains" | "not_equals" | "in" | "not_in";
	value: string | string[];
}

export interface Funnel {
	createdAt: string;
	description?: string | null;
	filters?: FunnelFilter[];
	id: string;
	ignoreHistoricData?: boolean;
	isActive: boolean;
	name: string;
	steps: FunnelStep[];
	updatedAt: string;
}

export interface CreateFunnelData {
	description?: string;
	filters?: FunnelFilter[];
	ignoreHistoricData?: boolean;
	name: string;
	steps: FunnelStep[];
}

export interface StepErrorInsight {
	count: number;
	error_type: string;
	message: string;
}

export interface FunnelStepAnalytics {
	avg_time_to_complete: number;
	conversion_rate: number;
	dropoff_rate: number;
	dropoffs: number;
	error_count: number;
	error_rate: number;
	step_name: string;
	step_number: number;
	top_errors: StepErrorInsight[];
	total_users: number;
	users: number;
}

export interface FunnelErrorInsights {
	dropoffs_with_errors: number;
	error_correlation_rate: number;
	sessions_with_errors: number;
	total_errors: number;
}

export interface FunnelTimeSeriesPoint {
	avg_time: number;
	conversion_rate: number;
	conversions: number;
	date: string;
	dropoffs: number;
	errors?: number;
	users: number;
}

export interface FunnelAnalyticsData {
	avg_completion_time: number;
	avg_completion_time_formatted: string;
	biggest_dropoff_rate: number;
	biggest_dropoff_step: number;
	error_insights?: FunnelErrorInsights;
	overall_conversion_rate: number;
	steps_analytics: FunnelStepAnalytics[];
	time_series?: FunnelTimeSeriesPoint[];
	total_users_completed: number;
	total_users_entered: number;
}

export interface FunnelAnalyticsByReferrerResult {
	completed_users: number;
	conversion_rate: number;
	referrer: string;
	referrer_parsed: {
		name: string;
		type: string;
		domain: string;
	};
	total_users: number;
}
