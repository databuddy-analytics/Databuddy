import type { GeneratedInsight } from "@databuddy/shared/insights";
import {
	type InvestigationSources,
	investigateWebsiteWithSources,
	type WebsiteInvestigationArtifact,
} from "../../../apps/insights/src/generation";
import { nextRecheckAt } from "../../../apps/insights/src/observations";
import type { LatestInsightObservation } from "../../../apps/insights/src/observations";
import { classifyRecurrence } from "../../../apps/insights/src/persistence";
import { INSIGHT_COOLDOWN_HOURS } from "../../../apps/insights/src/policy";
import {
	computeResolutions,
	type OpenInsightRow,
	retiredSignalKeyForOutcome,
} from "../../../apps/insights/src/resolution";
import {
	insightTimelines,
	type InsightLifecycle,
	type InsightTimeline,
	type InsightTimelineStage,
} from "./fixtures/insight-timelines";
import {
	visibleInsightText,
	visibleInsightWordCount,
	visibleTextWordCount,
} from "./insight-visible-output";

const MAXIMUM_VISIBLE_WORDS = 100;
const MAXIMUM_DESCRIPTION_WORDS = 40;
const MAXIMUM_SUGGESTION_WORDS = 30;
const MAXIMUM_EVIDENCE_ITEMS = 3;
const DIAGNOSTIC_STEP_PATTERN =
	/\b(check|isolate|profile|reconcile|replay|reproduce|trace|verify)\b/i;
const EVIDENCE_GAP_PATTERN =
	/\b(no|not established|missing|unavailable|without)\b/i;

type Investigate = (
	input: InsightTimelineStage["input"],
	sources: InvestigationSources
) => Promise<WebsiteInvestigationArtifact>;

interface InsightHistoryStageResult {
	artifact: WebsiteInvestigationArtifact | null;
	asOf: string;
	error: string | null;
	failures: string[];
	id: string;
	lifecycle: InsightLifecycle;
}

interface InsightHistoryTimelineResult {
	id: string;
	name: string;
	stages: InsightHistoryStageResult[];
}

interface InsightHistoryResult {
	aggregate: {
		actions: number;
		contexts: number;
		failures: number;
		insights: number;
		maxVisibleWords: number;
		monitors: number;
		stages: number;
		timelines: number;
	};
	passed: boolean;
	timelines: InsightHistoryTimelineResult[];
}

function isJson(value: string): boolean {
	try {
		const parsed: unknown = JSON.parse(value);
		return typeof parsed === "object" && parsed !== null;
	} catch {
		return false;
	}
}

function containsRawJson(value: string): boolean {
	const text = value.trim();
	if (isJson(text)) {
		return true;
	}
	for (const [opening, closing] of [
		["{", "}"],
		["[", "]"],
	] as const) {
		const start = text.indexOf(opening);
		const end = text.lastIndexOf(closing);
		if (start >= 0 && end > start && isJson(text.slice(start, end + 1))) {
			return true;
		}
	}
	return false;
}

function artifactQualityFailures(
	artifact: WebsiteInvestigationArtifact,
	output: GeneratedInsight | null
): string[] {
	const failures: string[] = [];
	if (output && visibleInsightText(output).some(containsRawJson)) {
		failures.push("raw_json_visible: customer-visible output contains JSON");
	}
	if (output) {
		const descriptionWords = visibleTextWordCount(output.description);
		const suggestionWords = visibleTextWordCount(output.suggestion);
		if (descriptionWords > MAXIMUM_DESCRIPTION_WORDS) {
			failures.push(
				`verbose_description: ${descriptionWords} words; maximum is ${MAXIMUM_DESCRIPTION_WORDS}`
			);
		}
		if (suggestionWords > MAXIMUM_SUGGESTION_WORDS) {
			failures.push(
				`verbose_suggestion: ${suggestionWords} words; maximum is ${MAXIMUM_SUGGESTION_WORDS}`
			);
		}
		if ((output.evidence?.length ?? 0) > MAXIMUM_EVIDENCE_ITEMS) {
			failures.push(
				`too_much_evidence: ${output.evidence?.length ?? 0} items; maximum is ${MAXIMUM_EVIDENCE_ITEMS}`
			);
		}
	}

	const { decision, signal } = artifact;
	if (!(decision && signal)) {
		return failures;
	}
	if (decision.disposition === "action_ready") {
		const confirmation = signal.expectation?.confirmation;
		const cited = artifact.evidence.find(
			(item) => item.evidenceId === decision.remediation.evidenceId
		);
		const supportsAction = Boolean(
			signal.kind === "missing_expected_data" &&
				(signal.entity.type === "funnel" || signal.entity.type === "goal") &&
				confirmation?.definitionId === signal.entity.id &&
				confirmation.definitionType === signal.entity.type &&
				cited &&
				(cited.status === "ok" || cited.status === "truncated") &&
				cited.period === "current" &&
				cited.entity?.id === signal.entity.id &&
				cited.entity.type === signal.entity.type &&
				cited.remediation?.instruction === decision.remediation.instruction
		);
		if (!supportsAction) {
			failures.push(
				"unsupported_action: repair lacks exact definition-scoped evidence"
			);
		}
		const expectedVerification = `Verify after 7 complete days that ${signal.metric.label.toLowerCase()} has moved back toward ${signal.metric.previous ?? "its prior level"}.`;
		if (
			output?.suggestion !== decision.remediation.instruction ||
			!output.description.trim() ||
			!(output.evidence ?? []).some(
				(item) => item.description === expectedVerification
			)
		) {
			failures.push(
				"non_executable_action: visible repair must match the verified instruction"
			);
		}
	}
	if (
		decision.disposition === "needs_context" &&
		signal.severity === "critical" &&
		signal.sentiment === "negative" &&
		((output?.suggestion.match(/\?/g) ?? []).length !== 1 ||
			!DIAGNOSTIC_STEP_PATTERN.test(output?.suggestion ?? ""))
	) {
		failures.push(
			"weak_context_request: critical findings need one question and one next check"
		);
	}
	if (
		decision.disposition === "monitor" &&
		signal.sentiment === "negative" &&
		output &&
		["error", "funnel", "goal", "vital"].includes(signal.entity.type) &&
		!(
			EVIDENCE_GAP_PATTERN.test(output?.suggestion ?? "") &&
			DIAGNOSTIC_STEP_PATTERN.test(output?.suggestion ?? "")
		)
	) {
		failures.push(
			"incomplete_monitor: unresolved findings need the evidence gap and next check"
		);
	}
	return failures;
}

