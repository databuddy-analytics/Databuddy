import type {
	DateRange as BaseDateRange,
	DynamicQueryFilter,
	Website,
} from '@databuddy/shared';

// Extended date range with granularity
export interface DateRange extends BaseDateRange {
	granularity?: 'daily' | 'hourly';
}

// Base tab props shared across all tabs
export interface BaseTabProps {
	websiteId: string;
	dateRange: DateRange;
}

// Tab props with refresh functionality
export interface RefreshableTabProps extends BaseTabProps {
	isRefreshing: boolean;
	setIsRefreshing: (value: boolean) => void;
}

// Tab props with website data
export interface WebsiteDataTabProps extends BaseTabProps {
	websiteData: Website | undefined;
	onWebsiteUpdated?: () => void;
}

// Combined tab props that include all features
export interface FullTabProps extends BaseTabProps {
	websiteData: Website | undefined;
	isRefreshing: boolean;
	setIsRefreshing: (value: boolean) => void;
	filters: DynamicQueryFilter[];
	addFilter: (filter: DynamicQueryFilter) => void;
}

// Common analytics data types
export interface MetricPoint {
	date: string;
	pageviews?: number;
	visitors?: number;
	sessions?: number;
	bounce_rate?: number;
	[key: string]: any;
}

export interface DistributionItem {
	name: string;
	value: number;
}

export interface TableColumn {
	accessorKey: string;
	header: string;
	cell?: (value: any, row?: any) => React.ReactNode;
	className?: string;
}

// Settings-related types
export interface WebsiteFormData {
	name?: string;
	domain?: string;
}

export interface TrackingOptions {
	// Core tracking
	disabled: boolean;
	trackScreenViews: boolean;
	trackHashChanges: boolean;
	trackSessions: boolean;

	// Interaction tracking
	trackAttributes: boolean;
	trackOutgoingLinks: boolean;
	trackInteractions: boolean;

	// Advanced tracking
	trackEngagement: boolean;
	trackScrollDepth: boolean;
	trackExitIntent: boolean;
	trackBounceRate: boolean;

	// Performance tracking
	trackPerformance: boolean;
	trackWebVitals: boolean;
	trackErrors: boolean;

	// Optimization
	samplingRate: number;
	enableRetries: boolean;
	maxRetries: number;
	initialRetryDelay: number;

	// Batching
	enableBatching: boolean;
	batchSize: number;
	batchTimeout: number;
}
