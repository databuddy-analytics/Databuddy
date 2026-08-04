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
	titleWordCount: number;
}

export interface InsightOutputQualityEvaluation {
	casePassRate: number | null;
	casesEvaluated: number;
	casesIgnored: number;
	casesPassing: number;
	contractFailureCount: number;
	editorialFailureCount: number;
	failureCounts: Record<InsightOutputQualityFailureCode, number>;
	results: InsightOutputQualityCaseResult[];
	totalFailures: number;
}

const MAX_RENDERED_WORDS = 90;
const MIN_TITLE_WORDS = 5;
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
	const renderedWordCount = rendered.reduce(
		(total, value) => total + wordCount(value),
		0
	);
	const failures: InsightOutputQualityFailureCode[] = [];

	if (titleWordCount < MIN_TITLE_WORDS || titleWordCount > MAX_TITLE_WORDS) {
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
		titleWordCount,
	};
}

/**
 * Grades only completed normalized outcomes. Error, deferred, and empty cases
 * are reported as ignored so operational reliability is never misrepresented
 * as editorial quality.
 */
export function summarizeInsightOutputQualityResults(params: {
	caseCount: number;
	results: InsightOutputQualityCaseResult[];
}): InsightOutputQualityEvaluation {
	const { caseCount, results } = params;
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
		results,
		totalFailures,
	};
}

export function evaluateInsightOutputQuality(
	cases: InsightOutputQualityCase[]
): InsightOutputQualityEvaluation {
	const results = cases.flatMap((item) => {
		const result = evaluateInsightOutputQualityCase(item);
		return result ? [result] : [];
	});
	return summarizeInsightOutputQualityResults({
		caseCount: cases.length,
		results,
	});
}
