import type { ColumnDef } from "@tanstack/react-table";
import { formatDateTime } from "@/lib/formatters";
import {
	formatDurationMs,
	formatPercent,
	formatTokenCount,
	formatUsd,
} from "../_lib/llm-analytics-utils";

export interface LlmProviderBreakdownRow {
	avg_duration_ms: number;
	calls: number;
	error_rate: number;
	name: string;
	p75_duration_ms: number;
	provider: string;
	total_cost: number;
	total_tokens: number;
}

export interface LlmModelBreakdownRow {
	avg_duration_ms: number;
	calls: number;
	error_rate: number;
	model: string;
	name: string;
	p75_duration_ms: number;
	provider: string;
	total_cost: number;
	total_tokens: number;
}

export interface LlmFinishReasonRow {
	calls: number;
	finish_reason: string;
	name: string;
}

export interface LlmErrorBreakdownRow {
	error_count: number;
	error_name: string;
	name: string;
	sample_message: string;
}

export interface LlmLatencyBreakdownRow {
	avg_duration_ms: number;
	calls: number;
	model?: string;
	name: string;
	p50_duration_ms: number;
	p75_duration_ms: number;
	p95_duration_ms: number;
	provider?: string;
}

export interface LlmSlowCallRow {
	duration_ms: number;
	error_name?: string;
	finish_reason?: string;
	model: string;
	name: string;
	provider: string;
	timestamp: string;
	total_tokens: number;
	trace_id?: string;
}

export interface LlmHttpStatusRow {
	calls: number;
	http_status: number;
	name: string;
}

export interface LlmRecentErrorRow {
	duration_ms: number;
	error_message: string;
	error_name: string;
	http_status?: number;
	model: string;
	name: string;
	provider: string;
	timestamp: string;
}

export interface LlmToolNameRow {
	calls: number;
	name: string;
	tool_name: string;
}

export interface LlmTraceSummaryRow {
	avg_duration_ms: number;
	calls: number;
	errors: number;
	name: string;
	p75_duration_ms: number;
	total_cost: number;
	total_tokens: number;
	trace_id: string;
	user_id: string;
	website_id?: string;
}

export interface LlmRecentCallRow {
	duration_ms: number;
	error_name?: string;
	finish_reason?: string;
	model: string;
	name: string;
	provider: string;
	timestamp: string;
	total_token_cost_usd: number;
	total_tokens: number;
	trace_id?: string;
	user_id?: string;
}

export const createProviderColumns =
	(): ColumnDef<LlmProviderBreakdownRow>[] => [
		{
			accessorKey: "provider",
			header: "Provider",
			cell: ({ row }) => row.original.provider || row.original.name,
		},
		{
			accessorKey: "calls",
			header: "Calls",
			cell: ({ row }) => formatTokenCount(row.original.calls),
		},
		{
			accessorKey: "total_cost",
			header: "Cost",
			cell: ({ row }) => formatUsd(row.original.total_cost),
		},
		{
			accessorKey: "total_tokens",
			header: "Tokens",
			cell: ({ row }) => formatTokenCount(row.original.total_tokens),
		},
		{
			accessorKey: "avg_duration_ms",
			header: "Avg Latency",
			cell: ({ row }) => formatDurationMs(row.original.avg_duration_ms),
		},
		{
			accessorKey: "p75_duration_ms",
			header: "p75 Latency",
			cell: ({ row }) => formatDurationMs(row.original.p75_duration_ms),
		},
		{
			accessorKey: "error_rate",
			header: "Error Rate",
			cell: ({ row }) => formatPercent(row.original.error_rate),
		},
	];

