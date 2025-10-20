import type {
	DateRange as BaseDateRange,
	DynamicQueryFilter,
	Website,
} from '@databuddy/shared';

export interface DateRange extends BaseDateRange {
	granularity?: 'daily' | 'hourly';
}

export type SettingsTab = 'privacy' | 'export';

export interface BaseTabProps {
	websiteId: string;
	dateRange: DateRange;
}

export interface RefreshableTabProps extends BaseTabProps {
	isRefreshing: boolean;
	setIsRefreshing: (value: boolean) => void;
}

export interface WebsiteDataTabProps extends BaseTabProps {
	websiteData: Website | undefined;
	onWebsiteUpdated?: () => void;
}

export interface FullTabProps extends BaseTabProps {
	websiteData: Website | undefined;
	isRefreshing: boolean;
	setIsRefreshing: (value: boolean) => void;
	filters: DynamicQueryFilter[];
	addFilter: (filter: DynamicQueryFilter) => void;
}

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

export interface WebsiteFormData {
	name?: string;
	domain?: string;
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

export interface WebsiteHeaderProps {
	websiteData: Website;
	websiteId: string;
	onEditClick: () => void;
}

export interface SettingsNavigationProps {
	activeTab: SettingsTab;
	setActiveTab: (tab: SettingsTab) => void;
	onDeleteClick: () => void;
}

export interface TrackingCodeTabProps {
	trackingCode: string;
	npmCode: string;
	websiteData: Website;
	websiteId: string;
	copiedBlockId: string | null;
	onCopyCode: (code: string, blockId: string, message: string) => void;
}

export interface CodeBlockProps {
	code: string;
	description: string;
	copied: boolean;
	onCopy: () => void;
}

export interface TrackingTabProps {
	trackingOptions: TrackingOptions;
	onToggleOption: (option: keyof TrackingOptions) => void;
}

export interface OptimizationTabProps {
	trackingOptions: TrackingOptions;
	setTrackingOptions: (
		options: TrackingOptions | ((prev: TrackingOptions) => TrackingOptions)
	) => void;
}

export interface PrivacyTabProps {
	isPublic: boolean;
	onTogglePublic: () => void;
	websiteId: string;
}

export type ExportFormat = 'json' | 'csv' | 'txt' | 'proto';

export interface ExportTabProps {
	isExporting: boolean;
	onExportData: (
		format: ExportFormat,
		startDate?: string,
		endDate?: string
	) => void;
	websiteData: Website;
	websiteId: string;
}

export interface DeleteWebsiteDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	websiteData: Website;
	isDeleting: boolean;
	onConfirmDelete: () => void;
}

export interface TrackingOptionConfig {
	key: keyof TrackingOptions;
	title: string;
	description: string;
	data: string[];
	required?: boolean;
	inverted?: boolean;
}

export interface TrackingOptionCardProps {
	title: string;
	description: string;
	data: string[];
	enabled: boolean;
	onToggle: () => void;
	required?: boolean;
	inverted?: boolean;
}

export interface TrackingOptionsGridProps {
	title: string;
	description: string;
	options: TrackingOptionConfig[];
	trackingOptions: TrackingOptions;
	onToggleOption: (option: keyof TrackingOptions) => void;
}
