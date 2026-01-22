import type { ColumnDef } from"@tanstack/react-table";
import { formatDateTime } from"@/lib/formatters";
import {
	formatDurationMs,
	formatPercent,
	formatTokenCount,
	formatUsd,
} from"../_lib/llm-analytics-utils";

export interface LlmProviderBreakdownRow {
	name: string;
	provider: string;
	calls: number;
	total_cost: number;
	total_tokens: number;
	avg_duration_ms: number;
	p75_duration_ms: number;
	error_rate: number;
}

export interface LlmModelBreakdownRow {
	name: string;
	model: string;
	provider: string;
	calls: number;
	total_cost: number;
	total_tokens: number;
	avg_duration_ms: number;
	p75_duration_ms: number;
	error_rate: number;
}

export interface LlmFinishReasonRow {
	name: string;
	finish_reason: string;
	calls: number;
}

export interface LlmErrorBreakdownRow {
	name: string;
	error_name: string;
	sample_message: string;
	error_count: number;
}

export interface LlmLatencyBreakdownRow {
	name: string;
	model?: string;
	provider?: string;
	calls: number;
	avg_duration_ms: number;
	p50_duration_ms: number;
	p75_duration_ms: number;
	p95_duration_ms: number;
}

export interface LlmSlowCallRow {
	name: string;
	timestamp: string;
	provider: string;
	model: string;
	total_tokens: number;
	duration_ms: number;
	finish_reason?: string;
	error_name?: string;
	trace_id?: string;
}

export interface LlmHttpStatusRow {
	name: string;
	http_status: number;
	calls: number;
}

export interface LlmRecentErrorRow {
	name: string;
	timestamp: string;
	error_name: string;
	error_message: string;
	model: string;
	provider: string;
	http_status?: number;
	duration_ms: number;
}

export interface LlmToolNameRow {
	name: string;
	tool_name: string;
	calls: number;
}

export interface LlmTraceSummaryRow {
	name: string;
	trace_id: string;
	user_id: string;
	website_id?: string;
	calls: number;
	total_tokens: number;
	total_cost: number;
	errors: number;
	avg_duration_ms: number;
	p75_duration_ms: number;
}

export interface LlmRecentCallRow {
	name: string;
	timestamp: string;
	trace_id?: string;
	user_id?: string;
	provider: string;
	model: string;
	total_tokens: number;
	total_token_cost_usd: number;
	duration_ms: number;
	finish_reason?: string;
	error_name?: string;
}

export const createProviderColumns =
	(): ColumnDef<LlmProviderBreakdownRow>[] => [
		{
			accessorKey:"provider",
			header:"Provider",
			cell: ({ row }) => row.original.provider || row.original.name,
		},
		{
			accessorKey:"calls",
			header:"Calls",
			cell: ({ row }) => formatTokenCount(row.original.calls),
		},
		{
			accessorKey:"total_cost",
			header:"Cost",
			cell: ({ row }) => formatUsd(row.original.total_cost),
		},
		{
			accessorKey:"total_tokens",
			header:"Tokens",
			cell: ({ row }) => formatTokenCount(row.original.total_tokens),
		},
		{
			accessorKey:"avg_duration_ms",
			header:"Avg Latency",
			cell: ({ row }) => formatDurationMs(row.original.avg_duration_ms),
		},
		{
			accessorKey:"p75_duration_ms",
			header:"p75 Latency",
			cell: ({ row }) => formatDurationMs(row.original.p75_duration_ms),
		},
		{
			accessorKey:"error_rate",
			header:"Error Rate",
			cell: ({ row }) => formatPercent(row.original.error_rate),
		},
	];

