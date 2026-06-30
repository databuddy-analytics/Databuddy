import type { EvalCase, ParsedAgentResponse, ScoreCard } from "./types";

const TOOL_ERROR_TEXT_REGEX =
	/\b(error|forbidden|unauthorized|permission denied)\b/i;
const WORD_SPLIT_REGEX = /\s+/;
const LINE_SPLIT_REGEX = /\r?\n/;
const PARAGRAPH_SPLIT_REGEX = /\n\s*\n/;
const BULLET_LINE_REGEX = /^\s*(?:[-*+]|\d+[.)])\s+/;
const ATX_HEADING_REGEX = /^\s{0,3}#{1,6}\s+\S/;
const BOLD_HEADING_REGEX = /^\s*\*\*[^*]{2,80}\*\*:?\s*$/;
const MARKDOWN_TABLE_SEPARATOR_REGEX =
	/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;

interface ScoreResult {
	failures: string[];
	score: number;
	warnings?: string[];
}

export function scoreToolRouting(
	evalCase: EvalCase,
	response: ParsedAgentResponse
): ScoreResult {
	const failures: string[] = [];
	let score = 100;
	const called = new Set(response.toolCalls.map((tc) => tc.name));
	const failedCalls = response.toolCalls.filter((call) =>
		toolOutputLooksFailed(call.output)
	);

	if (evalCase.expect.toolsCalled) {
		for (const tool of evalCase.expect.toolsCalled) {
			const calls = response.toolCalls.filter((call) => call.name === tool);
			if (calls.length === 0) {
				score -= Math.floor(100 / evalCase.expect.toolsCalled.length);
				failures.push(`Expected tool '${tool}' not called`);
				continue;
			}
			if (calls.some((call) => toolOutputLooksFailed(call.output))) {
				score -= 25;
				failures.push(`Expected tool '${tool}' returned an error`);
			}
		}
	}

	if (evalCase.expect.toolsCalledInOrder) {
		let searchFrom = 0;
		for (const tool of evalCase.expect.toolsCalledInOrder) {
			const foundAt = response.toolCalls.findIndex(
				(call, index) => index >= searchFrom && call.name === tool
			);
			if (foundAt === -1) {
				score -= 20;
				failures.push(`Expected tool '${tool}' in call order`);
				continue;
			}
			searchFrom = foundAt + 1;
		}
	}

	for (const call of failedCalls) {
		if (!evalCase.expect.toolsCalled?.includes(call.name)) {
			score -= 10;
			failures.push(`Tool '${call.name}' returned an error`);
		}
	}

	if (evalCase.expect.toolsNotCalled) {
		for (const tool of evalCase.expect.toolsNotCalled) {
			if (called.has(tool)) {
				score -= 25;
				failures.push(`Forbidden tool '${tool}' was called`);
			}
		}
	}

	if (evalCase.expect.toolCallCounts) {
		for (const expectation of evalCase.expect.toolCallCounts) {
			const count = response.toolCalls.filter(
				(call) => call.name === expectation.tool
			).length;
			if (expectation.min !== undefined && count < expectation.min) {
				score -= 15;
				failures.push(
					`Expected at least ${expectation.min} '${expectation.tool}' calls, got ${count}`
				);
			}
			if (expectation.max !== undefined && count > expectation.max) {
				score -= 15;
				failures.push(
					`Expected at most ${expectation.max} '${expectation.tool}' calls, got ${count}`
				);
			}
		}
	}

	if (evalCase.expect.batchedQueries && !called.has("get_data")) {
		score -= 25;
		failures.push("Expected batched queries via get_data");
	}

	if (evalCase.expect.toolInputs) {
		for (const expectation of evalCase.expect.toolInputs) {
			const calls = response.toolCalls.filter(
				(call) => call.name === expectation.tool
			);
			if (calls.length === 0) {
				score -= 25;
				failures.push(
					`Expected tool '${expectation.tool}' input could not be checked because the tool was not called`
				);
				continue;
			}

			const matched = calls.some((call) =>
				toolInputMatches(call.input, expectation)
			);
			if (!matched) {
				score -= 25;
				failures.push(
					`No '${expectation.tool}' call matched expected input constraints`
				);
			}
		}
	}

	return { score: Math.max(0, Math.min(100, score)), failures };
}

