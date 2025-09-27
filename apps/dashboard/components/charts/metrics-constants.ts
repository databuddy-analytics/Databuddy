import {
	Activity,
	Bug,
	Clock,
	Eye,
	Gauge,
	MousePointer,
	TrendingUp,
	Users,
	Zap,
} from 'lucide-react';
import { formatDuration } from '@/lib/utils';

const createColorSet = (
	primary: string,
	secondary: string,
	light: string,
	gradient: string
) => ({
	primary,
	secondary,
	light,
	gradient,
});

export const METRIC_COLORS = {
	pageviews: createColorSet(
		'#3b82f6',
		'#1d4ed8',
		'#dbeafe',
		'from-blue-500/20 to-blue-600/5'
	),
	visitors: createColorSet(
		'#10b981',
		'#059669',
		'#d1fae5',
		'from-emerald-500/20 to-emerald-600/5'
	),
	sessions: createColorSet(
		'#8b5cf6',
		'#7c3aed',
		'#ede9fe',
		'from-violet-500/20 to-violet-600/5'
	),
	bounce_rate: createColorSet(
		'#f59e0b',
		'#d97706',
		'#fef3c7',
		'from-amber-500/20 to-amber-600/5'
	),
	session_duration: createColorSet(
		'#ef4444',
		'#dc2626',
		'#fee2e2',
		'from-red-500/20 to-red-600/5'
	),
	// Core Web Vitals
	avg_fcp: createColorSet(
		'#06b6d4',
		'#0891b2',
		'#cffafe',
		'from-cyan-500/20 to-cyan-600/5'
	),
	p50_fcp: createColorSet(
		'#0ea5e9',
		'#0284c7',
		'#e0f2fe',
		'from-sky-500/20 to-sky-600/5'
	),
	avg_lcp: createColorSet(
		'#10b981',
		'#059669',
		'#d1fae5',
		'from-emerald-500/20 to-emerald-600/5'
	),
	p50_lcp: createColorSet(
		'#22c55e',
		'#16a34a',
		'#dcfce7',
		'from-green-500/20 to-green-600/5'
	),
	avg_cls: createColorSet(
		'#f59e0b',
		'#d97706',
		'#fef3c7',
		'from-amber-500/20 to-amber-600/5'
	),
	p50_cls: createColorSet(
		'#eab308',
		'#ca8a04',
		'#fefce8',
		'from-yellow-500/20 to-yellow-600/5'
	),
	avg_fid: createColorSet(
		'#8b5cf6',
		'#7c3aed',
		'#ede9fe',
		'from-violet-500/20 to-violet-600/5'
	),
	p50_fid: createColorSet(
		'#a855f7',
		'#9333ea',
		'#f3e8ff',
		'from-purple-500/20 to-purple-600/5'
	),
	avg_inp: createColorSet(
		'#ec4899',
		'#db2777',
		'#fce7f3',
		'from-pink-500/20 to-pink-600/5'
	),
	p50_inp: createColorSet(
		'#f43f5e',
		'#e11d48',
		'#ffe4e6',
		'from-rose-500/20 to-rose-600/5'
	),
	// Load time metrics
	avg_load_time: createColorSet(
		'#3b82f6',
		'#1d4ed8',
		'#dbeafe',
		'from-blue-500/20 to-blue-600/5'
	),
	p50_load_time: createColorSet(
		'#06b6d4',
		'#0891b2',
		'#cffafe',
		'from-cyan-500/20 to-cyan-600/5'
	),
} as const;

export interface ChartDataRow {
	date: string;
	pageviews?: number;
	visitors?: number;
	unique_visitors?: number;
	sessions?: number;
	bounce_rate?: number;
	avg_session_duration?: number;
	avg_session_duration_formatted?: string;
	// Load time metrics
	avg_load_time?: number;
	p50_load_time?: number;
	// TTFB metrics
	avg_ttfb?: number;
	// Core Web Vitals
	avg_fcp?: number;
	p50_fcp?: number;
	avg_lcp?: number;
	p50_lcp?: number;
	avg_cls?: number;
	p50_cls?: number;
	avg_fid?: number;
	p50_fid?: number;
	avg_inp?: number;
	p50_inp?: number;
	measurements?: number;
	[key: string]: unknown;
}

export interface MetricConfig {
	key: string;
	label: string;
	color: string;
	gradient: string;
	yAxisId: string;
	icon: React.ComponentType<{ className?: string }>;
	formatValue?: (value: number, row: ChartDataRow) => string;
	category?: 'analytics' | 'performance' | 'core_web_vitals';
}