export const createModelColumns = (): ColumnDef<LlmModelBreakdownRow>[] => [
	{
		accessorKey:"model",
		header:"Model",
		cell: ({ row }) => row.original.model || row.original.name,
	},
	{
		accessorKey:"provider",
		header:"Provider",
		cell: ({ row }) => row.original.provider,
	},
	{
		accessorKey:"calls",
		header:"Calls",
		cell: ({ row }) => formatTokenCount(row.original.calls),
	},
	{
		accessorKey:"total_cost",
		header:"Cost",
		cell: ({ row }) => formatUsd(row.original.total_cost),
	},
	{
		accessorKey:"total_tokens",
		header:"Tokens",
		cell: ({ row }) => formatTokenCount(row.original.total_tokens),
	},
	{
		accessorKey:"avg_duration_ms",
		header:"Avg Latency",
		cell: ({ row }) => formatDurationMs(row.original.avg_duration_ms),
	},
	{
		accessorKey:"p75_duration_ms",
		header:"p75 Latency",
		cell: ({ row }) => formatDurationMs(row.original.p75_duration_ms),
	},
	{
		accessorKey:"error_rate",
		header:"Error Rate",
		cell: ({ row }) => formatPercent(row.original.error_rate),
	},
];

export const createFinishReasonColumns =
	(): ColumnDef<LlmFinishReasonRow>[] => [
		{
			accessorKey:"finish_reason",
			header:"Finish Reason",
			cell: ({ row }) => row.original.finish_reason || row.original.name,
		},
		{
			accessorKey:"calls",
			header:"Calls",
			cell: ({ row }) => formatTokenCount(row.original.calls),
		},
	];

export const createErrorColumns = (): ColumnDef<LlmErrorBreakdownRow>[] => [
	{
		accessorKey:"error_name",
		header:"Error",
		cell: ({ row }) => row.original.error_name || row.original.name,
	},
	{
		accessorKey:"error_count",
		header:"Count",
		cell: ({ row }) => formatTokenCount(row.original.error_count),
	},
	{
		accessorKey:"sample_message",
		header:"Sample",
		cell: ({ row }) => row.original.sample_message,
	},
];

export const createLatencyColumns = (): ColumnDef<LlmLatencyBreakdownRow>[] => [
	{
		accessorKey:"name",
		header:"Name",
		cell: ({ row }) => row.original.name,
	},
	{
		accessorKey:"calls",
		header:"Calls",
		cell: ({ row }) => formatTokenCount(row.original.calls),
	},
	{
		accessorKey:"avg_duration_ms",
		header:"Avg",
		cell: ({ row }) => formatDurationMs(row.original.avg_duration_ms),
	},
	{
		accessorKey:"p50_duration_ms",
		header:"p50",
		cell: ({ row }) => formatDurationMs(row.original.p50_duration_ms),
	},
	{
		accessorKey:"p75_duration_ms",
		header:"p75",
		cell: ({ row }) => formatDurationMs(row.original.p75_duration_ms),
	},
	{
		accessorKey:"p95_duration_ms",
		header:"p95",
		cell: ({ row }) => formatDurationMs(row.original.p95_duration_ms),
	},
];

export const createSlowCallColumns = (): ColumnDef<LlmSlowCallRow>[] => [
	{
		accessorKey:"timestamp",
		header:"Time",
		cell: ({ row }) => formatDateTime(row.original.timestamp),
	},
	{
		accessorKey:"provider",
		header:"Provider",
		cell: ({ row }) => row.original.provider,
	},
	{
		accessorKey:"model",
		header:"Model",
		cell: ({ row }) => row.original.model,
	},
	{
		accessorKey:"duration_ms",
		header:"Latency",
		cell: ({ row }) => formatDurationMs(row.original.duration_ms),
	},
	{
		accessorKey:"total_tokens",
		header:"Tokens",
		cell: ({ row }) => formatTokenCount(row.original.total_tokens),
	},
	{
		accessorKey:"finish_reason",
		header:"Finish",
		cell: ({ row }) => row.original.finish_reason ??"—",
	},
	{
		accessorKey:"error_name",
		header:"Error",
		cell: ({ row }) => row.original.error_name ??"—",
	},
];

export const createHttpStatusColumns = (): ColumnDef<LlmHttpStatusRow>[] => [
	{
		accessorKey:"http_status",
		header:"Status",
		cell: ({ row }) => row.original.http_status || row.original.name,
	},
	{
		accessorKey:"calls",
		header:"Calls",
		cell: ({ row }) => formatTokenCount(row.original.calls),
	},
];

