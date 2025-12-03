export type FunnelStepAnalytics = {
	step_number: number;
	step_name: string;
	users: number;
	total_users: number;
	conversion_rate: number;
	dropoffs: number;
	dropoff_rate: number;
	avg_time_to_complete: number;
};

export type FunnelTimeSeriesPoint = {
	date: string;
	users: number;
	conversions: number;
	conversion_rate: number;
	dropoffs: number;
	avg_time: number;
};

export type FunnelAnalyticsData = {
	overall_conversion_rate: number;
	total_users_entered: number;
	total_users_completed: number;
	avg_completion_time: number;
	avg_completion_time_formatted: string;
	biggest_dropoff_step: number;
	biggest_dropoff_rate: number;
	steps_analytics: FunnelStepAnalytics[];
	time_series?: FunnelTimeSeriesPoint[];
};
