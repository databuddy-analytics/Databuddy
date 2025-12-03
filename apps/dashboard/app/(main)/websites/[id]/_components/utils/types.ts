import type { DateRange as BaseDateRange } from "@databuddy/shared/types/analytics";
import type { DynamicQueryFilter } from "@databuddy/shared/types/api";
import type { Website } from "@databuddy/shared/types/website";

export type DateRange = BaseDateRange & {
	granularity?: "daily" | "hourly";
};

export type BaseTabProps = {
	websiteId: string;
	dateRange: DateRange;
};

export type FullTabProps = BaseTabProps & {
	websiteData: Website | undefined;
	isRefreshing: boolean;
	setIsRefreshing: (value: boolean) => void;
	filters: DynamicQueryFilter[];
	addFilter: (filter: DynamicQueryFilter) => void;
};

export type MetricPoint = {
	date: string;
	pageviews?: number;
	visitors?: number;
	sessions?: number;
	bounce_rate?: number;
	[key: string]: string | number | undefined;
};

export type TrackingOptions = {
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
};

export type TrackingOptionConfig = {
	key: keyof TrackingOptions;
	title: string;
	description: string;
	data: string[];
	inverted?: boolean;
};
