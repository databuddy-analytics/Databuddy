import {
	generatedInsightSchema,
	investigationEvidenceSchema,
	investigationSignalSchema,
	investigationSubmissionSchema,
	type GeneratedInsight,
	type InsightEvidence,
	type InsightMetric,
	type InsightSource,
	type InvestigationEvidence,
	type InvestigationResult,
	type InvestigationSignal,
	type InvestigationSubmission,
} from "@databuddy/shared/insights";

export interface InvestigationValidationResult {
	errors: string[];
	insights: GeneratedInsight[];
	submission: InvestigationSubmission | null;
}

export interface ValidateInvestigationInput {
	evidence: InvestigationEvidence[];
	signals: InvestigationSignal[];
	submission: unknown;
}

const NUMBER_TOKEN = /[+-]?\$?\d[\d,]*(?:\.\d+)?(?:%|ms|s)?/g;
const DURATION_SUFFIX = /(?:ms|s)$/;
const WORD_SPLIT = /[^a-z]+/;
const UP_WORDS = new Set([
	"up",
	"rise",
	"rises",
	"rose",
	"rising",
	"increase",
	"increased",
	"grew",
	"growth",
]);
const DOWN_WORDS = new Set([
	"down",
	"fall",
	"falls",
	"fell",
	"falling",
	"drop",
	"dropped",
	"decline",
	"declined",
	"decrease",
	"decreased",
]);

type NumberUnit =
	| "currency"
	| "duration_ms"
	| "duration_s"
	| "number"
	| "percent";

interface TypedNumber {
	raw: string;
	unit: NumberUnit;
	value: number;
}

function numbersIn(text: string): TypedNumber[] {
	return [...text.matchAll(NUMBER_TOKEN)].flatMap((match) => {
		const raw = match[0];
		const value = Number(
			raw
				.replaceAll(",", "")
				.replaceAll("$", "")
				.replaceAll("%", "")
				.replace(DURATION_SUFFIX, "")
		);
		if (!Number.isFinite(value)) {
			return [];
		}
		const unit: NumberUnit = raw.includes("$")
			? "currency"
			: raw.endsWith("%")
				? "percent"
				: raw.endsWith("ms")
					? "duration_ms"
					: raw.endsWith("s")
						? "duration_s"
						: "number";
		return [{ raw, unit, value }];
	});
}

function metricUnit(format: InsightMetric["format"]): NumberUnit {
	return format === "percent" ||
		format === "duration_ms" ||
		format === "duration_s"
		? format
		: "number";
}

function metricNumbers(metric: InsightMetric): TypedNumber[] {
	const unit = metricUnit(metric.format);
	return [metric.current, metric.previous].flatMap((value) =>
		value === undefined ? [] : [{ raw: String(value), unit, value }]
	);
}

function unsupportedNumbers(
	result: InvestigationResult,
	signal: InvestigationSignal,
	evidence: InvestigationEvidence[]
): string[] {
	const allowed = [
		...metricNumbers(signal.metric),
		...(signal.metric.key === "revenue"
			? metricNumbers(signal.metric).map((claim) => ({
					...claim,
					unit: "currency" as const,
				}))
			: []),
		...(signal.changePercent === null
			? []
			: [
					{
						raw: String(signal.changePercent),
						unit: "percent" as const,
						value: signal.changePercent,
					},
				]),
		...evidence.flatMap((item) => [
			{
				raw: String(item.rowCount),
				unit: "number" as const,
				value: item.rowCount,
			},
			...numbersIn(evidenceDescription(item)),
			...(item.status === "ok" || item.status === "truncated"
				? (item.metrics ?? []).flatMap(metricNumbers)
				: []),
		]),
	].flatMap((claim) => [claim, { ...claim, value: Math.abs(claim.value) }]);
	const scheduleNumber = (days: number): TypedNumber => ({
		raw: String(days),
		unit: "number",
		value: days,
	});
	const claims: { allowed?: TypedNumber[]; text: string }[] = [
		{ text: result.summary },
		...(result.disposition === "action_ready"
			? [
					{ text: result.title },
					{ text: result.action },
					{ text: result.rootCause ?? "" },
					{ text: result.impactSummary ?? "" },
					{
						text: result.verification.successCondition,
						allowed: [scheduleNumber(result.verification.checkAfterDays)],
					},
				]
			: result.disposition === "monitor"
				? [
						{
							text: result.escalationCondition,
							allowed: [scheduleNumber(result.checkAfterDays)],
						},
					]
				: result.disposition === "needs_context"
					? [{ text: result.missingContext }]
					: []),
	];
	return claims.flatMap((statement) =>
		numbersIn(statement.text)
			.filter(
				(claim) =>
					![...allowed, ...(statement.allowed ?? [])].some(
						(value) =>
							value.unit === claim.unit &&
							Math.abs(value.value - claim.value) <=
								Math.max(0.01, Math.abs(value.value) * 0.0001)
					)
			)
			.map((claim) => claim.raw)
	);
}

