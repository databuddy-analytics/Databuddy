import type { PerformanceEntry, PerformanceSummary } from '@/types/performance';

export const SCORE_THRESHOLDS = {
	FAST: 1000,
	MODERATE: 3000,
	SLOW_PENALTY_RANGE: 4000,
};

export function calculatePerformanceSummary(
	pages: PerformanceEntry[]
): PerformanceSummary {
	if (!pages.length) {
		return {
			avgLoadTime: 0,
			fastPages: 0,
			slowPages: 0,
			totalPages: 0,
			performanceScore: 0,
		};
	}

	let totalLoadTime = 0;
	let fastPages = 0;
	let slowPages = 0;
	let totalVisitorWeight = 0;
	let weightedScoreSum = 0;

	for (const page of pages) {
		const loadTime = page.avg_load_time;
		const visitors = page.visitors > 0 ? page.visitors : 1;

		totalLoadTime += loadTime * visitors;
		totalVisitorWeight += visitors;

		if (loadTime < SCORE_THRESHOLDS.FAST) {
			fastPages++;
		} else if (loadTime > SCORE_THRESHOLDS.MODERATE) {
			slowPages++;
		}

		let score: number;
		if (loadTime <= SCORE_THRESHOLDS.FAST) {
			score = 100;
		} else if (loadTime <= SCORE_THRESHOLDS.MODERATE) {
			const range = SCORE_THRESHOLDS.MODERATE - SCORE_THRESHOLDS.FAST;
			score = 100 - ((loadTime - SCORE_THRESHOLDS.FAST) / range) * 50;
		} else {
			score =
				50 -
				((loadTime - SCORE_THRESHOLDS.MODERATE) /
					SCORE_THRESHOLDS.SLOW_PENALTY_RANGE) *
					50;
		}

		weightedScoreSum += Math.max(0, score) * visitors;
	}

	const avgLoadTime =
		totalVisitorWeight > 0 ? totalLoadTime / totalVisitorWeight : 0;
	const performanceScore =
		totalVisitorWeight > 0
			? Math.round(weightedScoreSum / totalVisitorWeight)
			: 0;

	return {
		avgLoadTime,
		fastPages,
		slowPages,
		totalPages: pages.length,
		performanceScore,
	};
}