export const createModelColumns = (): ColumnDef<LlmModelBreakdownRow>[] => [
	{
		accessorKey: "model",
		header: "Model",
		cell: ({ row }) => row.original.model || row.original.name,
	},
	{
		accessorKey: "provider",
		header: "Provider",
		cell: ({ row }) => row.original.provider,
	},
	{
		accessorKey: "calls",
		header: "Calls",
		cell: ({ row }) => formatTokenCount(row.original.calls),
	},
	{
		accessorKey: "total_cost",
		header: "Cost",
		cell: ({ row }) => formatUsd(row.original.total_cost),
	},
	{
		accessorKey: "total_tokens",
		header: "Tokens",
		cell: ({ row }) => formatTokenCount(row.original.total_tokens),
	},
	{
		accessorKey: "avg_duration_ms",
		header: "Avg Latency",
		cell: ({ row }) => formatDurationMs(row.original.avg_duration_ms),
	},
	{
		accessorKey: "p75_duration_ms",
		header: "p75 Latency",
		cell: ({ row }) => formatDurationMs(row.original.p75_duration_ms),
	},
	{
		accessorKey: "error_rate",
		header: "Error Rate",
		cell: ({ row }) => formatPercent(row.original.error_rate),
	},
];

export const createFinishReasonColumns =
	(): ColumnDef<LlmFinishReasonRow>[] => [
		{
			accessorKey: "finish_reason",
			header: "Finish Reason",
			cell: ({ row }) => row.original.finish_reason || row.original.name,
		},
		{
			accessorKey: "calls",
			header: "Calls",
			cell: ({ row }) => formatTokenCount(row.original.calls),
		},
	];

export const createErrorColumns = (): ColumnDef<LlmErrorBreakdownRow>[] => [
	{
		accessorKey: "error_name",
		header: "Error",
		cell: ({ row }) => row.original.error_name || row.original.name,
	},
	{
		accessorKey: "error_count",
		header: "Count",
		cell: ({ row }) => formatTokenCount(row.original.error_count),
	},
	{
		accessorKey: "sample_message",
		header: "Sample",
		cell: ({ row }) => row.original.sample_message,
	},
];

export const createLatencyColumns = (): ColumnDef<LlmLatencyBreakdownRow>[] => [
	{
		accessorKey: "name",
		header: "Name",
		cell: ({ row }) => row.original.name,
	},
	{
		accessorKey: "calls",
		header: "Calls",
		cell: ({ row }) => formatTokenCount(row.original.calls),
	},
	{
		accessorKey: "avg_duration_ms",
		header: "Avg",
		cell: ({ row }) => formatDurationMs(row.original.avg_duration_ms),
	},
	{
		accessorKey: "p50_duration_ms",
		header: "p50",
		cell: ({ row }) => formatDurationMs(row.original.p50_duration_ms),
	},
	{
		accessorKey: "p75_duration_ms",
		header: "p75",
		cell: ({ row }) => formatDurationMs(row.original.p75_duration_ms),
	},
	{
		accessorKey: "p95_duration_ms",
		header: "p95",
		cell: ({ row }) => formatDurationMs(row.original.p95_duration_ms),
	},
];

export const createSlowCallColumns = (): ColumnDef<LlmSlowCallRow>[] => [
	{
		accessorKey: "timestamp",
		header: "Time",
		cell: ({ row }) => formatDateTime(row.original.timestamp),
	},
	{
		accessorKey: "provider",
		header: "Provider",
		cell: ({ row }) => row.original.provider,
	},
	{
		accessorKey: "model",
		header: "Model",
		cell: ({ row }) => row.original.model,
	},
	{
		accessorKey: "duration_ms",
		header: "Latency",
		cell: ({ row }) => formatDurationMs(row.original.duration_ms),
	},
	{
		accessorKey: "total_tokens",
		header: "Tokens",
		cell: ({ row }) => formatTokenCount(row.original.total_tokens),
	},
	{
		accessorKey: "finish_reason",
		header: "Finish",
		cell: ({ row }) => row.original.finish_reason ?? "—",
	},
	{
		accessorKey: "error_name",
		header: "Error",
		cell: ({ row }) => row.original.error_name ?? "—",
	},
];

export const createHttpStatusColumns = (): ColumnDef<LlmHttpStatusRow>[] => [
	{
		accessorKey: "http_status",
		header: "Status",
		cell: ({ row }) => row.original.http_status || row.original.name,
	},
	{
		accessorKey: "calls",
		header: "Calls",
		cell: ({ row }) => formatTokenCount(row.original.calls),
	},
];