function contradictsSignalDirection(
	result: InvestigationResult,
	signal: InvestigationSignal
): boolean {
	const statements = [
		result.summary,
		...(result.disposition === "action_ready" ? [result.title] : []),
	];
	return statements.some((text) => {
		const words = text.toLowerCase().split(WORD_SPLIT).filter(Boolean);
		const saysUp = words.some((word) => UP_WORDS.has(word));
		const saysDown = words.some((word) => DOWN_WORDS.has(word));
		return (
			saysUp !== saysDown && (signal.direction === "up" ? saysDown : saysUp)
		);
	});
}

function evidenceDescription(evidence: InvestigationEvidence): string {
	if (evidence.status === "failed") {
		return `${evidence.queryType} failed: ${evidence.error}`;
	}
	return evidence.status === "truncated"
		? `${evidence.summary} Truncated: ${evidence.truncationReason}`
		: evidence.summary;
}

function storedEvidenceType(
	kind: InvestigationEvidence["kind"]
): InsightEvidence["type"] {
	if (kind === "breakdown") {
		return "segment";
	}
	if (kind === "data_health") {
		return "error";
	}
	if (kind === "related_change") {
		return "temporal";
	}
	return "metric";
}

function generatedSource(
	source: InvestigationEvidence["source"]
): InsightSource {
	return source === "sql" ? "web" : source;
}

function defaultSource(signal: InvestigationSignal): InsightSource {
	if (signal.entity.type === "error" || signal.entity.type === "vital") {
		return "ops";
	}
	if (
		signal.entity.type === "event" ||
		signal.entity.type === "funnel" ||
		signal.entity.type === "goal"
	) {
		return "product";
	}
	return "web";
}

function evidenceExplainsSignal(
	signal: InvestigationSignal,
	evidence: InvestigationEvidence
): boolean {
	if (evidence.status !== "ok") {
		return false;
	}
	if (signal.entity.type === "goal") {
		return (
			evidence.kind === "definition" &&
			evidence.queryType === "goals_summary" &&
			evidence.entity?.type === "goal" &&
			evidence.entity.id === signal.entity.id
		);
	}
	if (signal.entity.type === "funnel") {
		return (
			evidence.kind === "definition" &&
			evidence.queryType === "funnels_summary" &&
			evidence.entity?.type === "funnel" &&
			evidence.entity.id === signal.entity.id
		);
	}
	if (signal.entity.type === "event") {
		return (
			evidence.kind === "definition" &&
			evidence.queryType === "custom_events_summary" &&
			evidence.entity?.type === "event" &&
			evidence.entity.id === signal.entity.id
		);
	}
	if (signal.entity.type === "error") {
		return (
			evidence.kind === "data_health" && evidence.queryType.includes("error")
		);
	}
	if (signal.entity.type === "vital") {
		return (
			evidence.kind === "data_health" && evidence.queryType.includes("vital")
		);
	}
	return false;
}

function evidenceExplainsNoAction(
	signal: InvestigationSignal,
	evidence: InvestigationEvidence
): boolean {
	return (
		(evidence.status === "ok" && evidence.kind === "related_change") ||
		evidenceExplainsSignal(signal, evidence) ||
		(signal.metric.key === "revenue" &&
			evidence.status === "ok" &&
			evidence.kind === "impact")
	);
}

function citedEvidence(
	result: InvestigationResult,
	evidenceById: Map<string, InvestigationEvidence>
): InvestigationEvidence[] {
	return result.evidenceIds.flatMap((id) => {
		const evidence = evidenceById.get(id);
		return evidence ? [evidence] : [];
	});
}

