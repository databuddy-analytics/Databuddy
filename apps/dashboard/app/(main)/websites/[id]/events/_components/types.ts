export interface CustomEventsSummary {
	total_events: number;
	unique_event_types: number;
	unique_users: number;
	unique_sessions: number;
	unique_pages: number;
}

export interface CustomEventItem {
	name: string;
	total_events: number;
	unique_users: number;
	unique_sessions: number;
	last_occurrence: string;
	first_occurrence: string;
	events_with_properties: number;
	percentage: number;
}

export interface RecentCustomEvent {
	name: string;
	event_name: string;
	path: string;
	properties: Record<string, unknown>;
	anonymous_id: string;
	session_id: string;
	timestamp: string;
}

export interface RawRecentCustomEvent {
	event_name: string;
	path: string;
	properties: string;
	anonymous_id: string;
	session_id: string;
	timestamp: string;
}

export interface CustomEventsTrend {
	date: string;
	total_events: number;
	unique_event_types: number;
	unique_users: number;
	unique_sessions?: number;
	unique_pages?: number;
}

export interface MiniChartDataPoint {
	date: string;
	value: number;
}

export type PropertyInferredType =
	|"boolean"
	|"numeric"
	|"datetime"
	|"url"
	|"categorical"
	|"aggregatable"
	|"text"
	|"high_cardinality";

export type PropertyRenderStrategy =
	|"distribution_bar" // Low cardinality (≤5) - show all values as bars
	|"top_n_chart" // Medium cardinality (≤20) - show all in chart
	|"top_n_with_other" // Aggregatable high cardinality - top N +"other"
	|"detail_only"; // Non-aggregatable - only in row view

export interface PropertyClassification {
	event_name: string;
	property_key: string;
	cardinality: number;
	total_count: number;
	coverage_ratio: number;
	avg_length: number;
	max_length: number;
	is_numeric: boolean;
	is_boolean: boolean;
	is_date_like: boolean;
	is_url_like: boolean;
	inferred_type: PropertyInferredType;
	render_strategy: PropertyRenderStrategy;
	sample_values: [string, number][];
}

export interface PropertyTopValue {
	event_name: string;
	property_key: string;
	property_value: string;
	count: number;
	total: number;
	percentage: number;
	rank: number;
}

export interface PropertyDistribution {
	event_name: string;
	property_key: string;
	property_value: string;
	count: number;
	total: number;
	percentage: number;
	cardinality: number;
}

export interface ClassifiedProperty {
	key: string;
	classification: PropertyClassification;
	values: PropertyTopValue[] | PropertyDistribution[];
}

export interface ClassifiedEvent {
	name: string;
	total_events: number;
	summaryProperties: ClassifiedProperty[];
	detailProperties: ClassifiedProperty[];
}
