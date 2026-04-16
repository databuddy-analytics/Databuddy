import type { EvalCase, ParsedAgentResponse, ScoreCard } from "./types";

interface ScoreResult {
	failures: string[];
	score: number;
}

export function scoreToolRouting(
	evalCase: EvalCase,
	response: ParsedAgentResponse
): ScoreResult {
	const failures: string[] = [];
	let score = 100;
	const called = new Set(response.toolCalls.map((tc) => tc.name));

	// Check expected tools were called
	if (evalCase.expect.toolsCalled) {
		for (const tool of evalCase.expect.toolsCalled) {
			if (!called.has(tool)) {
				score -= Math.floor(100 / evalCase.expect.toolsCalled.length);
				failures.push(`Expected tool '${tool}' not called`);
			}
		}
	}

	// Check forbidden tools were NOT called
	if (evalCase.expect.toolsNotCalled) {
		for (const tool of evalCase.expect.toolsNotCalled) {
			if (called.has(tool)) {
				score -= 25;
				failures.push(`Forbidden tool '${tool}' was called`);
			}
		}
	}

	// Check batching
	if (evalCase.expect.batchedQueries && !called.has("get_data")) {
		score -= 25;
		failures.push("Expected batched queries via get_data");
	}

	return { score: Math.max(0, Math.min(100, score)), failures };
}

export function scoreBehavioral(
	evalCase: EvalCase,
	response: ParsedAgentResponse
): ScoreResult {
	const failures: string[] = [];
	let score = 100;

	// Check responseContains
	if (evalCase.expect.responseContains) {
		const lower = response.textContent.toLowerCase();
		for (const term of evalCase.expect.responseContains) {
			if (!lower.includes(term.toLowerCase())) {
				score -= Math.floor(25 / evalCase.expect.responseContains.length);
				failures.push(`Response missing expected content: '${term}'`);
			}
		}
	}

	// Check responseNotContains
	if (evalCase.expect.responseNotContains) {
		const lower = response.textContent.toLowerCase();
		for (const term of evalCase.expect.responseNotContains) {
			if (lower.includes(term.toLowerCase())) {
				score -= 25;
				failures.push(`Response contains forbidden content: '${term}'`);
			}
		}
	}

	// Check confirmation flow (tool called with confirmed=false)
	if (evalCase.expect.confirmationFlow) {
		const hasConfirmFalse = response.textContent.includes("confirmed");
		if (!hasConfirmFalse) {
			score -= 25;
			failures.push(
				"Expected confirmation flow (confirmed=false) not detected"
			);
		}
	}

	return { score: Math.max(0, Math.min(100, score)), failures };
}

export function scoreFormat(
	evalCase: EvalCase,
	response: ParsedAgentResponse
): ScoreResult {
	const failures: string[] = [];
	let score = 100;

	// Check chart type
	if (evalCase.expect.chartType) {
		const hasChart = response.chartJSONs.some(
			(c) => c.type === evalCase.expect.chartType
		);
		if (!hasChart) {
			score -= 30;
			failures.push(
				`Expected chart type '${evalCase.expect.chartType}' not found`
			);
		}
	}

	// Check valid chart JSON
	if (evalCase.expect.validChartJSON) {
		if (response.chartJSONs.length === 0) {
			score -= 30;
			failures.push("No valid chart JSON found in response");
		} else {
			for (const chart of response.chartJSONs) {
				const p = chart.parsed as Record<string, unknown>;
				// Row-oriented format check
				if (
					[
						"line-chart",
						"bar-chart",
						"area-chart",
						"stacked-bar-chart",
					].includes(chart.type) &&
					!(Array.isArray(p.series) && Array.isArray(p.rows))
				) {
					score -= 20;
					failures.push(
						`Chart '${chart.type}' missing row-oriented format (series+rows)`
					);
				}
				if (
					["pie-chart", "donut-chart"].includes(chart.type) &&
					!Array.isArray(p.rows)
				) {
					score -= 20;
					failures.push(`Chart '${chart.type}' missing rows array`);
				}
			}
		}
	}

	// Check no raw JSON leaks
	if (evalCase.expect.noRawJSON && response.rawJSONLeaks.length > 0) {
		score -= 20;
		failures.push(
			`Raw JSON leaked in response: ${response.rawJSONLeaks.length} instances`
		);
	}

	return { score: Math.max(0, Math.min(100, score)), failures };
}

export function scorePerformance(
	evalCase: EvalCase,
	response: ParsedAgentResponse
): ScoreResult {
	const failures: string[] = [];
	let score = 100;

	// Latency
	if (evalCase.expect.maxLatencyMs) {
		const ratio = response.latencyMs / evalCase.expect.maxLatencyMs;
		if (ratio > 1) {
			const penalty = Math.min(40, Math.floor((ratio - 1) * 20));
			score -= penalty;
			failures.push(
				`Latency ${response.latencyMs}ms exceeds budget ${evalCase.expect.maxLatencyMs}ms`
			);
		}
	}

	// Steps
	if (evalCase.expect.maxSteps && response.steps > evalCase.expect.maxSteps) {
		const extra = response.steps - evalCase.expect.maxSteps;
		score -= extra * 20;
		failures.push(
			`${response.steps} steps exceeds budget of ${evalCase.expect.maxSteps}`
		);
	}

	return { score: Math.max(0, Math.min(100, score)), failures };
}

/**
 * Run all applicable scorers for a test case.
 */
export function scoreCase(
	evalCase: EvalCase,
	response: ParsedAgentResponse
): { scores: Partial<ScoreCard>; failures: string[] } {
	const allFailures: string[] = [];
	const scores: Partial<ScoreCard> = {};

	const tr = scoreToolRouting(evalCase, response);
	scores.tool_routing = tr.score;
	allFailures.push(...tr.failures);

	const bh = scoreBehavioral(evalCase, response);
	scores.behavioral = bh.score;
	allFailures.push(...bh.failures);

	const fm = scoreFormat(evalCase, response);
	scores.format = fm.score;
	allFailures.push(...fm.failures);

	const pf = scorePerformance(evalCase, response);
	scores.performance = pf.score;
	allFailures.push(...pf.failures);

	return { scores, failures: allFailures };
}