export const createRecentErrorColumns = (): ColumnDef<LlmRecentErrorRow>[] => [
	{
		accessorKey:"timestamp",
		header:"Time",
		cell: ({ row }) => formatDateTime(row.original.timestamp),
	},
	{
		accessorKey:"error_name",
		header:"Error",
		cell: ({ row }) => row.original.error_name,
	},
	{
		accessorKey:"model",
		header:"Model",
		cell: ({ row }) => row.original.model,
	},
	{
		accessorKey:"provider",
		header:"Provider",
		cell: ({ row }) => row.original.provider,
	},
	{
		accessorKey:"http_status",
		header:"Status",
		cell: ({ row }) => row.original.http_status ??"—",
	},
	{
		accessorKey:"duration_ms",
		header:"Latency",
		cell: ({ row }) => formatDurationMs(row.original.duration_ms),
	},
];

export const createToolNameColumns = (): ColumnDef<LlmToolNameRow>[] => [
	{
		accessorKey:"tool_name",
		header:"Tool",
		cell: ({ row }) => row.original.tool_name || row.original.name,
	},
	{
		accessorKey:"calls",
		header:"Calls",
		cell: ({ row }) => formatTokenCount(row.original.calls),
	},
];

export const createTraceColumns = (): ColumnDef<LlmTraceSummaryRow>[] => [
	{
		accessorKey:"trace_id",
		header:"Trace",
		cell: ({ row }) => row.original.trace_id || row.original.name,
	},
	{
		accessorKey:"user_id",
		header:"User",
		cell: ({ row }) => row.original.user_id,
	},
	{
		accessorKey:"calls",
		header:"Calls",
		cell: ({ row }) => formatTokenCount(row.original.calls),
	},
	{
		accessorKey:"total_tokens",
		header:"Tokens",
		cell: ({ row }) => formatTokenCount(row.original.total_tokens),
	},
	{
		accessorKey:"total_cost",
		header:"Cost",
		cell: ({ row }) => formatUsd(row.original.total_cost),
	},
	{
		accessorKey:"errors",
		header:"Errors",
		cell: ({ row }) => formatTokenCount(row.original.errors),
	},
	{
		accessorKey:"avg_duration_ms",
		header:"Avg Latency",
		cell: ({ row }) => formatDurationMs(row.original.avg_duration_ms),
	},
	{
		accessorKey:"p75_duration_ms",
		header:"p75 Latency",
		cell: ({ row }) => formatDurationMs(row.original.p75_duration_ms),
	},
];

export const createRecentCallColumns = (): ColumnDef<LlmRecentCallRow>[] => [
	{
		accessorKey:"timestamp",
		header:"Time",
		cell: ({ row }) => formatDateTime(row.original.timestamp),
	},
	{
		accessorKey:"trace_id",
		header:"Trace",
		cell: ({ row }) => row.original.trace_id ??"—",
	},
	{
		accessorKey:"provider",
		header:"Provider",
		cell: ({ row }) => row.original.provider,
	},
	{
		accessorKey:"model",
		header:"Model",
		cell: ({ row }) => row.original.model,
	},
	{
		accessorKey:"total_tokens",
		header:"Tokens",
		cell: ({ row }) => formatTokenCount(row.original.total_tokens),
	},
	{
		accessorKey:"total_token_cost_usd",
		header:"Cost",
		cell: ({ row }) => formatUsd(row.original.total_token_cost_usd),
	},
	{
		accessorKey:"duration_ms",
		header:"Latency",
		cell: ({ row }) => formatDurationMs(row.original.duration_ms),
	},
	{
		accessorKey:"finish_reason",
		header:"Finish",
		cell: ({ row }) => row.original.finish_reason ??"—",
	},
	{
		accessorKey:"error_name",
		header:"Error",
		cell: ({ row }) => row.original.error_name ??"—",
	},
];