export function scoreBehavioral(
	evalCase: EvalCase,
	response: ParsedAgentResponse
): ScoreResult {
	const failures: string[] = [];
	let score = 100;

	if (evalCase.expect.responseContains) {
		const lower = response.textContent.toLowerCase();
		for (const term of evalCase.expect.responseContains) {
			if (!lower.includes(term.toLowerCase())) {
				score -= Math.floor(25 / evalCase.expect.responseContains.length);
				failures.push(`Response missing expected content: '${term}'`);
			}
		}
	}

	if (evalCase.expect.responseMatches) {
		for (const expectation of evalCase.expect.responseMatches) {
			const regex = toRegExp(expectation.pattern, expectation.flags);
			if (!regex.test(response.textContent)) {
				score -= Math.floor(25 / evalCase.expect.responseMatches.length);
				failures.push(
					`Response missing expected pattern: '${expectation.description ?? expectation.pattern}'`
				);
			}
		}
	}

	if (evalCase.expect.responseNotContains) {
		const lower = response.textContent.toLowerCase();
		for (const term of evalCase.expect.responseNotContains) {
			if (lower.includes(term.toLowerCase())) {
				score -= 25;
				failures.push(`Response contains forbidden content: '${term}'`);
			}
		}
	}

	if (evalCase.expect.responseNotMatches) {
		for (const expectation of evalCase.expect.responseNotMatches) {
			const regex = toRegExp(expectation.pattern, expectation.flags);
			if (regex.test(response.textContent)) {
				score -= 25;
				failures.push(
					`Response matched forbidden pattern: '${expectation.description ?? expectation.pattern}'`
				);
			}
		}
	}

	if (evalCase.expect.confirmationFlow) {
		const hasConfirmFalse =
			response.textContent.includes("confirmed") ||
			response.toolCalls.some((call) =>
				hasNestedValue(call.input, "confirmed", false)
			);
		if (!hasConfirmFalse) {
			score -= 25;
			failures.push(
				"Expected confirmation flow (confirmed=false) not detected"
			);
		}
	}

	return { score: Math.max(0, Math.min(100, score)), failures };
}

function toRegExp(pattern: string, flags?: string): RegExp {
	const normalizedFlags = flags?.includes("i") ? flags : `${flags ?? ""}i`;
	return new RegExp(pattern, normalizedFlags);
}

function toolInputMatches(
	input: unknown,
	expectation: NonNullable<EvalCase["expect"]["toolInputs"]>[number]
): boolean {
	if (expectation.excludes) {
		for (const key of expectation.excludes) {
			if (hasNestedKey(input, key)) {
				return false;
			}
		}
	}

	if (expectation.includes) {
		for (const [key, expected] of Object.entries(expectation.includes)) {
			if (!hasNestedValue(input, key, expected)) {
				return false;
			}
		}
	}

	return true;
}

function hasNestedKey(value: unknown, key: string): boolean {
	if (!value || typeof value !== "object") {
		return false;
	}
	if (Object.hasOwn(value, key)) {
		return true;
	}
	return Object.values(value).some((child) => hasNestedKey(child, key));
}

function hasNestedValue(
	value: unknown,
	key: string,
	expected: unknown
): boolean {
	if (!value || typeof value !== "object") {
		return false;
	}
	if (
		Object.hasOwn(value, key) &&
		(value as Record<string, unknown>)[key] === expected
	) {
		return true;
	}
	return Object.values(value).some((child) =>
		hasNestedValue(child, key, expected)
	);
}

function toolOutputLooksFailed(output: unknown): boolean {
	if (output === null || output === undefined) {
		return false;
	}
	if (typeof output === "string") {
		return stringOutputLooksFailed(output);
	}
	if (Array.isArray(output)) {
		return output.some(toolOutputLooksFailed);
	}
	if (typeof output !== "object") {
		return false;
	}

	const record = output as Record<string, unknown>;
	if (
		record.isError === true ||
		record.ok === false ||
		record.success === false ||
		record.error !== undefined
	) {
		return true;
	}

	if (
		Array.isArray(record.content) &&
		record.content.some(toolOutputLooksFailed)
	) {
		return true;
	}

	if (typeof record.text === "string") {
		return stringOutputLooksFailed(record.text);
	}

	return false;
}

function stringOutputLooksFailed(output: string): boolean {
	const trimmed = output.trim();
	if (!trimmed) {
		return false;
	}
	try {
		return toolOutputLooksFailed(JSON.parse(trimmed));
	} catch {
		return TOOL_ERROR_TEXT_REGEX.test(trimmed);
	}
}

