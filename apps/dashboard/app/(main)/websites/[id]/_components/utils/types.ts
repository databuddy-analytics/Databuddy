import type { useWebsite } from"@/hooks/use-websites";
import type { DynamicQueryFilter } from"@/stores/jotai/filterAtoms";

export interface DateRange {
	start_date: string;
	end_date: string;
	granularity?:"hourly" |"daily";
	timezone?: string;
}

export interface BaseTabProps {
	websiteId: string;
	dateRange: DateRange;
}

export type WebsiteData = ReturnType<typeof useWebsite>["data"];

export type FullTabProps = BaseTabProps & {
	websiteData: WebsiteData;
	isRefreshing: boolean;
	setIsRefreshing: (value: boolean) => void;
	filters: DynamicQueryFilter[];
	addFilter: (filter: DynamicQueryFilter) => void;
};

export interface MetricPoint {
	date: string;
	pageviews?: number;
	visitors?: number;
	sessions?: number;
	bounce_rate?: number;
	[key: string]: string | number | undefined;
}

export interface TrackingOptions {
	disabled: boolean;
	trackScreenViews: boolean;
	trackHashChanges: boolean;
	trackSessions: boolean;
	trackAttributes: boolean;
	trackOutgoingLinks: boolean;
	trackInteractions: boolean;
	trackEngagement: boolean;
	trackScrollDepth: boolean;
	trackExitIntent: boolean;
	trackBounceRate: boolean;
	trackPerformance: boolean;
	trackWebVitals: boolean;
	trackErrors: boolean;
	samplingRate: number;
	enableRetries: boolean;
	maxRetries: number;
	initialRetryDelay: number;
	enableBatching: boolean;
	batchSize: number;
	batchTimeout: number;
}

export interface TrackingOptionConfig {
	key: keyof TrackingOptions;
	title: string;
	description: string;
	data: string[];
	inverted?: boolean;
}
