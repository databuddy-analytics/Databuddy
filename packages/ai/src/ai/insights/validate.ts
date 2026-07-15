import { isDeepStrictEqual } from "node:util";
import {
	generatedInsightSchema,
	investigationDecisionSchema,
	investigationEvidenceSchema,
	investigationSignalSchema,
	type ExternalContextGap,
	type GeneratedInsight,
	type InsightEvidence,
	type InsightMetric,
	type InsightRemediationKind,
	type InsightSource,
	type InvestigationDecision,
	type InvestigationEvidence,
	type InvestigationSignal,
} from "@databuddy/shared/insights";
import { z } from "zod";

export interface InvestigationValidationResult {
	decision: InvestigationDecision | null;
	errors: string[];
	insight: GeneratedInsight | null;
}

type UsableInvestigationEvidence = Extract<
	InvestigationEvidence,
	{ status: "ok" | "truncated" }
>;

const validationInputSchema = z
	.object({
		decision: investigationDecisionSchema,
		evidence: investigationEvidenceSchema.array(),
		signal: investigationSignalSchema,
	})
	.strict();

const ACTION_TITLE_PREFIX: Record<InsightRemediationKind, string> = {
	code: "Fix",
	tracking: "Fix tracking for",
	configuration: "Update",
	campaign: "Adjust campaign for",
	operations: "Address",
};

