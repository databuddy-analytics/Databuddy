export interface PerformanceEntry {
	_uniqueKey?: string;
	avg_cls?: number;
	avg_dom_ready_time?: number;
	avg_fcp?: number;
	avg_fid?: number;
	avg_inp?: number;
	avg_lcp?: number;
	avg_load_time: number;
	avg_render_time?: number;
	avg_ttfb?: number;
	country_code?: string;
	country_name?: string;
	measurements?: number;
	name: string;
	p50_cls?: number;
	p50_fcp?: number;
	p50_lcp?: number;
	p50_load_time?: number;
	pageviews?: number;
	visitors: number;
}

export interface PerformanceSummary {
	avgCLS?: number;
	avgFCP?: number;
	avgFID?: number;
	avgINP?: number;
	avgLCP?: number;
	avgLoadTime: number;
	fastPages: number;
	performanceScore: number;
	slowPages: number;
	totalPages: number;
}
