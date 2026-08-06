import type { InvestigationOutcome } from "@databuddy/shared/insights";

/**
 * Read-only, redacted checks for the final copy rendered in an investigation.
 *
 * This deliberately evaluates normalized outcomes rather than raw model output:
 * runtime validation owns source receipts, candidate legality, and mutation
 * safety. The report contains only case handles, counts, and failure codes so
 * it can be kept alongside a production shadow without reproducing tenant copy.
 */
export const insightOutputQualityFailureCodes = [
	"action_requirements",
	"duplicate_rendered_copy",
	"observed_experience_provenance",
	"published_impact_provenance",
	"rendered_copy_budget",
	"root_cause_tool_provenance",
	"title_word_count",
	"watch_requirements",
] as const;

export type InsightOutputQualityFailureCode =
	(typeof insightOutputQualityFailureCodes)[number];

interface ProjectedBrief {
	claimSources: {
		impact: "provided" | "tool" | null;
		problem: "provided" | "tool";
		rootCause: "provided" | "tool" | null;
	};
	userExperience:
		| "measured"
		| "observed_configured_completion"
		| "observed_session_behavior"
		| "unmeasured";
}

export interface InsightOutputQualityCase {
	brief: ProjectedBrief | null;
	outcome: InvestigationOutcome | null;
	status: string;
}

export interface InsightOutputQualityCaseResult {
	failures: InsightOutputQualityFailureCode[];
	renderedWordCount: number;
	renderedWordCounts: {
		evidence: number;
		impact: number;
		next: number;
		rootCause: number;
		summary: number;
		title: number;
	};
	titleWordCount: number;
}

type InsightOutputDisposition = InvestigationOutcome["next"]["type"];

type InsightOutputEvidenceBucket = "one" | "two";

type InsightOutputRecommendationKind =
	| "databuddy_setup"
	| "funnel_draft"
	| "goal_draft"
	| "goal_operation"
	| "instrumentation"
	| "measurement_gap"
	| "native"
	| "none";

interface InsightOutputShapeSample {
	disposition: InsightOutputDisposition;
	evidenceBucket: InsightOutputEvidenceBucket;
	evidenceWordCount: number;
	nextWordCount: number;
	published: boolean;
	recommendationKind: InsightOutputRecommendationKind;
	renderedWordCount: number;
}

interface InsightOutputQualityEvaluationSample {
	result: InsightOutputQualityCaseResult;
	shape: InsightOutputShapeSample;
}

export interface InsightOutputShapeSummary {
	byDisposition: Record<
		InsightOutputDisposition,
		{
			cases: number;
			notPublished: number;
			published: number;
			totalNextWords: number;
			totalRenderedWords: number;
		}
	>;
	byEvidenceCount: Record<
		InsightOutputEvidenceBucket,
		{
			cases: number;
			totalEvidenceWords: number;
			totalRenderedWords: number;
		}
	>;
	recommendationKinds: Record<InsightOutputRecommendationKind, number>;
}

export interface InsightOutputQualityEvaluation {
	casePassRate: number | null;
	casesEvaluated: number;
	casesIgnored: number;
	casesPassing: number;
	contractFailureCount: number;
	editorialFailureCount: number;
	failureCounts: Record<InsightOutputQualityFailureCode, number>;
	outputShape: InsightOutputShapeSummary;
	results: InsightOutputQualityCaseResult[];
	totalFailures: number;
}

const MAX_RENDERED_WORDS = 90;
const MAX_TITLE_WORDS = 12;
const WHITESPACE_PATTERN = /\s+/u;
const GLOBAL_WHITESPACE_PATTERN = /\s+/gu;

const editorialFailureCodes = new Set<InsightOutputQualityFailureCode>([
	"duplicate_rendered_copy",
	"rendered_copy_budget",
	"title_word_count",
]);

function wordCount(value: string): number {
	return value.trim().split(WHITESPACE_PATTERN).filter(Boolean).length;
}

function normalizedCopy(value: string): string {
	return value
		.trim()
		.replace(GLOBAL_WHITESPACE_PATTERN, " ")
		.toLocaleLowerCase("en-US");
}