function inferLifecycle(params: {
	artifact: WebsiteInvestigationArtifact;
	hadOpenInsight: boolean;
	recovered: boolean;
	wasWorse: boolean;
}): InsightLifecycle {
	if (params.recovered) {
		return "recovered";
	}
	if (params.artifact.status === "deferred") {
		return params.hadOpenInsight ? "persists" : "none";
	}
	if (!params.artifact.insight) {
		return "none";
	}
	if (params.hadOpenInsight && params.wasWorse) {
		return "worsened";
	}
	return params.hadOpenInsight ? "persists" : "detected";
}

function mismatch(
	label: string,
	expected: unknown,
	actual: unknown
): string | null {
	return Object.is(expected, actual)
		? null
		: `${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`;
}

function normalizedArtifact(
	artifact: WebsiteInvestigationArtifact
): NonNullable<InsightTimelineStage["expect"]["artifact"]> {
	return {
		decision: artifact.decision?.disposition ?? null,
		detectedSignals: artifact.detectedSignals.map((signal) => ({
			direction: signal.direction,
			metric: signal.metric,
			severity: signal.severity,
		})),
		detectionComplete: artifact.detectionComplete,
		evidence: artifact.evidence.map((item) => ({
			queryType: item.queryType,
			status: item.status,
		})),
		insight: artifact.insight
			? {
					sentiment: artifact.insight.sentiment,
					severity: artifact.insight.severity,
					subjectKey: artifact.insight.subjectKey,
					type: artifact.insight.type,
				}
			: null,
		signal: artifact.signal
			? {
					entityType: artifact.signal.entity.type,
					kind: artifact.signal.kind,
					metric: artifact.signal.metric.key,
					severity: artifact.signal.severity,
				}
			: null,
		status: artifact.status,
	};
}

function structuredMismatch(
	label: string,
	expected: unknown,
	actual: unknown
): string | null {
	return JSON.stringify(expected) === JSON.stringify(actual)
		? null
		: `${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`;
}

function validateTimelines(timelines: InsightTimeline[]): void {
	if (timelines.length === 0) {
		throw new Error(
			"Insight history evaluation requires at least one timeline"
		);
	}
	const timelineIds = new Set<string>();
	for (const timeline of timelines) {
		if (timelineIds.has(timeline.id)) {
			throw new Error(`Duplicate insight timeline id: ${timeline.id}`);
		}
		timelineIds.add(timeline.id);
		if (timeline.stages.length === 0) {
			throw new Error(`Insight timeline has no stages: ${timeline.id}`);
		}
		const stageIds = new Set<string>();
		let previousDate = "";
		for (const stage of timeline.stages) {
			if (stageIds.has(stage.id)) {
				throw new Error(
					`Duplicate insight stage id in ${timeline.id}: ${stage.id}`
				);
			}
			stageIds.add(stage.id);
			const expectsStatus =
				stage.expect.status !== undefined ||
				stage.expect.artifact !== undefined;
			const expectsError = stage.expect.expectedError !== undefined;
			if (expectsStatus === expectsError) {
				throw new Error(
					`Insight stage must expect exactly one status or error: ${timeline.id}/${stage.id}`
				);
			}
			if (previousDate && stage.asOf <= previousDate) {
				throw new Error(
					`Insight timeline dates must increase in ${timeline.id}: ${stage.asOf}`
				);
			}
			previousDate = stage.asOf;
		}
	}
}

