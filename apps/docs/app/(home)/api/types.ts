export const DEMO_QUERY_TYPES = new Set<string>([
	"summary_metrics",
	"today_metrics",
	"events_by_date",
	"top_pages",
	"entry_pages",
	"exit_pages",
	"page_time_analysis",
	"traffic_sources",
	"top_referrers",
	"utm_sources",
	"utm_mediums",
	"utm_campaigns",
	"device_types",
	"browser_name",
	"browsers",
	"os_name",
	"operating_systems",
	"outbound_domains",
	"country",
	"region",
	"city",
	"timezone",
	"language",
	"browser_versions",
	"screen_resolution",
	"vitals_overview",
	"vitals_time_series",
	"vitals_by_page",
	"vitals_by_country",
	"vitals_by_browser",
]);

interface DynamicQueryFilter {
	field: string;
	operator: string;
	value: string | number | boolean;
}

export interface DynamicQueryRequest {
	endDate?: string;
	filters?: DynamicQueryFilter[];
	granularity?: string;
	id: string;
	limit?: number;
	page?: number;
	parameters: string[];
	startDate?: string;
	timeZone?: string;
}

interface ParameterResult {
	data: unknown[];
	error?: string;
	parameter: string;
	success: boolean;
}

export interface DynamicQueryResponse {
	data: ParameterResult[];
	meta: {
		parameters: string[];
		total_parameters: number;
		page: number;
		limit: number;
		filters_applied: number;
	};
	queryId: string;
	success: boolean;
}

export interface BatchQueryResponse {
	batch: true;
	results: DynamicQueryResponse[];
	success: boolean;
}
