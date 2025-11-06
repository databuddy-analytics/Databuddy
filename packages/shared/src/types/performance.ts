export interface PgStatStatement {
	userid: number;
	dbid: number;
	toplevel: boolean;
	queryid: number;
	query: string;
	plans: number;
	total_plan_time: number;
	min_plan_time: number;
	max_plan_time: number;
	mean_plan_time: number;
	stddev_plan_time: number;
	calls: number;
	total_exec_time: number;
	min_exec_time: number;
	max_exec_time: number;
	mean_exec_time: number;
	stddev_exec_time: number;
	rows: number;
	shared_blks_hit: number;
	shared_blks_read: number;
	shared_blks_dirtied: number;
	shared_blks_written: number;
	local_blks_hit: number;
	local_blks_read: number;
	local_blks_dirtied: number;
	local_blks_written: number;
	temp_blks_read: number;
	temp_blks_written: number;
	shared_blk_read_time: number;
	shared_blk_write_time: number;
	local_blk_read_time: number;
	local_blk_write_time: number;
	temp_blk_read_time: number;
	temp_blk_write_time: number;
	wal_records: number;
	wal_fpi: number;
	wal_bytes: string;
	jit_functions: number;
	jit_generation_time: number;
	jit_inlining_count: number;
	jit_inlining_time: number;
	jit_optimization_count: number;
	jit_optimization_time: number;
	jit_emission_count: number;
	jit_emission_time: number;
	jit_deform_count: number;
	jit_deform_time: number;
	stats_since: string;
	minmax_stats_since: string;
}

export interface QueryPerformanceSummary {
	queryid: number;
	query: string;
	calls: number;
	total_exec_time: number;
	mean_exec_time: number;
	min_exec_time: number;
	max_exec_time: number;
	stddev_exec_time: number;
	rows: number;
	shared_blks_hit: number;
	shared_blks_read: number;
	cache_hit_ratio: number;
	percentage_of_total_time: number;
}

export interface PerformanceMetrics {
	total_queries: number;
	total_calls: number;
	total_exec_time: number;
	avg_exec_time: number;
	cache_hit_ratio: number;
	p50_exec_time: number;
	p95_exec_time: number;
	p99_exec_time: number;
	top_queries_by_time: QueryPerformanceSummary[];
	top_queries_by_calls: QueryPerformanceSummary[];
	slowest_queries: QueryPerformanceSummary[];
	query_distribution: QueryDistribution[];
}

export interface PerformanceTimeSeriesPoint {
	timestamp: string;
	total_exec_time: number;
	calls: number;
	cache_hit_ratio: number;
	avg_exec_time: number;
}

export interface QueryDistribution {
	time_bucket: string;
	query_count: number;
	total_time: number;
	avg_time: number;
}

export interface PerformanceFilters {
	limit?: number;
	min_calls?: number;
	min_exec_time?: number;
	order_by?: "total_exec_time" | "calls" | "mean_exec_time" | "rows";
	order_direction?: "asc" | "desc";
}
