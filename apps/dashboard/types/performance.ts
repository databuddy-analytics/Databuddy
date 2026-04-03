export interface PerformanceEntry {
	_uniqueKey?: string;
	// Core Web Vitals - CLS (Cumulative Layout Shift)
	avg_cls?: number;
	// Other timing metrics
	avg_dom_ready_time?: number;
	// Core Web Vitals - FCP (First Contentful Paint)
	avg_fcp?: number;
	// Core Web Vitals - FID (First Input Delay)
	avg_fid?: number;
	// Core Web Vitals - INP (Interaction to Next Paint)
	avg_inp?: number;
	// Core Web Vitals - LCP (Largest Contentful Paint)
	avg_lcp?: number;
	// Load time metrics
	avg_load_time: number;
	avg_render_time?: number;
	// TTFB metrics
	avg_ttfb?: number;
	country_code?: string;
	country_name?: string;
	measurements?: number;
	name: string;
	p50_cls?: number;
	p50_fcp?: number;
	p50_lcp?: number;
	p50_load_time?: number;
	// Additional fields
	pageviews?: number;
	visitors: number;
}

export interface PerformanceSummary {
	avgCLS?: number;
	// Core Web Vitals summary
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
