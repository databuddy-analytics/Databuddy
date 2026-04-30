export type EvalCategory = "tool-routing" | "behavioral" | "quality" | "format";

export interface EvalCase {
	category: EvalCategory;
	expect: {
		toolsCalled?: string[];
		toolsNotCalled?: string[];
		batchedQueries?: boolean;
		responseContains?: string[];
		responseNotContains?: string[];
		chartType?: string;
		validChartJSON?: boolean;
		noRawJSON?: boolean;
		maxSteps?: number;
		maxLatencyMs?: number;
		maxInputTokens?: number;
		confirmationFlow?: boolean;
	};
	id: string;
	name: string;
	query: string;
	websiteId: string;
}

export interface ScoreCard {
	behavioral: number;
	format: number;
	performance: number;
	quality: number;
	tool_routing: number;
}

export interface CaseMetrics {
	costUsd: number;
	inputTokens: number;
	latencyMs: number;
	outputTokens: number;
	steps: number;
}

export interface ToolCallRecord {
	input: unknown;
	name: string;
	output: unknown;
}

export interface CaseResult {
	category: string;
	failures: string[];
	id: string;
	metrics: CaseMetrics;
	name: string;
	passed: boolean;
	query: string;
	response: string;
	scores: Partial<ScoreCard>;
	toolCalls: ToolCallRecord[];
	toolsCalled: string[];
}

export interface EvalRun {
	apiUrl: string;
	cases: CaseResult[];
	dimensions: ScoreCard;
	duration: number;
	model: string;
	summary: {
		total: number;
		passed: number;
		failed: number;
		score: number;
	};
	timestamp: string;
}

export interface JudgeScores {
	actionability: number;
	analyticalDepth: number;
	average: number;
	communication: number;
	completeness: number;
	dataGrounding: number;
}

export interface ParsedAgentResponse {
	chartJSONs: Array<{ type: string; raw: string; parsed: unknown }>;
	inputTokens: number;
	latencyMs: number;
	outputTokens: number;
	rawJSONLeaks: string[];
	steps: number;
	textContent: string;
	toolCalls: Array<{ name: string; input: unknown; output: unknown }>;
}

export interface EvalConfig {
	apiKey?: string;
	apiUrl: string;
	authCookie?: string;
	judgeModel?: string;
	modelOverride?: string;
	skipJudge: boolean;
}
