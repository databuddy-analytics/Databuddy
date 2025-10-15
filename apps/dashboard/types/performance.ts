export interface PerformanceEntry {
	name: string;
	visitors: number;
	// Load time metrics
	avg_load_time: number;
	p50_load_time?: number;
	// TTFB metrics
	avg_ttfb?: number;
	// Other timing metrics
	avg_dom_ready_time?: number;
	avg_render_time?: number;
	// Core Web Vitals - FCP (First Contentful Paint)
	avg_fcp?: number;
	p50_fcp?: number;
	// Core Web Vitals - LCP (Largest Contentful Paint)
	avg_lcp?: number;
	p50_lcp?: number;
	// Core Web Vitals - CLS (Cumulative Layout Shift)
	avg_cls?: number;
	p50_cls?: number;
	// Core Web Vitals - FID (First Input Delay)
	avg_fid?: number;
	// Core Web Vitals - INP (Interaction to Next Paint)
	avg_inp?: number;
	// Additional fields
	pageviews?: number;
	measurements?: number;
	country_code?: string;
	country_name?: string;
	_uniqueKey?: string;
}

export interface PerformanceSummary {
	avgLoadTime: number;
	fastPages: number;
	slowPages: number;
	totalPages: number;
	performanceScore: number;
	// Core Web Vitals summary
	avgFCP?: number;
	avgLCP?: number;
	avgCLS?: number;
	avgFID?: number;
	avgINP?: number;
}
