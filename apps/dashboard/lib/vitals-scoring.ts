/**
 * Real Experience Score (RES) calculation utilities
 * Based on Vercel Speed Insights methodology using Lighthouse 10 scoring
 *
 * Weights (mobile):
 * - FCP: 15%
 * - LCP: 30%
 * - INP: 30%
 * - CLS: 25%
 */

export const RES_WEIGHTS = {
	FCP: 0.15,
	LCP: 0.3,
	INP: 0.3,
	CLS: 0.25,
} as const;

export type RESMetric = keyof typeof RES_WEIGHTS;

/**
 * Metric thresholds for scoring
 * Based on Google's Core Web Vitals thresholds
 */
const METRIC_THRESHOLDS = {
	FCP: { good: 1800, poor: 3000 },
	LCP: { good: 2500, poor: 4000 },
	INP: { good: 200, poor: 500 },
	CLS: { good: 0.1, poor: 0.25 },
} as const;

/**
 * Score curve control points for log-normal distribution approximation
 * Maps threshold values to target scores
 */
const SCORE_CURVES = {
	FCP: { median: 1600, p10: 3000 },
	LCP: { median: 2500, p10: 4000 },
	INP: { median: 200, p10: 500 },
	CLS: { median: 0.1, p10: 0.25 },
} as const;

/**
 * Calculate a 0-100 score for a single metric using log-normal distribution
 * Similar to Lighthouse scoring methodology
 *
 * @param value - Raw metric value
 * @param metric - Metric name (FCP, LCP, INP, CLS)
 * @returns Score from 0-100
 */
export function calculateMetricScore(
	value: number | null | undefined,
	metric: RESMetric
): number | null {
	if (value === null || value === undefined || Number.isNaN(value)) {
		return null;
	}

	const curve = SCORE_CURVES[metric];

	// Perfect score for 0 or negative values (shouldn't happen, but handle gracefully)
	if (value <= 0) {
		return 100;
	}

	// Use log-normal CDF approximation
	// This creates a smooth curve that maps:
	// - Values at/below median → ~90-100 (good)
	// - Values between median and p10 → ~50-90 (needs improvement)
	// - Values above p10 → 0-50 (poor)

	const { median, p10 } = curve;

	// Calculate log-normal parameters
	const logMedian = Math.log(median);
	const logP10 = Math.log(p10);

	// Standard deviation derived from the p10 point (p10 should map to ~10th percentile)
	// Using z-score of ~1.28 for 10th percentile
	const sigma = (logP10 - logMedian) / 1.28;

	if (sigma <= 0) {
		// Fallback for edge cases
		return value <= median ? 100 : value >= p10 ? 0 : 50;
	}

	// Calculate z-score for the value
	const logValue = Math.log(value);
	const z = (logValue - logMedian) / sigma;

	// Convert z-score to percentile using error function approximation
	// Then invert to get score (lower values = higher scores)
	const percentile = normalCDF(z);

	// Map percentile to score (0-100)
	// percentile 0 = score 100, percentile 1 = score 0
	const score = Math.round((1 - percentile) * 100);

	// Clamp to 0-100
	return Math.max(0, Math.min(100, score));
}

/**
 * Approximation of the standard normal cumulative distribution function
 * Using the Abramowitz and Stegun approximation
 */
function normalCDF(z: number): number {
	const a1 = 0.254_829_592;
	const a2 = -0.284_496_736;
	const a3 = 1.421_413_741;
	const a4 = -1.453_152_027;
	const a5 = 1.061_405_429;
	const p = 0.327_591_1;

	const sign = z < 0 ? -1 : 1;
	const absZ = Math.abs(z);

	const t = 1 / (1 + p * absZ);
	const y =
		1 -
		((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
			t *
			Math.exp((-absZ * absZ) / 2);

	return 0.5 * (1 + sign * y);
}

export interface MetricScoreData {
	contribution: number | null;
	metric: RESMetric;
	rawValue: number | null;
	score: number | null;
	status: "good" | "needs-improvement" | "poor" | null;
	weight: number;
}

export interface RESResult {
	metrics: MetricScoreData[];
	score: number | null;
	status: "good" | "needs-improvement" | "poor" | null;
	totalSamples: number;
}

/**
 * Get the status based on score
 */
function getScoreStatus(
	score: number | null
): "good" | "needs-improvement" | "poor" | null {
	if (score === null) {
		return null;
	}
	if (score >= 90) {
		return "good";
	}
	if (score >= 50) {
		return "needs-improvement";
	}
	return "poor";
}

/**
 * Get the status for a raw metric value
 */
function getMetricStatus(
	value: number | null | undefined,
	metric: RESMetric
): "good" | "needs-improvement" | "poor" | null {
	if (value === null || value === undefined) {
		return null;
	}

	const threshold = METRIC_THRESHOLDS[metric];

	if (value <= threshold.good) {
		return "good";
	}
	if (value <= threshold.poor) {
		return "needs-improvement";
	}
	return "poor";
}

interface MetricInput {
	metric_name: string;
	p75: number;
	samples?: number;
}

/**
 * Calculate the Real Experience Score from metric data
 *
 * @param metrics - Array of metric data with p75 values
 * @returns RES result with overall score and per-metric breakdown
 */
export function calculateRES(metrics: MetricInput[]): RESResult {
	const resMetrics = Object.keys(RES_WEIGHTS) as RESMetric[];
	const metricScores: MetricScoreData[] = [];
	let totalWeight = 0;
	let weightedSum = 0;
	let totalSamples = 0;

	for (const resMetric of resMetrics) {
		const metricData = metrics.find(
			(m) => m.metric_name.toUpperCase() === resMetric
		);
		const rawValue = metricData?.p75 ?? null;
		const score = calculateMetricScore(rawValue, resMetric);
		const weight = RES_WEIGHTS[resMetric];

		if (metricData?.samples) {
			totalSamples += metricData.samples;
		}

		let contribution: number | null = null;
		if (score !== null) {
			contribution = score * weight;
			weightedSum += contribution;
			totalWeight += weight;
		}

		metricScores.push({
			metric: resMetric,
			rawValue,
			score,
			weight,
			contribution,
			status: getMetricStatus(rawValue, resMetric),
		});
	}

	// Calculate final RES as weighted average
	// If not all metrics are available, normalize by available weights
	const finalScore =
		totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null;

	return {
		score: finalScore,
		status: getScoreStatus(finalScore),
		metrics: metricScores,
		totalSamples,
	};
}

/**
 * Calculate RES trend by comparing current and previous period scores
 */
export function calculateRESTrend(
	currentMetrics: MetricInput[],
	previousMetrics: MetricInput[]
): { change: number | null; previousScore: number | null } {
	const currentRES = calculateRES(currentMetrics);
	const previousRES = calculateRES(previousMetrics);

	if (currentRES.score === null || previousRES.score === null) {
		return { change: null, previousScore: previousRES.score };
	}

	const change = currentRES.score - previousRES.score;
	return { change, previousScore: previousRES.score };
}