export const createRecentErrorColumns = (): ColumnDef<LlmRecentErrorRow>[] => [
	{
		accessorKey: "timestamp",
		header: "Time",
		cell: ({ row }) => formatDateTime(row.original.timestamp),
	},
	{
		accessorKey: "error_name",
		header: "Error",
		cell: ({ row }) => row.original.error_name,
	},
	{
		accessorKey: "model",
		header: "Model",
		cell: ({ row }) => row.original.model,
	},
	{
		accessorKey: "provider",
		header: "Provider",
		cell: ({ row }) => row.original.provider,
	},
	{
		accessorKey: "http_status",
		header: "Status",
		cell: ({ row }) => row.original.http_status ?? "—",
	},
	{
		accessorKey: "duration_ms",
		header: "Latency",
		cell: ({ row }) => formatDurationMs(row.original.duration_ms),
	},
];

export const createToolNameColumns = (): ColumnDef<LlmToolNameRow>[] => [
	{
		accessorKey: "tool_name",
		header: "Tool",
		cell: ({ row }) => row.original.tool_name || row.original.name,
	},
	{
		accessorKey: "calls",
		header: "Calls",
		cell: ({ row }) => formatTokenCount(row.original.calls),
	},
];

export const createTraceColumns = (): ColumnDef<LlmTraceSummaryRow>[] => [
	{
		accessorKey: "trace_id",
		header: "Trace",
		cell: ({ row }) => row.original.trace_id || row.original.name,
	},
	{
		accessorKey: "user_id",
		header: "User",
		cell: ({ row }) => row.original.user_id,
	},
	{
		accessorKey: "calls",
		header: "Calls",
		cell: ({ row }) => formatTokenCount(row.original.calls),
	},
	{
		accessorKey: "total_tokens",
		header: "Tokens",
		cell: ({ row }) => formatTokenCount(row.original.total_tokens),
	},
	{
		accessorKey: "total_cost",
		header: "Cost",
		cell: ({ row }) => formatUsd(row.original.total_cost),
	},
	{
		accessorKey: "errors",
		header: "Errors",
		cell: ({ row }) => formatTokenCount(row.original.errors),
	},
	{
		accessorKey: "avg_duration_ms",
		header: "Avg Latency",
		cell: ({ row }) => formatDurationMs(row.original.avg_duration_ms),
	},
	{
		accessorKey: "p75_duration_ms",
		header: "p75 Latency",
		cell: ({ row }) => formatDurationMs(row.original.p75_duration_ms),
	},
];

export const createRecentCallColumns = (): ColumnDef<LlmRecentCallRow>[] => [
	{
		accessorKey: "timestamp",
		header: "Time",
		cell: ({ row }) => formatDateTime(row.original.timestamp),
	},
	{
		accessorKey: "trace_id",
		header: "Trace",
		cell: ({ row }) => row.original.trace_id ?? "—",
	},
	{
		accessorKey: "provider",
		header: "Provider",
		cell: ({ row }) => row.original.provider,
	},
	{
		accessorKey: "model",
		header: "Model",
		cell: ({ row }) => row.original.model,
	},
	{
		accessorKey: "total_tokens",
		header: "Tokens",
		cell: ({ row }) => formatTokenCount(row.original.total_tokens),
	},
	{
		accessorKey: "total_token_cost_usd",
		header: "Cost",
		cell: ({ row }) => formatUsd(row.original.total_token_cost_usd),
	},
	{
		accessorKey: "duration_ms",
		header: "Latency",
		cell: ({ row }) => formatDurationMs(row.original.duration_ms),
	},
	{
		accessorKey: "finish_reason",
		header: "Finish",
		cell: ({ row }) => row.original.finish_reason ?? "—",
	},
	{
		accessorKey: "error_name",
		header: "Error",
		cell: ({ row }) => row.original.error_name ?? "—",
	},
];
