import type { useWebsite } from "@/hooks/use-websites";
import type { DynamicQueryFilter } from "@/stores/jotai/filterAtoms";

export interface DateRange {
	end_date: string;
	granularity?: "hourly" | "daily";
	start_date: string;
	timezone?: string;
}

export interface BaseTabProps {
	dateRange: DateRange;
	websiteId: string;
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
	bounce_rate?: number;
	date: string;
	pageviews?: number;
	sessions?: number;
	visitors?: number;
	[key: string]: string | number | undefined;
}

export interface TrackingOptions {
	batchSize: number;
	batchTimeout: number;
	disabled: boolean;
	enableBatching: boolean;
	enableRetries: boolean;
	initialRetryDelay: number;
	maxRetries: number;
	samplingRate: number;
	trackAttributes: boolean;
	trackErrors: boolean;
	trackHashChanges: boolean;
	trackInteractions: boolean;
	trackOutgoingLinks: boolean;
	trackPerformance: boolean;
	trackScreenViews: boolean;
	trackSessions: boolean;
	trackWebVitals: boolean;
}

export interface TrackingOptionConfig {
	data: string[];
	description: string;
	inverted?: boolean;
	key: keyof TrackingOptions;
	title: string;
}