const ERROR_DISPLAY_LABEL_MAX_CHARS = 60;
const ERROR_HELP_SUFFIX_MARKERS = [
	". for more information",
	"; for more information",
	". learn more",
	"; learn more",
	". read the docs",
	"; read the docs",
	". see docs",
	"; see docs",
	". see documentation",
	"; see documentation",
] as const;
const ERROR_TRAILING_HELP_PHRASES = [
	"for more information, visit",
	"for more information visit",
	"see documentation at",
	"see documentation",
	"see docs at",
	"see docs",
	"read the docs at",
	"read the docs",
	"learn more at",
	"learn more",
	"visit",
	"see",
] as const;
const ERROR_URL_PREFIXES = ["https://", "http://", "www."] as const;
const TRAILING_ERROR_HELP_PUNCTUATION = /[\s,;:.([{]+$/u;

function firstMarkerIndex(value: string, markers: readonly string[]): number {
	let first = -1;
	for (const marker of markers) {
		const index = value.indexOf(marker);
		if (index >= 0 && (first === -1 || index < first)) {
			first = index;
		}
	}
	return first;
}

function trimTrailingHelpPhrase(value: string): string {
	const lower = value.toLowerCase();
	for (const phrase of ERROR_TRAILING_HELP_PHRASES) {
		if (lower.endsWith(phrase)) {
			return value
				.slice(0, -phrase.length)
				.replace(TRAILING_ERROR_HELP_PUNCTUATION, "")
				.trim();
		}
	}
	return value;
}

function compactErrorDisplayLabel(value: string): string {
	const normalized = value.replace(/\s+/g, " ").trim();
	const lower = normalized.toLowerCase();
	const helpIndex = firstMarkerIndex(lower, ERROR_HELP_SUFFIX_MARKERS);
	const urlIndex = firstMarkerIndex(lower, ERROR_URL_PREFIXES);
	const boundary = [helpIndex, urlIndex]
		.filter((index) => index >= 0)
		.reduce((first, index) => Math.min(first, index), normalized.length);
	let label = normalized.slice(0, boundary).trim();
	if (urlIndex >= 0 && boundary === urlIndex) {
		label = trimTrailingHelpPhrase(label);
	}
	if (!label) {
		return "Application error";
	}
	if (label.length <= ERROR_DISPLAY_LABEL_MAX_CHARS) {
		return label;
	}
	const prefix = label.slice(0, ERROR_DISPLAY_LABEL_MAX_CHARS - 1).trimEnd();
	const lastSpace = prefix.lastIndexOf(" ");
	const readablePrefix =
		lastSpace >= ERROR_DISPLAY_LABEL_MAX_CHARS / 2
			? prefix.slice(0, lastSpace)
			: prefix;
	return `${readablePrefix}…`;
}

function displayEntityLabel(entity: InvestigationSignal["entity"]): string {
	return entity.type === "error"
		? compactErrorDisplayLabel(entity.label)
		: entity.label;
}

const REPAIR_VERBS = new Set([
	"add",
	"adjust",
	"change",
	"correct",
	"defer",
	"disable",
	"enable",
	"fix",
	"guard",
	"handle",
	"link",
	"pause",
	"reduce",
	"remove",
	"replace",
	"restore",
	"resume",
	"revert",
	"rollback",
	"update",
]);

const QUERY_TYPE_BY_ENTITY = {
	event: "custom_events_summary",
	funnel: "funnels_summary",
	goal: "goals_summary",
} as const;

function formatSchemaErrors(
	prefix: string,
	issues: { message: string; path: PropertyKey[] }[]
): string[] {
	return issues.map(
		(issue) =>
			`${prefix}${issue.path.length > 0 ? `.${issue.path.join(".")}` : ""}: ${issue.message}`
	);
}

function instructionIssue(
	instruction: string,
	target: InvestigationEvidence["entity"]
): string | null {
	const words = instruction.toLowerCase().match(/[a-z0-9]+/g) ?? [];
	if (!(words[0] && REPAIR_VERBS.has(words[0]))) {
		return "action_ready requires an actual repair instruction, not an investigation step.";
	}
	if (!target) {
		return "action_ready requires evidence with an exact repair target.";
	}
	return null;
}

function evidenceDescription(evidence: UsableInvestigationEvidence): string {
	return evidence.status === "truncated"
		? `${evidence.summary} Truncated: ${evidence.truncationReason}`
		: evidence.summary;
}

function needsContextTitle(signal: InvestigationSignal): string {
	if (signal.entity.type === "funnel" || signal.entity.type === "goal") {
		const label = signal.entity.label.toLowerCase().includes("conversion")
			? signal.entity.label
			: `${signal.entity.label} conversion`;
		return signal.metric.current === 0 && (signal.metric.previous ?? 0) > 0
			? `${label} stopped`
			: `${label} ${signal.direction === "down" ? "fell" : "rose"}`;
	}
	if (signal.metric.key === "payment_failure_rate") {
		return `${signal.metric.label} rose to ${compactNumber(signal.metric.current)}%`;
	}
	const derivedChange =
		signal.metric.previous === undefined
			? signal.changePercent
			: signal.metric.previous === 0
				? signal.changePercent
				: ((signal.metric.current - signal.metric.previous) /
						signal.metric.previous) *
					100;
	const change = Number.isFinite(derivedChange)
		? ` ${compactNumber(Math.abs(derivedChange ?? 0))}%`
		: "";
	return `${signal.metric.label} ${signal.direction === "down" ? "fell" : "rose"}${change}`;
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

function isUsableEvidence(
	evidence: InvestigationEvidence
): evidence is UsableInvestigationEvidence {
	return evidence.status === "ok" || evidence.status === "truncated";
}

function isDiagnosticEvidence(evidence: InvestigationEvidence): boolean {
	return evidence.kind !== "trend" && isUsableEvidence(evidence);
}

function isCompletedQueryEvidence(evidence: InvestigationEvidence): boolean {
	return (
		evidence.status !== "failed" &&
		!evidence.queryType.startsWith("detector:") &&
		!evidence.queryType.startsWith("annotations")
	);
}

function explainsExactEntity(
	signal: InvestigationSignal,
	evidence: InvestigationEvidence
): boolean {
	if (!isUsableEvidence(evidence)) {
		return false;
	}
	if (
		signal.entity.type === "event" ||
		signal.entity.type === "funnel" ||
		signal.entity.type === "goal"
	) {
		return (
			evidence.kind === "definition" &&
			evidence.period === "current" &&
			evidence.queryType === QUERY_TYPE_BY_ENTITY[signal.entity.type] &&
			evidence.entity?.type === signal.entity.type &&
			evidence.entity.id === signal.entity.id
		);
	}
	if (signal.entity.type === "error") {
		return (
			evidence.kind === "data_health" &&
			evidence.period === "current" &&
			evidence.queryType === "error_fingerprints" &&
			evidence.entity?.type === "error"
		);
	}
	if (signal.entity.type === "vital") {
		return (
			evidence.kind === "data_health" &&
			evidence.period === "current" &&
			evidence.queryType === "web_vitals_by_page:qualified" &&
			evidence.entity?.type === "page"
		);
	}
	return false;
}

function evidenceMetricValue(
	evidence: InvestigationEvidence,
	label: string
): number | null {
	const value =
		evidence.status === "ok" || evidence.status === "truncated"
			? evidence.metrics?.find((metric) => metric.label === label)?.current
			: undefined;
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function valuesAgree(expected: number, actual: number): boolean {
	return (
		Math.abs(expected - actual) <= Math.max(0.01, Math.abs(expected) * 0.01)
	);
}

function isRevenueMetric(metricKey: string): boolean {
	return metricKey === "revenue" || metricKey === "payment_failure_rate";
}

function queriedRevenueMetric(
	evidence: InvestigationEvidence[],
	period: "current" | "previous",
	metricKey: string
): number | null {
	const item = evidence.find(
		(candidate) =>
			candidate.queryType === "revenue_overview" &&
			candidate.period === period &&
			(candidate.status === "ok" ||
				candidate.status === "truncated" ||
				candidate.status === "empty")
	);
	if (item?.status === "empty") {
		return 0;
	}
	return item
		? evidenceMetricValue(
				item,
				metricKey === "payment_failure_rate"
					? "Payment failure rate"
					: "Queried revenue"
			)
		: null;
}

export function isRelevantInvestigationEvidence(
	signal: InvestigationSignal,
	evidence: InvestigationEvidence
): boolean {
	if (!isCompletedQueryEvidence(evidence)) {
		return false;
	}
	if (
		signal.entity.type === "event" ||
		signal.entity.type === "funnel" ||
		signal.entity.type === "goal"
	) {
		return (
			evidence.queryType === QUERY_TYPE_BY_ENTITY[signal.entity.type] &&
			evidence.entity?.type === signal.entity.type &&
			evidence.entity.id === signal.entity.id
		);
	}
	if (signal.entity.type === "error") {
		return evidence.source === "ops" && evidence.queryType.includes("error");
	}
	if (signal.entity.type === "vital") {
		return evidence.source === "ops" && evidence.queryType.includes("vital");
	}
	if (signal.entity.type === "uptime_monitor") {
		return evidence.source === "ops" && evidence.queryType.includes("uptime");
	}
	if (isRevenueMetric(signal.metric.key)) {
		return (
			evidence.source === "business" && evidence.queryType.startsWith("revenue")
		);
	}
	if (signal.entity.type === "campaign") {
		return (
			evidence.source === "business" && evidence.queryType === "utm_campaigns"
		);
	}
	return (
		(signal.entity.type === "website" ||
			signal.entity.type === "page" ||
			signal.entity.type === "channel") &&
		evidence.kind === "breakdown" &&
		(evidence.source === "web" || evidence.source === "business")
	);
}

export function canRecommendAction(signal: InvestigationSignal): boolean {
	const confirmation = signal.expectation?.confirmation;
	return (
		signal.sentiment === "negative" &&
		signal.severity !== "info" &&
		signal.kind === "missing_expected_data" &&
		Boolean(signal.expectation) &&
		(signal.entity.type === "funnel" || signal.entity.type === "goal") &&
		confirmation?.definitionId === signal.entity.id &&
		confirmation.definitionType === signal.entity.type &&
		(confirmation.source === "revenue_transactions" ||
			confirmation.source === "server_completions")
	);
}

function remediationAllowed(
	signal: InvestigationSignal,
	kind: InsightRemediationKind
): boolean {
	if (!canRecommendAction(signal)) {
		return false;
	}
	return kind === "tracking";
}

function sameExpectation(
	left: InvestigationEvidence["remediation"],
	right: InvestigationSignal["expectation"]
): boolean {
	return Boolean(left && right && isDeepStrictEqual(left, right));
}

function supportsRemediation(
	signal: InvestigationSignal,
	evidence: InvestigationEvidence,
	kind: InsightRemediationKind
): boolean {
	if (!isDiagnosticEvidence(evidence)) {
		return false;
	}
	return (
		kind === "tracking" &&
		evidence.source === "product" &&
		explainsExactEntity(signal, evidence) &&
		evidence.status === "ok" &&
		sameExpectation(evidence.remediation, signal.expectation)
	);
}

function explainsNoAction(
	signal: InvestigationSignal,
	evidence: InvestigationEvidence
): boolean {
	return (
		evidence.status === "ok" &&
		evidence.kind === "related_change" &&
		evidence.source === "business" &&
		evidence.queryType === "annotations:planned_signal" &&
		evidence.entity?.type === signal.entity.type &&
		evidence.entity.id === signal.entity.id
	);
}

function contextQuestion(
	gap: ExternalContextGap,
	signal: InvestigationSignal
): string {
	if (signal.metric.key === "revenue") {
		return "Was this revenue change expected? If not, reconcile billing events with revenue tracking.";
	}
	if (signal.metric.key === "payment_failure_rate") {
		return "Was this payment failure increase expected? If not, check the failing payment method or checkout path before retrying customers.";
	}
	if (["visitors", "sessions", "pageviews"].includes(signal.metric.key)) {
		return "Was this traffic drop expected? If not, check source traffic against recorded events on the first affected day.";
	}
	if (signal.entity.type === "goal" || signal.entity.type === "funnel") {
		if (signal.expectation) {
			const expectation = signal.expectation;
			return `${expectation.eventName} recorded 0 completions after ${expectation.currentEntrants} entrants, versus ${expectation.previousCompletions} before. Did users complete ${signal.entity.label}? If yes, restore the event; if no, replay ${signal.entity.label} and find the first failed step.`;
		}
		return `Was traffic into ${signal.entity.label} intentionally paused? If not, verify that its entry event is still emitted.`;
	}
	if (gap === "expected_behavior") {
		return `Was ${signal.entity.label} expected to change during this period?`;
	}
	if (gap === "business_priority") {
		return `How important is ${signal.entity.label} to the business?`;
	}
	return `Was there an untracked planned change affecting ${signal.entity.label} during this period?`;
}

function investigationSuggestion(
	signal: InvestigationSignal,
	target: InvestigationEvidence["entity"]
): string {
	const entity = target ?? signal.entity;
	const label = displayEntityLabel(entity);
	if (entity.type === "error") {
		return `No patch target is established yet. Reproduce ${label} and trace its first application frame.`;
	}
	if (target?.type === "page" && signal.entity.type === "vital") {
		return `No causal profile is available yet. Profile ${label} and isolate the slow interaction or blocking resource.`;
	}
	if (signal.entity.type === "goal" || signal.entity.type === "funnel") {
		return `The failing step is not established yet. Replay ${label} in Databuddy DevTools and verify its entry and completion events.`;
	}
	if (signal.entity.type === "event") {
		return signal.metric.current === 0 && (signal.metric.previous ?? 0) > 0
			? `Verify that ${label} still fires at its expected trigger in Databuddy DevTools. If it does, compare the last nonzero day with the first zero day for ingestion or filtering changes.`
			: `Compare ${label} between the last healthy and first affected day by page and device, then verify its expected trigger in Databuddy DevTools.`;
	}
	return `Break down ${label} by its largest affected segment and verify the change in the next complete window.`;
}

function insightDescription(signal: InvestigationSignal): string {
	if (
		signal.metric.key === "error_count" &&
		signal.metric.previous !== undefined
	) {
		if (signal.metric.current === signal.metric.previous) {
			return `${signal.metric.label} held at ${compactNumber(signal.metric.current)}.`;
		}
		const movement =
			signal.metric.current > signal.metric.previous ? "rose" : "fell";
		return `${signal.metric.label} ${movement} from ${compactNumber(signal.metric.previous)} to ${compactNumber(signal.metric.current)}.`;
	}
	const healthyMaximum =
		signal.metric.key === "lcp"
			? 2500
			: signal.metric.key === "inp"
				? 200
				: null;
	if (healthyMaximum !== null && signal.metric.current > healthyMaximum) {
		const movement = signal.direction === "down" ? "improved" : "worsened";
		return `${signal.metric.label} ${movement} to ${signal.metric.current} ms but remains above the ${healthyMaximum} ms healthy threshold.`;
	}
	if (signal.metric.previous !== undefined) {
		if (signal.metric.current === signal.metric.previous) {
			return `${signal.metric.label} held at ${formatMetricValue(signal.metric.current, signal.metric.format)}.`;
		}
		const movement =
			signal.metric.current > signal.metric.previous ? "rose" : "fell";
		return `${signal.metric.label} ${movement} from ${formatMetricValue(signal.metric.previous, signal.metric.format)} to ${formatMetricValue(signal.metric.current, signal.metric.format)}.`;
	}
	return signal.detection.reason;
}

function compactNumber(value: number): string {
	return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
		value
	);
}

function formatMetricValue(
	value: number,
	format: InsightMetric["format"]
): string {
	const number = compactNumber(value);
	if (format === "percent") {
		return `${number}%`;
	}
	if (format === "duration_ms") {
		return `${number} ms`;
	}
	if (format === "duration_s") {
		return `${number} s`;
	}
	return number;
}

function backendConfidence(
	evidence: InvestigationEvidence[],
	decision: InvestigationDecision
): number {
	if (
		decision.disposition === "action_ready" &&
		evidence.some((item) => item.status === "ok" && isDiagnosticEvidence(item))
	) {
		return 0.85;
	}
	if (evidence.some(isDiagnosticEvidence)) {
		return 0.65;
	}
	return 0.5;
}

function calibratedPriority(
	signal: InvestigationSignal,
	evidence: InvestigationEvidence[],
	base: number
): number {
	if (signal.entity.type === "error") {
		const users = Math.max(
			0,
			...evidence.map(
				(item) => evidenceMetricValue(item, "Affected users") ?? 0
			)
		);
		if (users > 0 && users < 10) {
			return Math.min(base, 5);
		}
		if (users < 25) {
			return Math.min(base, 6);
		}
		if (users < 100) {
			return Math.min(base, 7);
		}
	}
	if (signal.entity.type === "vital") {
		const visitors = Math.max(
			0,
			...evidence.map(
				(item) => evidenceMetricValue(item, "Visitors sampled") ?? 0
			)
		);
		if (visitors > 0 && visitors < 25) {
			return Math.min(base, 6);
		}
		if (visitors < 100) {
			return Math.min(base, 7);
		}
	}
	return base;
}

function toGeneratedInsight(
	signal: InvestigationSignal,
	decision: InvestigationDecision,
	evidence: InvestigationEvidence[]
): GeneratedInsight | null {
	const hasExactUnresolvedTarget = evidence.some((item) =>
		explainsExactEntity(signal, item)
	);
	const requiresExactUnresolvedTarget = [
		"error",
		"event",
		"funnel",
		"goal",
		"uptime_monitor",
		"vital",
	].includes(signal.entity.type);
	const unresolvedMonitor =
		decision.disposition === "monitor" &&
		signal.sentiment === "negative" &&
		((signal.severity === "critical" &&
			(!requiresExactUnresolvedTarget || hasExactUnresolvedTarget)) ||
			(signal.severity === "warning" && hasExactUnresolvedTarget));
	if (
		decision.disposition === "not_a_problem" ||
		(decision.disposition === "monitor" && !unresolvedMonitor)
	) {
		return null;
	}

	const usableEvidence = evidence
		.filter(isUsableEvidence)
		.filter((item) => isRelevantInvestigationEvidence(signal, item));
	const metrics: InsightMetric[] = [
		{
			label: signal.metric.label,
			current: signal.metric.current,
			previous: signal.metric.previous,
			format: signal.metric.format,
		},
	];
	const seenLabels = new Set([signal.metric.label]);
	for (const metric of usableEvidence.flatMap((item) => item.metrics ?? [])) {
		const duplicatesPrimaryLabel =
			(signal.metric.key === "revenue" && metric.label === "Queried revenue") ||
			(signal.metric.key === "payment_failure_rate" &&
				metric.label === "Payment failure rate") ||
			(signal.metric.key === "lcp" && metric.label === "p75 LCP") ||
			(signal.metric.key === "inp" && metric.label === "p75 INP");
		const duplicatesPrimaryValue =
			metric.current === signal.metric.current &&
			metric.format === signal.metric.format &&
			(metric.previous === undefined ||
				metric.previous === signal.metric.previous);
		if (
			metrics.length >= 5 ||
			seenLabels.has(metric.label) ||
			duplicatesPrimaryLabel ||
			duplicatesPrimaryValue
		) {
			continue;
		}
		seenLabels.add(metric.label);
		metrics.push(metric);
	}

	const sources = [
		...new Set(
			usableEvidence.length > 0
				? usableEvidence.map((item) => generatedSource(item.source))
				: [defaultSource(signal)]
		),
	];
	const actionReady = decision.disposition === "action_ready";
	const citedEvidence = actionReady
		? usableEvidence.find(
				(item) => item.evidenceId === decision.remediation.evidenceId
			)
		: undefined;
	const investigationEvidence = unresolvedMonitor
		? usableEvidence.find(
				(item) =>
					isDiagnosticEvidence(item) &&
					item.entity &&
					explainsExactEntity(signal, item)
			)
		: undefined;
	const title = actionReady
		? `${ACTION_TITLE_PREFIX[decision.remediation.kind]} ${displayEntityLabel(citedEvidence?.entity ?? signal.entity)}`
		: unresolvedMonitor
			? `Investigate ${displayEntityLabel(investigationEvidence?.entity ?? signal.entity)}`
			: needsContextTitle(signal);
	const impactQueryType =
		signal.entity.type === "error"
			? "errors_summary"
			: signal.entity.type === "goal"
				? "goals_summary"
				: signal.entity.type === "funnel"
					? "funnels_summary"
					: isRevenueMetric(signal.metric.key)
						? "revenue_overview"
						: signal.entity.type === "vital"
							? "web_vitals_by_page:qualified"
							: null;
	const impactEvidence = impactQueryType
		? usableEvidence.find((item) => item.queryType === impactQueryType)
		: undefined;
	const displayEvidence = [
		...(actionReady &&
		citedEvidence &&
		(citedEvidence.queryType !== impactQueryType ||
			citedEvidence.evidenceId === impactEvidence?.evidenceId)
			? [citedEvidence]
			: []),
		...(unresolvedMonitor && investigationEvidence
			? [investigationEvidence]
			: []),
		...(actionReady || unresolvedMonitor
			? []
			: usableEvidence.filter(
					(item) =>
						!item.queryType.startsWith("detector:") &&
						item.queryType !== impactQueryType
				)),
	];
	const insight: GeneratedInsight = {
		title: title.slice(0, 80),
		description: insightDescription(signal),
		suggestion: actionReady
			? decision.remediation.instruction
			: decision.disposition === "needs_context"
				? contextQuestion(decision.gap, signal)
				: investigationSuggestion(signal, investigationEvidence?.entity),
		metrics,
		severity: signal.severity,
		sentiment: signal.sentiment,
		priority: calibratedPriority(
			signal,
			usableEvidence,
			actionReady || unresolvedMonitor
				? signal.priority
				: Math.min(signal.priority, 6)
		),
		changePercent: signal.changePercent ?? undefined,
		type: signal.insightType,
		subjectKey: signal.signalKey,
		sources,
		confidence: backendConfidence(usableEvidence, decision),
		...(impactEvidence &&
		impactEvidence.evidenceId !== citedEvidence?.evidenceId &&
		impactEvidence.evidenceId !== investigationEvidence?.evidenceId
			? { impactSummary: impactEvidence.summary }
			: {}),
		evidence: [
			...displayEvidence.slice(0, 3).map((item) => ({
				type: storedEvidenceType(item.kind),
				description: evidenceDescription(item),
			})),
			...(actionReady
				? [
						{
							type: "metric" as const,
							description: `Verify after 7 complete days that ${signal.metric.label.toLowerCase()} has moved back toward ${signal.metric.previous ?? "its prior level"}.`,
						},
					]
				: []),
		],
		...(actionReady ? { remediationKind: decision.remediation.kind } : {}),
	};

	return generatedInsightSchema.parse(insight);
}

export function validateInvestigationDecision(
	input: unknown
): InvestigationValidationResult {
	const parsed = validationInputSchema.safeParse(input);
	if (!parsed.success) {
		return {
			decision: null,
			errors: formatSchemaErrors("input", parsed.error.issues),
			insight: null,
		};
	}

	const { decision, evidence, signal } = parsed.data;
	const errors: string[] = [];
	const evidenceIds = new Set<string>();
	for (const item of evidence) {
		if (item.signalKey !== signal.signalKey) {
			errors.push(
				`Evidence ${item.evidenceId} belongs to another signal: ${item.signalKey}`
			);
		}
		if (evidenceIds.has(item.evidenceId)) {
			errors.push(`Duplicate evidence ID: ${item.evidenceId}`);
		}
		evidenceIds.add(item.evidenceId);
	}

	const citedRemediationEvidence =
		decision.disposition === "action_ready"
			? evidence.find(
					(item) => item.evidenceId === decision.remediation.evidenceId
				)
			: undefined;
	if (decision.disposition === "action_ready" && citedRemediationEvidence) {
		const issue = instructionIssue(
			decision.remediation.instruction,
			citedRemediationEvidence.entity
		);
		if (issue) {
			errors.push(issue);
		}
		if (
			citedRemediationEvidence.remediation &&
			decision.remediation.instruction !==
				citedRemediationEvidence.remediation.instruction
		) {
			errors.push(
				"action_ready must use the backend-owned remediation instruction exactly."
			);
		}
	}
	if (
		signal.sentiment === "negative" &&
		!evidence.some((item) => isRelevantInvestigationEvidence(signal, item))
	) {
		errors.push(
			"Investigate at least one relevant Databuddy query before submitting a terminal decision."
		);
	}
	if (isRevenueMetric(signal.metric.key) && signal.sentiment === "negative") {
		const currentValue = queriedRevenueMetric(
			evidence,
			"current",
			signal.metric.key
		);
		const previousValue = queriedRevenueMetric(
			evidence,
			"previous",
			signal.metric.key
		);
		if (currentValue === null || previousValue === null) {
			errors.push(
				"Revenue and payment decisions require revenue_overview evidence for both detector periods."
			);
		} else if (
			!valuesAgree(signal.metric.current, currentValue) ||
			(signal.metric.previous !== undefined &&
				!valuesAgree(signal.metric.previous, previousValue))
		) {
			errors.push(
				signal.metric.key === "revenue"
					? "Revenue query totals conflict with the detector. Retry the query instead of producing customer advice."
					: "Payment failure rate conflicts with the revenue query. Retry the query instead of producing customer advice."
			);
		}
	}
	if (
		isRevenueMetric(signal.metric.key) &&
		signal.sentiment === "negative" &&
		signal.severity === "critical" &&
		decision.disposition === "monitor"
	) {
		errors.push(
			"A critical revenue regression cannot be silently monitored. Ask whether the change was expected or planned."
		);
	}
	if (
		["visitors", "sessions", "pageviews"].includes(signal.metric.key) &&
		signal.sentiment === "negative" &&
		signal.severity === "critical" &&
		decision.disposition === "monitor"
	) {
		errors.push(
			"A critical traffic regression cannot be silently monitored. Ask whether acquisition, tracking, or a deployment intentionally changed."
		);
	}
	if (
		isRevenueMetric(signal.metric.key) &&
		decision.disposition === "needs_context" &&
		decision.gap === "business_priority"
	) {
		errors.push(
			"Revenue is treated as business-critical. Ask about expected behavior or a planned external change, not its priority."
		);
	}
	if (
		decision.disposition === "action_ready" &&
		!evidence.some(isDiagnosticEvidence)
	) {
		errors.push(
			`${signal.signalKey} recommends action without usable diagnostic evidence`
		);
	}
	if (
		decision.disposition === "action_ready" &&
		!remediationAllowed(signal, decision.remediation.kind)
	) {
		errors.push(
			canRecommendAction(signal)
				? `${decision.remediation.kind} remediation does not match this ${signal.entity.type} signal.`
				: "action_ready is not allowed for this signal. Submit monitor unless external context or explanatory evidence supports another outcome."
		);
	}
	if (
		decision.disposition === "action_ready" &&
		remediationAllowed(signal, decision.remediation.kind) &&
		!citedRemediationEvidence
	) {
		errors.push(
			`${signal.signalKey} cites unknown remediation evidence: ${decision.remediation.evidenceId}`
		);
	} else if (
		decision.disposition === "action_ready" &&
		remediationAllowed(signal, decision.remediation.kind) &&
		citedRemediationEvidence &&
		!supportsRemediation(
			signal,
			citedRemediationEvidence,
			decision.remediation.kind
		)
	) {
		errors.push(
			`${signal.signalKey} cites evidence that does not support ${decision.remediation.kind} remediation`
		);
	}
	if (evidence.some((item) => item.status === "failed")) {
		errors.push(
			"A failed Databuddy query must be retried, not turned into a terminal decision."
		);
	}
	if (
		decision.disposition === "not_a_problem" &&
		!evidence.some((item) => explainsNoAction(signal, item))
	) {
		errors.push(
			"not_a_problem requires a planned/benign change or exact diagnostic explanation. Otherwise submit monitor."
		);
	}
	if (errors.length > 0) {
		return { decision: null, errors, insight: null };
	}

	return {
		decision,
		errors: [],
		insight: toGeneratedInsight(signal, decision, evidence),
	};
}