function openInsightFromArtifact(
	id: string,
	artifact: WebsiteInvestigationArtifact,
	asOf: string
): OpenInsightRow | null {
	if (!(artifact.insight && artifact.signal)) {
		return null;
	}
	return {
		id,
		type: artifact.insight.type,
		changePercent: artifact.insight.changePercent ?? null,
		sentiment: artifact.insight.sentiment,
		subjectKey: artifact.insight.subjectKey,
		createdAt: new Date(asOf),
	};
}

async function runTimeline(
	timeline: InsightTimeline,
	investigate: Investigate
): Promise<InsightHistoryTimelineResult> {
	const observations = new Map<string, LatestInsightObservation>();
	const open = new Map<string, OpenInsightRow>();
	const stages: InsightHistoryStageResult[] = [];

	for (const stage of timeline.stages) {
		let artifact: WebsiteInvestigationArtifact;
		try {
			artifact = await investigate(stage.input, stage.sources(observations));
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			const failures = stage.expect.expectedError
				? [mismatch("error", stage.expect.expectedError, message)].filter(
						(value): value is string => Boolean(value)
					)
				: [`unexpected error: ${message}`];
			const lifecycleFailure = mismatch(
				"lifecycle",
				stage.expect.lifecycle,
				"none"
			);
			if (lifecycleFailure) {
				failures.push(lifecycleFailure);
			}
			stages.push({
				artifact: null,
				asOf: stage.asOf,
				error: message,
				failures,
				id: stage.id,
				lifecycle: "none",
			});
			continue;
		}

		const failures: string[] = [];
		if (stage.expect.expectedError) {
			failures.push(
				`expected error was not raised: ${stage.expect.expectedError}`
			);
		}
		const signalKey = artifact.signal?.signalKey;
		const prior = signalKey ? open.get(signalKey) : undefined;
		const priorObservation = signalKey
			? observations.get(signalKey)
			: undefined;
		const recurrence = artifact.insight
			? classifyRecurrence(
					artifact.insight,
					prior && priorObservation
						? {
								changePercent: priorObservation.signal.changePercent,
								createdAt: prior.createdAt,
								id: prior.id,
								runId: `fixture:${timeline.id}`,
								severity: priorObservation.signal.severity,
								status: "open" as const,
							}
						: undefined,
					new Date(
						new Date(stage.asOf).getTime() -
							INSIGHT_COOLDOWN_HOURS * 60 * 60 * 1000
					)
				)
			: null;
		const retiredSignalKey = retiredSignalKeyForOutcome({
			disposition: artifact.decision?.disposition,
			hasInsight: artifact.insight !== null,
			signalKey,
		});
		const resolutions = computeResolutions({
			canRecover: artifact.status !== "no_data" && artifact.detectionComplete,
			detectedSignals: artifact.detectedSignals,
			now: new Date(stage.asOf),
			openInsights: [...open.values()],
			retiredSignalKey,
		});
		for (const resolution of resolutions) {
			open.delete(resolution.id);
		}
		const lifecycle = inferLifecycle({
			artifact,
			hadOpenInsight:
				Boolean(prior) ||
				(artifact.status === "deferred" &&
					artifact.detectedSignals.length > 0 &&
					open.size > 0),
			recovered: resolutions.some((item) => item.reason === "recovered"),
			wasWorse: recurrence?.isEscalation ?? false,
		});
		const opened = openInsightFromArtifact(
			signalKey ?? `${timeline.id}:${stage.id}`,
			artifact,
			stage.asOf
		);
		if (opened && signalKey) {
			open.set(signalKey, prior ?? opened);
		}
		if (artifact.decision && artifact.signal) {
			observations.set(artifact.signal.signalKey, {
				asOf: new Date(artifact.asOf),
				decision: artifact.decision,
				evidence: artifact.evidence,
				recheckAt: nextRecheckAt(
					new Date(artifact.asOf),
					artifact.decision.disposition,
					artifact.signal
				),
				signal: artifact.signal,
			});
		}

		const output = artifact.insight;
		const visibleWords = output ? visibleInsightWordCount(output) : 0;
		if (visibleWords > MAXIMUM_VISIBLE_WORDS) {
			failures.push(
				`visible output has ${visibleWords} words; maximum is ${MAXIMUM_VISIBLE_WORDS}`
			);
		}
		failures.push(...artifactQualityFailures(artifact, output));
		for (const value of [
			stage.expect.artifact === undefined
				? null
				: structuredMismatch(
						"artifact",
						stage.expect.artifact,
						normalizedArtifact(artifact)
					),
			stage.expect.status === undefined
				? null
				: mismatch("status", stage.expect.status, artifact.status),
			mismatch(
				"disposition",
				stage.expect.disposition ?? null,
				artifact.decision?.disposition ?? null
			),
			mismatch("title", stage.expect.title ?? null, output?.title ?? null),
			mismatch("lifecycle", stage.expect.lifecycle, lifecycle),
		]) {
			if (value) {
				failures.push(value);
			}
		}

		stages.push({
			artifact,
			asOf: stage.asOf,
			error: null,
			failures,
			id: stage.id,
			lifecycle,
		});
	}

	return { id: timeline.id, name: timeline.name, stages };
}