export function scoreFormat(
	evalCase: EvalCase,
	response: ParsedAgentResponse
): ScoreResult {
	const failures: string[] = [];
	let score = 100;
	const text = response.textContent.trim();

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

	if (evalCase.expect.validChartJSON) {
		if (response.chartJSONs.length === 0) {
			score -= 30;
			failures.push("No valid chart JSON found in response");
		} else {
			for (const chart of response.chartJSONs) {
				const p = chart.parsed as Record<string, unknown>;
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

	if (evalCase.expect.noRawJSON && response.rawJSONLeaks.length > 0) {
		score -= 20;
		failures.push(
			`Raw JSON leaked in response: ${response.rawJSONLeaks.length} instances`
		);
	}

	if (
		evalCase.expect.maxResponseChars !== undefined &&
		text.length > evalCase.expect.maxResponseChars
	) {
		score -= 20;
		failures.push(
			`Response has ${text.length} chars, exceeds budget ${evalCase.expect.maxResponseChars}`
		);
	}

	if (evalCase.expect.maxResponseWords !== undefined) {
		const words = countWords(text);
		if (words > evalCase.expect.maxResponseWords) {
			score -= 25;
			failures.push(
				`Response has ${words} words, exceeds budget ${evalCase.expect.maxResponseWords}`
			);
		}
	}

	if (evalCase.expect.maxResponseLines !== undefined) {
		const lines = countNonEmptyLines(text);
		if (lines > evalCase.expect.maxResponseLines) {
			score -= 15;
			failures.push(
				`Response has ${lines} non-empty lines, exceeds budget ${evalCase.expect.maxResponseLines}`
			);
		}
	}

	if (evalCase.expect.maxParagraphs !== undefined) {
		const paragraphs = countParagraphs(text);
		if (paragraphs > evalCase.expect.maxParagraphs) {
			score -= 15;
			failures.push(
				`Response has ${paragraphs} paragraphs, exceeds budget ${evalCase.expect.maxParagraphs}`
			);
		}
	}

	if (evalCase.expect.maxBulletCount !== undefined) {
		const bullets = countBulletLines(text);
		if (bullets > evalCase.expect.maxBulletCount) {
			score -= 15;
			failures.push(
				`Response has ${bullets} bullet lines, exceeds budget ${evalCase.expect.maxBulletCount}`
			);
		}
	}

	if (evalCase.expect.maxHeadingCount !== undefined) {
		const headings = countHeadingLines(text);
		if (headings > evalCase.expect.maxHeadingCount) {
			score -= 15;
			failures.push(
				`Response has ${headings} heading lines, exceeds budget ${evalCase.expect.maxHeadingCount}`
			);
		}
	}

	if (evalCase.expect.forbidMarkdownTable && containsMarkdownTable(text)) {
		score -= 25;
		failures.push("Response includes a markdown table despite table ban");
	}

	return { score: Math.max(0, Math.min(100, score)), failures };
}

function countWords(text: string): number {
	return text ? text.split(WORD_SPLIT_REGEX).filter(Boolean).length : 0;
}

function countNonEmptyLines(text: string): number {
	return text.split(LINE_SPLIT_REGEX).filter((line) => line.trim()).length;
}

function countParagraphs(text: string): number {
	return text.split(PARAGRAPH_SPLIT_REGEX).filter((part) => part.trim()).length;
}

function countBulletLines(text: string): number {
	return text
		.split(LINE_SPLIT_REGEX)
		.filter((line) => BULLET_LINE_REGEX.test(line)).length;
}

function countHeadingLines(text: string): number {
	return text
		.split(LINE_SPLIT_REGEX)
		.filter(
			(line) => ATX_HEADING_REGEX.test(line) || BOLD_HEADING_REGEX.test(line)
		).length;
}

function containsMarkdownTable(text: string): boolean {
	const lines = text.split(LINE_SPLIT_REGEX);
	return lines.some((line, index) => {
		if (!(line.includes("|") && lines[index + 1]?.includes("|"))) {
			return false;
		}
		return MARKDOWN_TABLE_SEPARATOR_REGEX.test(lines[index + 1]);
	});
}

export function scorePerformance(
	evalCase: EvalCase,
	response: ParsedAgentResponse
): ScoreResult {
	const warnings: string[] = [];
	let score: number;

	const ms = response.latencyMs;
	if (ms < 60_000) {
		score = 100;
	} else if (ms < 120_000) {
		score = 90;
	} else if (ms < 180_000) {
		score = 80;
	} else if (ms < 300_000) {
		score = 70;
	} else if (ms < 600_000) {
		score = 50;
	} else {
		score = 0;
	}

	if (evalCase.expect.maxLatencyMs && ms > evalCase.expect.maxLatencyMs) {
		warnings.push(
			`Latency ${ms}ms exceeds budget ${evalCase.expect.maxLatencyMs}ms`
		);
	}

	if (evalCase.expect.maxSteps && response.steps > evalCase.expect.maxSteps) {
		const extra = response.steps - evalCase.expect.maxSteps;
		score = Math.max(0, score - extra * 10);
		warnings.push(
			`${response.steps} steps exceeds budget of ${evalCase.expect.maxSteps}`
		);
	}

	return { score: Math.max(0, Math.min(100, score)), failures: [], warnings };
}

export function scoreCase(
	evalCase: EvalCase,
	response: ParsedAgentResponse
): { scores: Partial<ScoreCard>; failures: string[]; warnings: string[] } {
	const allFailures: string[] = [];
	const allWarnings: string[] = [];
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
	if (pf.warnings) {
		allWarnings.push(...pf.warnings);
	}

	return { scores, failures: allFailures, warnings: allWarnings };
}