/** Values rendered in the investigation card, excluding static UI labels. */
function renderedCopy(outcome: InvestigationOutcome): string[] {
	const values = [
		outcome.title,
		outcome.summary,
		...(outcome.impact ? [outcome.impact] : []),
		...(outcome.rootCause ? [outcome.rootCause] : []),
		...outcome.evidence,
	];
	switch (outcome.next.type) {
		case "act":
			return [...values, outcome.next.action, outcome.next.verification];
		case "ask":
			return [...values, outcome.next.question];
		case "watch":
			return [...values, outcome.next.escalation];
		case "resolve":
			return [...values, outcome.next.reason];
		default:
			throw new Error("Unknown investigation next type");
	}
}

function nextCopy(outcome: InvestigationOutcome): string[] {
	switch (outcome.next.type) {
		case "act":
			return [outcome.next.action, outcome.next.verification];
		case "ask":
			return [outcome.next.question];
		case "watch":
			return [outcome.next.escalation];
		case "resolve":
			return [outcome.next.reason];
		default:
			throw new Error("Unknown investigation next type");
	}
}

function recommendationKind(
	outcome: InvestigationOutcome
): InsightOutputRecommendationKind {
	const recommendation = outcome.recommendation;
	if (!recommendation) {
		return "none";
	}
	if ("nativeAction" in recommendation) {
		return "native";
	}
	if ("kind" in recommendation) {
		return recommendation.kind;
	}
	return "goal_operation";
}

function hasDuplicateRenderedCopy(values: string[]): boolean {
	const seen = new Set<string>();
	for (const value of values) {
		const normalized = normalizedCopy(value);
		if (seen.has(normalized)) {
			return true;
		}
		seen.add(normalized);
	}
	return false;
}

function emptyFailureCounts(): Record<InsightOutputQualityFailureCode, number> {
	return Object.fromEntries(
		insightOutputQualityFailureCodes.map((code) => [code, 0])
	) as Record<InsightOutputQualityFailureCode, number>;
}

export function evaluateInsightOutputQualityCase(
	item: InsightOutputQualityCase
): InsightOutputQualityCaseResult | null {
	if (item.status !== "completed" || !item.outcome) {
		return null;
	}
	const outcome = item.outcome;
	const brief = item.brief;
	const rendered = renderedCopy(outcome);
	const titleWordCount = wordCount(outcome.title);
	const renderedWordCounts = {
		evidence: outcome.evidence.reduce(
			(total, value) => total + wordCount(value),
			0
		),
		impact: outcome.impact ? wordCount(outcome.impact) : 0,
		next: nextCopy(outcome).reduce(
			(total, value) => total + wordCount(value),
			0
		),
		rootCause: outcome.rootCause ? wordCount(outcome.rootCause) : 0,
		summary: wordCount(outcome.summary),
		title: titleWordCount,
	};
	const renderedWordCount = rendered.reduce(
		(total, value) => total + wordCount(value),
		0
	);
	const failures: InsightOutputQualityFailureCode[] = [];

	if (titleWordCount > MAX_TITLE_WORDS) {
		failures.push("title_word_count");
	}
	if (renderedWordCount > MAX_RENDERED_WORDS) {
		failures.push("rendered_copy_budget");
	}
	if (hasDuplicateRenderedCopy(rendered)) {
		failures.push("duplicate_rendered_copy");
	}
	if (
		outcome.publish === true &&
		(outcome.impact === null || brief?.claimSources.impact === null)
	) {
		failures.push("published_impact_provenance");
	}
	if (outcome.rootCause !== null && brief?.claimSources.rootCause !== "tool") {
		failures.push("root_cause_tool_provenance");
	}
	if (
		outcome.next.type === "act" &&
		(outcome.publish !== true ||
			outcome.impact === null ||
			outcome.rootCause === null ||
			!outcome.next.recheckAt)
	) {
		failures.push("action_requirements");
	}
	if (
		outcome.next.type === "watch" &&
		!(outcome.next.recheckAt && outcome.next.threshold)
	) {
		failures.push("watch_requirements");
	}
	if (
		brief &&
		brief.userExperience !== "unmeasured" &&
		(outcome.impact === null || brief.claimSources.impact === null)
	) {
		failures.push("observed_experience_provenance");
	}

	return {
		failures,
		renderedWordCount,
		renderedWordCounts,
		titleWordCount,
	};
}

/**
 * Aggregate-only structural telemetry for a completed outcome. It deliberately
 * retains no generated strings, identifiers, routes, thresholds, or payloads.
 */