export async function runInsightHistory(
	timelines: InsightTimeline[] = insightTimelines,
	investigate: Investigate = investigateWebsiteWithSources
): Promise<InsightHistoryResult> {
	validateTimelines(timelines);
	const first: InsightHistoryTimelineResult[] = [];
	const second: InsightHistoryTimelineResult[] = [];
	for (const timeline of timelines) {
		first.push(await runTimeline(timeline, investigate));
		second.push(await runTimeline(timeline, investigate));
	}
	if (JSON.stringify(first) !== JSON.stringify(second)) {
		first[0]?.stages[0]?.failures.push(
			"deterministic replay produced different semantic output"
		);
	}
	const allStages = first.flatMap((timeline) => timeline.stages);
	const failures = allStages.reduce(
		(total, stage) => total + stage.failures.length,
		0
	);
	return {
		aggregate: {
			actions: allStages.filter(
				(stage) => stage.artifact?.decision?.disposition === "action_ready"
			).length,
			timelines: first.length,
			stages: allStages.length,
			insights: allStages.filter((stage) => stage.artifact?.insight).length,
			failures,
			contexts: allStages.filter(
				(stage) => stage.artifact?.decision?.disposition === "needs_context"
			).length,
			maxVisibleWords: Math.max(
				0,
				...allStages.map((stage) =>
					stage.artifact?.insight
						? visibleInsightWordCount(stage.artifact.insight)
						: 0
				)
			),
			monitors: allStages.filter(
				(stage) => stage.artifact?.decision?.disposition === "monitor"
			).length,
		},
		passed: failures === 0,
		timelines: first,
	};
}

export function formatInsightHistory(result: InsightHistoryResult): string {
	const lines = [
		`Insight state-model history: ${result.passed ? "PASS" : "FAIL"}`,
		`${result.aggregate.timelines} timelines · ${result.aggregate.stages} stages · ${result.aggregate.insights} insights · ${result.aggregate.failures} failures`,
		`${result.aggregate.actions} actions · ${result.aggregate.contexts} context requests · ${result.aggregate.monitors} monitors`,
		`Longest insight ${result.aggregate.maxVisibleWords}/${MAXIMUM_VISIBLE_WORDS} words · every timeline replayed twice`,
	];
	for (const timeline of result.timelines) {
		lines.push("", `## ${timeline.name}`);
		for (const stage of timeline.stages) {
			const disposition = stage.artifact?.decision?.disposition ?? "none";
			const status = stage.artifact?.status ?? "error";
			const output = stage.artifact?.insight;
			lines.push(
				"",
				`### ${stage.asOf} · ${stage.lifecycle} · ${status} · ${disposition}`
			);
			if (stage.error) {
				lines.push(`Error: ${stage.error}`);
			}
			if (output) {
				lines.push(
					`Title: ${output.title}`,
					`Why it matters: ${output.description}`
				);
				if (output.impactSummary) {
					lines.push(`Impact: ${output.impactSummary}`);
				}
				if (output.rootCause) {
					lines.push(`Root cause: ${output.rootCause}`);
				}
				for (const evidence of output.evidence ?? []) {
					lines.push(`Evidence: ${evidence.description}`);
				}
				lines.push(`Next: ${output.suggestion}`);
				for (const metric of output.metrics) {
					lines.push(
						`Metric: ${metric.label} ${metric.previous ?? "n/a"} → ${metric.current} (${metric.format})`
					);
				}
				lines.push(
					`Length: ${visibleInsightWordCount(output)}/${MAXIMUM_VISIBLE_WORDS} words`
				);
			}
			for (const failure of stage.failures) {
				lines.push(`FAIL: ${failure}`);
			}
		}
	}
	return `${lines.join("\n")}\n`;
}

if (import.meta.main) {
	try {
		const result = await runInsightHistory();
		process.stdout.write(formatInsightHistory(result));
		process.exitCode = result.passed ? 0 : 1;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		process.stderr.write(`Insight history evaluation failed: ${message}\n`);
		process.exitCode = 1;
	}
}