function toGeneratedInsight(
	signal: InvestigationSignal,
	result: InvestigationResult,
	evidence: InvestigationEvidence[]
): GeneratedInsight | null {
	if (
		result.disposition === "monitor" ||
		result.disposition === "not_a_problem"
	) {
		return null;
	}

	const supportingMetrics = evidence.flatMap((item) =>
		item.status === "ok" ? (item.metrics ?? []) : []
	);
	const metrics: InsightMetric[] = [
		{
			label: signal.metric.label,
			current: signal.metric.current,
			previous: signal.metric.previous,
			format: signal.metric.format,
		},
	];
	const seenLabels = new Set([signal.metric.label]);
	for (const metric of supportingMetrics) {
		if (metrics.length >= 5 || seenLabels.has(metric.label)) {
			continue;
		}
		seenLabels.add(metric.label);
		metrics.push(metric);
	}

	const sources = [
		...new Set(
			evidence.length > 0
				? evidence.map((item) => generatedSource(item.source))
				: [defaultSource(signal)]
		),
	];
	const storedEvidence: InsightEvidence[] = evidence.map((item) => ({
		type: storedEvidenceType(item.kind),
		description: evidenceDescription(item),
	}));

	if (result.disposition === "action_ready") {
		storedEvidence.push({
			type: "temporal",
			description: `Verify in ${result.verification.checkAfterDays} day${result.verification.checkAfterDays === 1 ? "" : "s"}: ${result.verification.successCondition}`,
		});
	}

	const insight: GeneratedInsight = {
		title:
			result.disposition === "action_ready"
				? result.title
				: `${signal.entity.label} needs context`.slice(0, 80),
		description: result.summary,
		suggestion:
			result.disposition === "action_ready" ? result.action : result.question,
		metrics,
		severity: signal.severity,
		sentiment: signal.sentiment,
		priority:
			result.disposition === "action_ready"
				? signal.priority
				: Math.min(signal.priority, 6),
		changePercent: signal.changePercent ?? undefined,
		type: signal.insightType,
		subjectKey: signal.signalKey,
		sources,
		confidence: result.confidence,
		evidence: storedEvidence.slice(0, 5),
		...(result.disposition === "action_ready" && result.impactSummary
			? { impactSummary: result.impactSummary }
			: {}),
		...(result.disposition === "action_ready" && result.rootCause
			? { rootCause: result.rootCause }
			: {}),
	};

	return generatedInsightSchema.parse(insight);
}

function formatSchemaErrors(
	prefix: string,
	issues: { message: string; path: PropertyKey[] }[]
): string[] {
	return issues.map(
		(issue) =>
			`${prefix}${issue.path.length > 0 ? `.${issue.path.join(".")}` : ""}: ${issue.message}`
	);
}

