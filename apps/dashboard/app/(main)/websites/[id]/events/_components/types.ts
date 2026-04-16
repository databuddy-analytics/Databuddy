export interface CustomEventsSummary {
	total_events: number;
	unique_event_types: number;
	unique_pages: number;
	unique_sessions: number;
	unique_users: number;
}

export interface CustomEventItem {
	events_with_properties: number;
	first_occurrence: string;
	last_occurrence: string;
	name: string;
	percentage: number;
	total_events: number;
	unique_sessions: number;
	unique_users: number;
}

export interface RecentCustomEvent {
	anonymous_id: string;
	event_name: string;
	name: string;
	path: string;
	properties: Record<string, unknown>;
	session_id: string;
	timestamp: string;
}

export interface RawRecentCustomEvent {
	anonymous_id: string;
	event_name: string;
	path: string;
	properties: string;
	session_id: string;
	timestamp: string;
}

export interface CustomEventsTrend {
	date: string;
	total_events: number;
	unique_event_types: number;
	unique_pages?: number;
	unique_sessions?: number;
	unique_users: number;
}

export interface MiniChartDataPoint {
	date: string;
	value: number;
}

export type PropertyInferredType =
	| "boolean"
	| "numeric"
	| "datetime"
	| "url"
	| "categorical"
	| "aggregatable"
	| "text"
	| "high_cardinality";

export type PropertyRenderStrategy =
	| "distribution_bar" // Low cardinality (≤5) - show all values as bars
	| "top_n_chart" // Medium cardinality (≤20) - show all in chart
	| "top_n_with_other" // Aggregatable high cardinality - top N + "other"
	| "detail_only"; // Non-aggregatable - only in row view

export interface PropertyClassification {
	avg_length: number;
	cardinality: number;
	coverage_ratio: number;
	event_name: string;
	inferred_type: PropertyInferredType;
	is_boolean: boolean;
	is_date_like: boolean;
	is_numeric: boolean;
	is_url_like: boolean;
	max_length: number;
	property_key: string;
	render_strategy: PropertyRenderStrategy;
	sample_values: [string, number][];
	total_count: number;
}

export interface PropertyTopValue {
	count: number;
	event_name: string;
	percentage: number;
	property_key: string;
	property_value: string;
	rank: number;
	total: number;
}

export interface PropertyDistribution {
	cardinality: number;
	count: number;
	event_name: string;
	percentage: number;
	property_key: string;
	property_value: string;
	total: number;
}

export interface ClassifiedProperty {
	classification: PropertyClassification;
	key: string;
	values: PropertyTopValue[] | PropertyDistribution[];
}

export interface ClassifiedEvent {
	detailProperties: ClassifiedProperty[];
	name: string;
	summaryProperties: ClassifiedProperty[];
	total_events: number;
}