// Utility functions
export const formatPerformanceTime = (value: number): string => {
	if (!value || value === 0) {
		return 'N/A';
	}
	if (value < 1000) {
		return `${Math.round(value)}ms`;
	}
	const seconds = Math.round(value / 100) / 10;
	return seconds % 1 === 0
		? `${seconds.toFixed(0)}s`
		: `${seconds.toFixed(1)}s`;
};

export const formatCLS = (value: number): string => {
	if (value == null || Number.isNaN(value)) {
		return 'N/A';
	}
	return value.toFixed(3);
};

const createMetric = (
	key: string,
	label: string,
	colorKey: keyof typeof METRIC_COLORS,
	icon: React.ComponentType<{ className?: string }>,
	formatValue?: (value: number, row: ChartDataRow) => string,
	category: 'analytics' | 'performance' | 'core_web_vitals' = 'analytics'
): MetricConfig => ({
	key,
	label,
	color: METRIC_COLORS[colorKey].primary,
	gradient: colorKey,
	yAxisId: 'left',
	icon,
	formatValue,
	category,
});

export const ANALYTICS_METRICS: MetricConfig[] = [
	createMetric('pageviews', 'Pageviews', 'pageviews', Eye, (value) =>
		value.toLocaleString()
	),
	createMetric('visitors', 'Visitors', 'visitors', Users, (value) =>
		value.toLocaleString()
	),
	createMetric('sessions', 'Sessions', 'sessions', TrendingUp, (value) =>
		value.toLocaleString()
	),
	createMetric(
		'bounce_rate',
		'Bounce Rate',
		'bounce_rate',
		MousePointer,
		(value) => `${value.toFixed(1)}%`
	),
	createMetric(
		'avg_session_duration',
		'Session Duration',
		'session_duration',
		TrendingUp,
		(value, row) =>
			typeof row.avg_session_duration_formatted === 'string'
				? row.avg_session_duration_formatted
				: formatDuration(value)
	),
];

export const PERFORMANCE_METRICS: MetricConfig[] = [
	// Load time metrics
	createMetric(
		'avg_load_time',
		'Avg Load Time',
		'avg_load_time',
		Clock,
		formatPerformanceTime,
		'performance'
	),
	createMetric(
		'p50_load_time',
		'P50 Load Time',
		'p50_load_time',
		Clock,
		formatPerformanceTime,
		'performance'
	),
];

export const CORE_WEB_VITALS_METRICS: MetricConfig[] = [
	// FCP metrics
	createMetric(
		'avg_fcp',
		'FCP (Avg)',
		'avg_fcp',
		Zap,
		formatPerformanceTime,
		'core_web_vitals'
	),
	createMetric(
		'p50_fcp',
		'FCP (P50)',
		'p50_fcp',
		Zap,
		formatPerformanceTime,
		'core_web_vitals'
	),
	// LCP metrics
	createMetric(
		'avg_lcp',
		'LCP (Avg)',
		'avg_lcp',
		Activity,
		formatPerformanceTime,
		'core_web_vitals'
	),
	createMetric(
		'p50_lcp',
		'LCP (P50)',
		'p50_lcp',
		Activity,
		formatPerformanceTime,
		'core_web_vitals'
	),
	// CLS metrics
	createMetric(
		'avg_cls',
		'CLS (Avg)',
		'avg_cls',
		Gauge,
		formatCLS,
		'core_web_vitals'
	),
	createMetric(
		'p50_cls',
		'CLS (P50)',
		'p50_cls',
		Gauge,
		formatCLS,
		'core_web_vitals'
	),
	// FID metrics
	createMetric(
		'avg_fid',
		'FID (Avg)',
		'avg_fid',
		MousePointer,
		formatPerformanceTime,
		'core_web_vitals'
	),
	createMetric(
		'p50_fid',
		'FID (P50)',
		'p50_fid',
		MousePointer,
		formatPerformanceTime,
		'core_web_vitals'
	),
	// INP metrics
	createMetric(
		'avg_inp',
		'INP (Avg)',
		'avg_inp',
		Activity,
		formatPerformanceTime,
		'core_web_vitals'
	),
	createMetric(
		'p50_inp',
		'INP (P50)',
		'p50_inp',
		Activity,
		formatPerformanceTime,
		'core_web_vitals'
	),
];

// Error metrics
export const ERROR_METRICS: MetricConfig[] = [
	createMetric('total_errors', 'Total Errors', 'bounce_rate', Bug, (value) =>
		value.toLocaleString()
	),
	createMetric(
		'affected_users',
		'Affected Users',
		'session_duration',
		Users,
		(value) => value.toLocaleString()
	),
];

export const METRICS = [
	...ANALYTICS_METRICS,
	...PERFORMANCE_METRICS,
	...CORE_WEB_VITALS_METRICS,
	...ERROR_METRICS,
];
