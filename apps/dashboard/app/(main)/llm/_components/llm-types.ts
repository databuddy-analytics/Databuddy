export interface LLMKpiData {
	avg_duration_ms: number;
	cache_hit_rate: number;
	error_count: number;
	error_rate: number;
	p75_duration_ms: number;
	tool_use_rate: number;
	total_calls: number;
	total_cost: number;
	total_input_tokens: number;
	total_output_tokens: number;
	total_tokens: number;
	web_search_rate: number;
}

export interface LLMTimeSeriesData {
	avg_duration_ms: number;
	date: string;
	p75_duration_ms: number;
	total_calls: number;
	total_cost: number;
	total_tokens: number;
}

export interface LLMModelData {
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

export interface LLMToolData {
	calls: number;
	name: string;
	tool_name: string;
}

export interface LLMErrorSeriesData {
	date: string;
	error_count: number;
	error_rate: number;
}

export interface LLMErrorBreakdownData {
	error_count: number;
	error_name: string;
	name: string;
	sample_message: string;
}

export interface LLMHttpStatusData {
	calls: number;
	http_status: number;
	name: string;
}

export interface LLMRecentErrorData {
	duration_ms: number;
	error_message: string;
	error_name: string;
	error_stack?: string;
	http_status?: number;
	model: string;
	name: string;
	provider: string;
	timestamp: string;
}

export function formatCurrency(value: number | null | undefined): string {
	if (value === null || value === undefined) {
		return "$0.00";
	}
	if (value < 0.01 && value > 0) {
		return `$${value.toFixed(4)}`;
	}
	return `$${value.toFixed(2)}`;
}

export function formatNumber(value: number | null | undefined): string {
	if (value === null || value === undefined) {
		return "0";
	}
	return Intl.NumberFormat(undefined, {
		notation: "compact",
		maximumFractionDigits: 1,
	}).format(value);
}

export function formatDuration(ms: number | null | undefined): string {
	if (ms === null || ms === undefined || ms === 0) {
		return "0ms";
	}
	if (ms < 1000) {
		return `${Math.round(ms)}ms`;
	}
	return `${(ms / 1000).toFixed(1)}s`;
}

export function formatPercentage(value: number | null | undefined): string {
	if (value === null || value === undefined) {
		return "0%";
	}
	return `${(value * 100).toFixed(1)}%`;
}
