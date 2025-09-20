import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { toast } from 'sonner';
import { getUserTimezone } from '@/lib/timezone';

dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);

type Granularity = 'daily' | 'hourly';

interface DataItem {
	[key: string]: any;
}

interface ChartDataPoint {
	name: string;
	value: number;
	color?: string;
}

// Helper to handle generic data refresh
export const handleDataRefresh = async (
	isRefreshing: boolean,
	refetchFn: () => Promise<any>,
	setIsRefreshing: (value: boolean) => void,
	_successMessage = 'Data has been updated'
): Promise<void> => {
	if (!isRefreshing) {
		return;
	}

	try {
		// Do the actual data refetch
		const result = await refetchFn();
		return result;
	} catch (error) {
		toast.error('Failed to refresh data');
		console.error(error);
		throw error;
	} finally {
		// Always reset the refreshing state when done
		setIsRefreshing(false);
	}
};

// Safe date parsing with fallback
export const safeParseDate = (
	date: string | Date | null | undefined
): dayjs.Dayjs => {
	if (!date) {
		return dayjs();
	}

	if (typeof date === 'object' && date instanceof Date) {
		return dayjs(date).isValid() ? dayjs(date) : dayjs();
	}

	try {
		const parsed = dayjs(date.toString());
		return parsed.isValid() ? parsed : dayjs();
	} catch {
		return dayjs();
	}
};

// Format date for display based on granularity with timezone conversion
export const formatDateByGranularity = (
	date: string | Date,
	granularity: Granularity = 'daily'
): string => {
	const userTimezone = getUserTimezone();
	const dateObj = dayjs.utc(date).tz(userTimezone);
	return granularity === 'hourly'
		? dateObj.format('MMM D, h:mm A')
		: dateObj.format('MMM D');
};

// Create metric visibility toggles state
export const createMetricToggles = <T extends string>(
	initialMetrics: T[]
): Record<T, boolean> => {
	const initialState = {} as Record<T, boolean>;
	for (const metric of initialMetrics) {
		initialState[metric] = true;
	}
	return initialState;
};

// Format data for distribution charts
export const formatDistributionData = <T extends DataItem>(
	data: T[] | undefined,
	nameField: keyof T,
	valueField: keyof T = 'visitors' as keyof T
): ChartDataPoint[] => {
	if (!data?.length) {
		return [];
	}

	return data.map((item) => ({
		name:
			typeof item[nameField] === 'string'
				? (item[nameField] as string)?.charAt(0).toUpperCase() +
						(item[nameField] as string)?.slice(1) || 'Unknown'
				: String(item[nameField] || 'Unknown'),
		value: Number(item[valueField]) || 0,
	}));
};

// Group browser data by name
export const groupBrowserData = (
	browserVersions: Array<{ browser: string; visitors: number }> | undefined
): ChartDataPoint[] => {
	if (!browserVersions?.length) {
		return [];
	}

	const browserCounts = browserVersions.reduce(
		(acc, item) => {
			const browserName = item.browser;
			if (!acc[browserName]) {
				acc[browserName] = { visitors: 0 };
			}
			acc[browserName].visitors += item.visitors;
			return acc;
		},
		{} as Record<string, { visitors: number }>
	);

	return Object.entries(
		browserCounts as Record<string, { visitors: number }>
	).map(([browser, data]) => ({
		name: browser,
		value: data.visitors,
	}));
};

// Get color variant based on threshold values
export const getColorVariant = (
	value: number,
	dangerThreshold: number,
	warningThreshold: number
): 'danger' | 'warning' | 'success' => {
	if (value > dangerThreshold) {
		return 'danger';
	}
	if (value > warningThreshold) {
		return 'warning';
	}
	return 'success';
};

const PROTOCOL_REGEX = /^https?:\/\//;
const SLASH_REGEX = /\//;

// Format domain links
export const formatDomainLink = (
	path: string,
	domain?: string,
	maxLength = 30
): { href: string; display: string; title: string } => {
	const displayPath =
		path.length > maxLength ? `${path.slice(0, maxLength - 3)}...` : path;

	if (domain) {
		// Remove protocol if present
		const cleanDomain = domain
			.replace(PROTOCOL_REGEX, '')
			.replace(SLASH_REGEX, '');
		// Ensure path starts with a single slash
		let cleanPath = path.startsWith('/') ? path : `/${path}`;
		// Remove duplicate slashes
		cleanPath = cleanPath.replace(/\/+/g, '/');
		const href = `https://${cleanDomain}${cleanPath}`;
		return {
			href,
			display: displayPath,
			title: href,
		};
	}
	return {
		href: `#${path}`,
		display: displayPath,
		title: path,
	};
};

// Format relative time (e.g., "2 hours ago")
export const formatRelativeTime = (date: string | Date): string => {
	const dateObj = safeParseDate(date);
	return dateObj.fromNow();
};

export const calculatePercentChange = (
	current: number,
	previous: number
): number => {
	if (previous === 0) {
		return current > 0 ? 100 : 0;
	}
	return ((current - previous) / previous) * 100;
};

export const formatPercentChange = (change: number): string => {
	const sign = change > 0 ? '+' : '';
	return `${sign}${change.toFixed(1)}%`;
};

export const PERFORMANCE_THRESHOLDS = {
	load_time: { good: 1500, average: 3000, unit: 'ms' },
	ttfb: { good: 500, average: 1000, unit: 'ms' },
	dom_ready: { good: 1000, average: 2000, unit: 'ms' },
	render_time: { good: 1000, average: 2000, unit: 'ms' },
	fcp: { good: 1800, average: 3000, unit: 'ms' },
	lcp: { good: 2500, average: 4000, unit: 'ms' },
	cls: { good: 0.1, average: 0.25, unit: '' },
};

/**
 * Checks if analytics data indicates no tracking is set up (all key metrics are zero)
 */
export function isTrackingNotSetup(analytics: any): boolean {
	if (!analytics?.summary) {
		return true;
	}

	const { summary, events_by_date, top_pages, top_referrers } = analytics;

	// Check core metrics
	const hasData =
		(summary.pageviews || 0) > 0 ||
		(summary.visitors || summary.unique_visitors || 0) > 0 ||
		(summary.sessions || 0) > 0;

	// Check events by date
	const hasEvents = events_by_date?.some(
		(event: any) =>
			(event.pageviews || 0) > 0 ||
			(event.visitors || event.unique_visitors || 0) > 0
	);

	// Check top pages and referrers
	const hasPages = top_pages?.some((page: any) => (page.pageviews || 0) > 0);
	const hasReferrers = top_referrers?.some(
		(ref: any) => (ref.visitors || 0) > 0
	);

	return !(hasData || hasEvents || hasPages || hasReferrers);
}
