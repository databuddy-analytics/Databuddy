type QueryFieldType =
	| "string"
	| "number"
	| "boolean"
	| "date"
	| "datetime"
	| "json";

interface QueryOutputField {
	description?: string;
	example?: string | number | boolean | null;
	label?: string;
	name: string;
	type: QueryFieldType;
	unit?: string;
}

type VisualizationType =
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
	description: string;
	output_fields?: QueryOutputField[];
	supports_granularity?: ("hour" | "day" | "week" | "month")[];
	tags?: string[];
	title: string;
}