export function validateInvestigationSubmission(
	input: ValidateInvestigationInput
): InvestigationValidationResult {
	const signalParse = investigationSignalSchema
		.array()
		.safeParse(input.signals);
	if (!signalParse.success) {
		return {
			errors: formatSchemaErrors("signals", signalParse.error.issues),
			insights: [],
			submission: null,
		};
	}
	const evidenceParse = investigationEvidenceSchema
		.array()
		.safeParse(input.evidence);
	if (!evidenceParse.success) {
		return {
			errors: formatSchemaErrors("evidence", evidenceParse.error.issues),
			insights: [],
			submission: null,
		};
	}
	const submissionParse = investigationSubmissionSchema.safeParse(
		input.submission
	);
	if (!submissionParse.success) {
		return {
			errors: formatSchemaErrors("submission", submissionParse.error.issues),
			insights: [],
			submission: null,
		};
	}

	const errors: string[] = [];
	const signalsByKey = new Map<string, InvestigationSignal>();
	for (const signal of signalParse.data) {
		if (signalsByKey.has(signal.signalKey)) {
			errors.push(`Duplicate signal key: ${signal.signalKey}`);
			continue;
		}
		signalsByKey.set(signal.signalKey, signal);
	}
	const evidenceById = new Map<string, InvestigationEvidence>();
	for (const evidence of evidenceParse.data) {
		if (evidenceById.has(evidence.evidenceId)) {
			errors.push(`Duplicate evidence ID: ${evidence.evidenceId}`);
			continue;
		}
		if (!signalsByKey.has(evidence.signalKey)) {
			errors.push(
				`Evidence ${evidence.evidenceId} belongs to unknown signal: ${evidence.signalKey}`
			);
		}
		evidenceById.set(evidence.evidenceId, evidence);
	}

	const submittedKeys = new Set(
		submissionParse.data.results.map((result) => result.signalKey)
	);
	for (const signalKey of signalsByKey.keys()) {
		if (!submittedKeys.has(signalKey)) {
			errors.push(`Missing terminal result for signal: ${signalKey}`);
		}
	}
	for (const result of submissionParse.data.results) {
		const signal = signalsByKey.get(result.signalKey);
		if (!signal) {
			errors.push(`Unknown signal: ${result.signalKey}`);
			continue;
		}

		const cited = citedEvidence(result, evidenceById);
		for (const evidenceId of result.evidenceIds) {
			const evidence = evidenceById.get(evidenceId);
			if (!evidence) {
				errors.push(
					`${result.signalKey} cites unknown evidence: ${evidenceId}`
				);
			} else if (evidence.signalKey !== result.signalKey) {
				errors.push(
					`${result.signalKey} cites evidence owned by ${evidence.signalKey}`
				);
			}
		}
		const unsupported = unsupportedNumbers(result, signal, cited);
		if (unsupported.length > 0) {
			errors.push(
				`${result.signalKey} uses unsupported numbers: ${[...new Set(unsupported)].join(", ")}`
			);
		}
		if (contradictsSignalDirection(result, signal)) {
			errors.push(
				`${result.signalKey} describes the opposite metric direction`
			);
		}

		if (result.disposition !== "needs_context") {
			const unusable = cited.filter((evidence) => {
				if (evidence.status === "failed") {
					return true;
				}
				if (evidence.status !== "empty") {
					return false;
				}
				return !(
					result.disposition === "action_ready" &&
					signal.kind === "missing_expected_data" &&
					(evidence.kind === "definition" || evidence.kind === "data_health")
				);
			});
			if (unusable.length > 0) {
				errors.push(
					`${result.signalKey} uses ${unusable.map((evidence) => evidence.status).join("/")} evidence for a conclusion`
				);
			}
		}
		if (result.disposition === "action_ready") {
			const hasDiagnosticEvidence = cited.some(
				(evidence) =>
					evidence.kind !== "trend" &&
					(evidence.status === "ok" ||
						evidence.status === "truncated" ||
						(signal.kind === "missing_expected_data" &&
							evidence.status === "empty" &&
							(evidence.kind === "definition" ||
								evidence.kind === "data_health")))
			);
			if (!hasDiagnosticEvidence) {
				errors.push(
					`${result.signalKey} recommends action without usable diagnostic evidence`
				);
			}
		}
		if (
			result.disposition !== "needs_context" &&
			result.confidence > 0.7 &&
			cited.length > 0 &&
			cited.every((evidence) => evidence.status === "truncated")
		) {
			errors.push(
				`${result.signalKey} claims high confidence from only truncated evidence`
			);
		}
		if (result.disposition === "action_ready" && result.rootCause) {
			const hasCausalEvidence = cited.some((evidence) =>
				evidenceExplainsSignal(signal, evidence)
			);
			if (!hasCausalEvidence) {
				errors.push(
					`${result.signalKey} states a root cause without causal evidence`
				);
			}
		}
		if (result.disposition === "action_ready" && result.impactSummary) {
			const hasImpactEvidence = cited.some(
				(evidence) =>
					evidence.kind === "impact" &&
					(evidence.status === "ok" || evidence.status === "truncated")
			);
			if (!hasImpactEvidence) {
				errors.push(
					`${result.signalKey} states impact without impact evidence`
				);
			}
		}
		if (
			result.disposition === "not_a_problem" &&
			!cited.some((evidence) => evidenceExplainsNoAction(signal, evidence))
		) {
			errors.push(
				`${result.signalKey} dismisses a signal without explanatory evidence`
			);
		}
	}

	if (errors.length > 0) {
		return { errors, insights: [], submission: null };
	}

	const insights = submissionParse.data.results.flatMap((result) => {
		const signal = signalsByKey.get(result.signalKey);
		if (!signal) {
			return [];
		}
		const insight = toGeneratedInsight(
			signal,
			result,
			citedEvidence(result, evidenceById)
		);
		return insight ? [insight] : [];
	});

	return { errors: [], insights, submission: submissionParse.data };
}
