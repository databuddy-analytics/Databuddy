export type QueryFieldType =
	| "string"
	| "number"
	| "boolean"
	| "date"
	| "datetime"
	| "json";

export interface QueryOutputField {
	description?: string;
	example?: string | number | boolean | null;
	label?: string;
	name: string;
	type: QueryFieldType;
	unit?: string;
}

export type VisualizationType =
	| "table"
	| "timeseries"
	| "bar"
	| "pie"
	| "metric"
	| "area"
	| "line";

export interface QueryBuilderMeta {
	category?: string;
	default_visualization?: VisualizationType;
	deprecated?: boolean;
	description: string;
	docs_url?: string;
	output_example?: Record<string, string | number | boolean | null>[];
	output_fields?: QueryOutputField[];
	supports_granularity?: ("hour" | "day" | "week" | "month")[];
	tags?: string[];
	title: string;
	version?: string;
}

export interface QueryBuilderCatalogItem {
	allowedFilters: string[];
	customizable?: boolean;
	defaultLimit?: number;
	key: string;
	meta?: QueryBuilderMeta;
}