export function projectInsightOutputShape(
	outcome: InvestigationOutcome,
	result: InsightOutputQualityCaseResult
): InsightOutputShapeSample {
	return {
		disposition: outcome.next.type,
		evidenceBucket: outcome.evidence.length === 1 ? "one" : "two",
		evidenceWordCount: result.renderedWordCounts.evidence,
		nextWordCount: result.renderedWordCounts.next,
		published: outcome.publish === true,
		recommendationKind: recommendationKind(outcome),
		renderedWordCount: result.renderedWordCount,
	};
}

function summarizeOutputShape(
	evaluations: InsightOutputQualityEvaluationSample[]
): InsightOutputShapeSummary {
	const byDisposition: InsightOutputShapeSummary["byDisposition"] = {
		act: {
			cases: 0,
			notPublished: 0,
			published: 0,
			totalNextWords: 0,
			totalRenderedWords: 0,
		},
		ask: {
			cases: 0,
			notPublished: 0,
			published: 0,
			totalNextWords: 0,
			totalRenderedWords: 0,
		},
		resolve: {
			cases: 0,
			notPublished: 0,
			published: 0,
			totalNextWords: 0,
			totalRenderedWords: 0,
		},
		watch: {
			cases: 0,
			notPublished: 0,
			published: 0,
			totalNextWords: 0,
			totalRenderedWords: 0,
		},
	};
	const byEvidenceCount: InsightOutputShapeSummary["byEvidenceCount"] = {
		one: { cases: 0, totalEvidenceWords: 0, totalRenderedWords: 0 },
		two: { cases: 0, totalEvidenceWords: 0, totalRenderedWords: 0 },
	};
	const recommendationKinds: InsightOutputShapeSummary["recommendationKinds"] =
		{
			databuddy_setup: 0,
			funnel_draft: 0,
			goal_draft: 0,
			goal_operation: 0,
			instrumentation: 0,
			measurement_gap: 0,
			native: 0,
			none: 0,
		};

	for (const { shape } of evaluations) {
		const disposition = byDisposition[shape.disposition];
		disposition.cases += 1;
		if (shape.published) {
			disposition.published += 1;
		} else {
			disposition.notPublished += 1;
		}
		disposition.totalNextWords += shape.nextWordCount;
		disposition.totalRenderedWords += shape.renderedWordCount;

		const evidence = byEvidenceCount[shape.evidenceBucket];
		evidence.cases += 1;
		evidence.totalEvidenceWords += shape.evidenceWordCount;
		evidence.totalRenderedWords += shape.renderedWordCount;

		recommendationKinds[shape.recommendationKind] += 1;
	}

	return { byDisposition, byEvidenceCount, recommendationKinds };
}

/**
 * Grades only completed normalized outcomes. Error, deferred, and empty cases
 * are reported as ignored so operational reliability is never misrepresented
 * as editorial quality.
 */
export function summarizeInsightOutputQualityResults(params: {
	caseCount: number;
	evaluations: InsightOutputQualityEvaluationSample[];
}): InsightOutputQualityEvaluation {
	const { caseCount, evaluations } = params;
	const results = evaluations.map((evaluation) => evaluation.result);
	const failureCounts = emptyFailureCounts();
	for (const result of results) {
		for (const failure of result.failures) {
			failureCounts[failure] += 1;
		}
	}
	const casesPassing = results.filter(
		(result) => result.failures.length === 0
	).length;
	const totalFailures = results.reduce(
		(total, result) => total + result.failures.length,
		0
	);
	const editorialFailureCount = insightOutputQualityFailureCodes
		.filter((code) => editorialFailureCodes.has(code))
		.reduce((total, code) => total + failureCounts[code], 0);

	return {
		casePassRate: results.length === 0 ? null : casesPassing / results.length,
		casesEvaluated: results.length,
		casesIgnored: caseCount - results.length,
		casesPassing,
		contractFailureCount: totalFailures - editorialFailureCount,
		editorialFailureCount,
		failureCounts,
		outputShape: summarizeOutputShape(evaluations),
		results,
		totalFailures,
	};
}

export function evaluateInsightOutputQuality(
	cases: InsightOutputQualityCase[]
): InsightOutputQualityEvaluation {
	const evaluations = cases.flatMap((item) => {
		const result = evaluateInsightOutputQualityCase(item);
		if (!(result && item.outcome)) {
			return [];
		}
		return [
			{
				result,
				shape: projectInsightOutputShape(item.outcome, result),
			},
		];
	});
	return summarizeInsightOutputQualityResults({
		caseCount: cases.length,
		evaluations,
	});
}
