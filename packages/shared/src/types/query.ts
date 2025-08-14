export interface ApiResponse {
	success: boolean;
	error?: string;
}

export type QueryFieldType =
	| 'string'
	| 'number'
	| 'boolean'
	| 'date'
	| 'datetime'
	| 'json';

export interface QueryOutputField {
	name: string;
	type: QueryFieldType;
	label?: string;
	description?: string;
	unit?: string;
	example?: string | number | boolean | null;
}

export type VisualizationType =
	| 'table'
	| 'timeseries'
	| 'bar'
	| 'pie'
	| 'metric'
	| 'area'
	| 'line';

export interface QueryBuilderMeta {
	title: string;
	description: string;
	category?: string;
	tags?: string[];
	output_fields?: QueryOutputField[];
	output_example?: Record<string, string | number | boolean | null>[];
	default_visualization?: VisualizationType;
	supports_granularity?: ('hour' | 'day' | 'week' | 'month')[];
	version?: string;
	deprecated?: boolean;
	docs_url?: string;
}

export interface QueryBuilderCatalogItem {
	key: string;
	allowedFilters: string[];
	customizable?: boolean;
	defaultLimit?: number;
	meta?: QueryBuilderMeta;
}
