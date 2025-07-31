import { Eye, MousePointer, TrendingUp, Users } from 'lucide-react';

export const METRIC_COLORS = {
	pageviews: {
		primary: '#3b82f6',
		secondary: '#1d4ed8',
		light: '#dbeafe',
		gradient: 'from-blue-500/20 to-blue-600/5',
	},
	visitors: {
		primary: '#10b981',
		secondary: '#059669',
		light: '#d1fae5',
		gradient: 'from-emerald-500/20 to-emerald-600/5',
	},
	sessions: {
		primary: '#8b5cf6',
		secondary: '#7c3aed',
		light: '#ede9fe',
		gradient: 'from-violet-500/20 to-violet-600/5',
	},
	bounce_rate: {
		primary: '#f59e0b',
		secondary: '#d97706',
		light: '#fef3c7',
		gradient: 'from-amber-500/20 to-amber-600/5',
	},
	session_duration: {
		primary: '#ef4444',
		secondary: '#dc2626',
		light: '#fee2e2',
		gradient: 'from-red-500/20 to-red-600/5',
	},
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
}

export const METRICS: MetricConfig[] = [
	{
		key: 'pageviews',
		label: 'Pageviews',
		color: METRIC_COLORS.pageviews.primary,
		gradient: 'pageviews',
		yAxisId: 'left',
		icon: Eye,
		formatValue: (value) => value.toLocaleString(),
	},
	{
		key: 'visitors',
		label: 'Visitors',
		color: METRIC_COLORS.visitors.primary,
		gradient: 'visitors',
		yAxisId: 'left',
		icon: Users,
		formatValue: (value) => value.toLocaleString(),
	},
	{
		key: 'sessions',
		label: 'Sessions',
		color: METRIC_COLORS.sessions.primary,
		gradient: 'sessions',
		yAxisId: 'left',
		icon: TrendingUp,
		formatValue: (value) => value.toLocaleString(),
	},
	{
		key: 'bounce_rate',
		label: 'Bounce Rate',
		color: METRIC_COLORS.bounce_rate.primary,
		gradient: 'bounce_rate',
		yAxisId: 'left',
		icon: MousePointer,
		formatValue: (value) => `${value.toFixed(1)}%`,
	},
	{
		key: 'avg_session_duration',
		label: 'Session Duration',
		color: METRIC_COLORS.session_duration.primary,
		gradient: 'session_duration',
		yAxisId: 'left',
		icon: TrendingUp,
		formatValue: (value, row) =>
			typeof row.avg_session_duration_formatted === 'string'
				? row.avg_session_duration_formatted
				: formatDuration(value),
	},
];

import { formatDuration } from '@/lib/utils';
