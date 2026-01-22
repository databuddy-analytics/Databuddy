import type { CustomQueryConfig } from"@databuddy/shared/types/custom-query";
import type { StatCardDisplayMode } from"@/components/analytics/stat-card";

/** Filter operator types */
export type FilterOperator =
	|"eq"
	|"ne"
	|"contains"
	|"not_contains"
	|"starts_with";

/** Single filter condition */
export interface CardFilter {
	field: string;
	operator: FilterOperator;
	value: string;
}

/** Date range preset for cards */
export type DateRangePreset =
	|"global"
	|"today"
	|"yesterday"
	|"last_7_days"
	|"last_14_days"
	|"last_30_days"
	|"last_90_days"
	|"this_month"
	|"last_month";

/** Data source mode for cards */
export type DataSourceMode ="predefined" |"custom";

/** Base config all dashboard widgets share */
export interface DashboardWidgetBase {
	id: string;
	/** Predefined query type - used when dataSourceMode is 'predefined' */
	queryType: string;
	category?: string;
	title?: string;
	/** Filters to apply to this widget's data */
	filters?: CardFilter[];
	/** Date range preset - defaults to 'global' */
	dateRangePreset?: DateRangePreset;
	/** Data source mode - 'predefined' uses queryType, 'custom' uses customQuery */
	dataSourceMode?: DataSourceMode;
	/** Custom query config - used when dataSourceMode is 'custom' */
	customQuery?: CustomQueryConfig;
}

/** Card widget - displays a single value with optional chart */
export interface DashboardCardConfig extends DashboardWidgetBase {
	type:"card";
	field: string;
	label: string;
	displayMode: StatCardDisplayMode;
}

/** Table widget - displays multiple rows with multiple columns */
export interface DashboardTableConfig extends DashboardWidgetBase {
	type:"table";
	fields: string[];
	labels?: Record<string, string>;
	limit?: number;
}

/** Chart widget - displays time series with multiple series */
export interface DashboardChartConfig extends DashboardWidgetBase {
	type:"chart";
	fields: string[];
	labels?: Record<string, string>;
	chartType:"area" |"bar" |"line";
}

/** Union of all widget types */
export type DashboardWidgetConfig =
	| DashboardCardConfig
	| DashboardTableConfig
	| DashboardChartConfig;

/** Query data types */
export type QueryCell = string | number | boolean | null;
export type QueryRow = Record<string, QueryCell>;
export type QueryDataMap = Record<string, QueryRow[]>;
