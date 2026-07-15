import { createHash } from "node:crypto";
import type {
	InvestigationExpectation,
	InvestigationEvidence,
	InvestigationSignal,
	InsightMetric,
} from "@databuddy/shared/insights";
import type { AppContext } from "../config/context";
import { z } from "zod";
import {
	fetchOpsMetrics,
	OPS_INSIGHT_QUERY_TYPES,
	type OpsInsightQuery,
} from "./ops-context";
import {
	fetchProductMetrics,
	type ProductInsightTarget,
	type ProductMetricsFetcher,
} from "./product-context";
import { executeQuery } from "../../query";
import type { QueryRequest } from "../../query/types";

const MAX_EVIDENCE_SUMMARY_CHARS = 500;
const MAX_QUERIES = 3;

type QueryEvidenceSource = "business" | "ops" | "product" | "web";

type QueryEvidencePeriod = "current" | "previous";

interface QueryEvidence {
	data: unknown;
	entity?: InvestigationSignal["entity"];
	error?: string;
	period: QueryEvidencePeriod;
	query: unknown;
	queryType: string;
	range: { from: string; to: string };
	remediation?: InvestigationExpectation;
	rowCount: number;
	source: QueryEvidenceSource;
	status: "empty" | "failed" | "ok";
}

interface OwnedQueryEvidence extends QueryEvidence {
	evidenceId: string;
	signalKey: string;
}

function uniqueQueries<T extends { type: string }>(queries: T[]): T[] {
	const seen = new Set<string>();
	return queries.filter((query) => {
		if (seen.has(query.type)) {
			return false;
		}
		seen.add(query.type);
		return true;
	});
}

type EvidenceRow = Record<string, unknown>;

function rethrowAbort(error: unknown, abortSignal?: AbortSignal): void {
	if (abortSignal?.aborted) {
		throw abortSignal.reason ?? error;
	}
	if (error instanceof Error && error.name === "AbortError") {
		throw error;
	}
}

async function readWithRetry<T>(
	read: () => Promise<T>,
	abortSignal?: AbortSignal
): Promise<T> {
	abortSignal?.throwIfAborted();
	try {
		return await read();
	} catch (error) {
		rethrowAbort(error, abortSignal);
		abortSignal?.throwIfAborted();
		return await read();
	}
}

function evidenceKind(queryType: string): InvestigationEvidence["kind"] {
	if (queryType.startsWith("revenue")) {
		return "impact";
	}
	if (
		["goals_summary", "funnels_summary", "custom_events_summary"].includes(
			queryType
		)
	) {
		return "definition";
	}
	if (
		queryType.includes("error") ||
		queryType.includes("uptime") ||
		queryType.includes("vital")
	) {
		return "data_health";
	}
	if (queryType.includes("anomaly") || queryType.includes("flag")) {
		return "related_change";
	}
	if (queryType === "summary_metrics" || queryType.includes("trend")) {
		return "trend";
	}
	return "breakdown";
}

function sourceForWebQuery(queryType: string): QueryEvidenceSource {
	if (queryType.startsWith("revenue") || queryType.startsWith("utm_")) {
		return "business";
	}
	if (
		queryType.includes("error") ||
		queryType.includes("uptime") ||
		queryType.includes("vital")
	) {
		return "ops";
	}
	return "web";
}

function evidenceSummary(
	evidence: QueryEvidence,
	signal: InvestigationSignal
): {
	summary: string;
	truncated: boolean;
} {
	if (evidence.status === "empty") {
		return {
			summary: `${evidence.queryType} returned no rows.`,
			truncated: false,
		};
	}
	const summary = summarizeEvidenceData(evidence, signal);
	return summary.length <= MAX_EVIDENCE_SUMMARY_CHARS
		? { summary, truncated: false }
		: {
				summary: `${summary.slice(0, MAX_EVIDENCE_SUMMARY_CHARS - 1).trimEnd()}…`,
				truncated: true,
			};
}

function toInvestigationEvidence(
	evidence: OwnedQueryEvidence,
	signal: InvestigationSignal
): InvestigationEvidence {
	const base = {
		evidenceId: evidence.evidenceId,
		signalKey: evidence.signalKey,
		kind: evidenceKind(evidence.queryType),
		source: evidence.source,
		queryType: evidence.queryType,
		...(evidence.entity ? { entity: evidence.entity } : {}),
		...(evidence.remediation ? { remediation: evidence.remediation } : {}),
		period: evidence.period,
		range: evidence.range,
		rowCount: evidence.rowCount,
	};
	if (evidence.status === "failed") {
		return {
			...base,
			status: "failed",
			rowCount: 0,
			error: evidence.error ?? "Query failed",
		};
	}
	const summary = evidenceSummary(evidence, signal);
	const metrics = evidenceMetrics(evidence, signal);
	if (summary.truncated) {
		return {
			...base,
			status: "truncated",
			summary: summary.summary,
			...(metrics.length > 0 ? { metrics } : {}),
			truncationReason: "The evidence summary exceeded the output limit.",
		};
	}
	if (evidence.status === "empty") {
		return {
			...base,
			status: "empty",
			rowCount: 0,
			summary: summary.summary,
		};
	}
	return {
		...base,
		status: "ok",
		summary: summary.summary,
		...(metrics.length > 0 ? { metrics } : {}),
	};
}

function canonicalJson(value: unknown): string {
	if (Array.isArray(value)) {
		return `[${value.map(canonicalJson).join(",")}]`;
	}
	if (value && typeof value === "object") {
		return `{${Object.entries(value)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value) ?? "null";
}

function evidenceRows(
	data: unknown,
	preferredKeys: string[] = []
): EvidenceRow[] {
	if (Array.isArray(data)) {
		return data.filter((value): value is EvidenceRow =>
			Boolean(value && typeof value === "object")
		);
	}
	if (!(data && typeof data === "object")) {
		return [];
	}
	const record = data as EvidenceRow;
	for (const key of preferredKeys) {
		const rows = record[key];
		if (Array.isArray(rows)) {
			return rows.filter((value): value is EvidenceRow =>
				Boolean(value && typeof value === "object")
			);
		}
	}
	for (const value of Object.values(record)) {
		if (Array.isArray(value)) {
			return value.filter((row): row is EvidenceRow =>
				Boolean(row && typeof row === "object")
			);
		}
	}
	return [record];
}

function finiteNumber(
	row: EvidenceRow | undefined,
	...keys: string[]
): number | null {
	for (const key of keys) {
		const value = Number(row?.[key]);
		if (Number.isFinite(value)) {
			return value;
		}
	}
	return null;
}

function textValue(
	row: EvidenceRow | undefined,
	...keys: string[]
): string | null {
	for (const key of keys) {
		const value = row?.[key];
		if (typeof value === "string") {
			const normalized = value.trim();
			if (
				normalized &&
				normalized.toLowerCase() !== "null" &&
				normalized.toLowerCase() !== "undefined"
			) {
				return normalized;
			}
		}
	}
	return null;
}

function compactNumber(value: number): string {
	return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
		value
	);
}

function isRevenueMetric(metricKey: string): boolean {
	return metricKey === "revenue" || metricKey === "payment_failure_rate";
}

function revenueMetricMatchesDetector(
	data: unknown,
	metricKey: string,
	expected: number
): boolean {
	const row = evidenceRows(data)[0];
	const actual =
		metricKey === "payment_failure_rate"
			? finiteNumber(row, "payment_failure_rate")
			: finiteNumber(row, "total_revenue", "revenue");
	return (
		actual !== null &&
		Math.abs(actual - expected) <= Math.max(0.01, Math.abs(expected) * 0.01)
	);
}

function shortText(value: string, max = 110): string {
	const singleLine = value.replace(/\s+/g, " ").trim();
	return singleLine.length <= max
		? singleLine
		: `${singleLine.slice(0, max - 1).trimEnd()}…`;
}

function countPhrase(value: number | null, singular: string): string | null {
	if (value === null) {
		return null;
	}
	return `${compactNumber(value)} ${singular}${value === 1 ? "" : "s"}`;
}

function summarizeErrorOverview(rows: EvidenceRow[]): string | null {
	const row = rows[0];
	if (!row) {
		return null;
	}
	const parts = [
		countPhrase(finiteNumber(row, "totalErrors", "total_errors"), "error"),
		countPhrase(finiteNumber(row, "affectedUsers", "affected_users"), "user"),
		countPhrase(
			finiteNumber(row, "affectedSessions", "affected_sessions"),
			"session"
		),
	].filter((part): part is string => Boolean(part));
	const rate = finiteNumber(row, "errorRate", "error_rate");
	if (parts.length === 0) {
		return null;
	}
	return `${parts[0]} affected ${parts.slice(1).join(" across ")}${rate === null ? "" : ` (${compactNumber(rate)}% session error rate)`}.`;
}

function summarizeErrorFingerprints(rows: EvidenceRow[]): string | null {
	const summaries = rows.slice(0, 1).flatMap((row) => {
		const message = textValue(row, "message", "name");
		if (!message) {
			return [];
		}
		const details = [
			countPhrase(finiteNumber(row, "count", "errors"), "error"),
			countPhrase(finiteNumber(row, "users", "affected_users"), "user"),
			countPhrase(
				finiteNumber(row, "sessions", "affected_sessions"),
				"session"
			),
		]
			.filter((part): part is string => Boolean(part))
			.join(", ");
		const path = textValue(row, "path", "representative_path");
		const location = textValue(row, "filename");
		const line = finiteNumber(row, "lineno", "line");
		const target = location
			? `${shortText(location, 60)}${line === null ? "" : `:${line}`}`
			: path;
		return [
			`“${shortText(message)}”${details ? ` — ${details}` : ""}${target ? `; seen at ${shortText(target, 70)}` : ""}`,
		];
	});
	return summaries.length > 0 ? `${summaries.join(". ")}.` : null;
}

function summarizePages(rows: EvidenceRow[]): string | null {
	const summaries = rows.slice(0, 3).flatMap((row) => {
		const name = textValue(row, "name", "path");
		if (!name) {
			return [];
		}
		const errors = finiteNumber(row, "errors", "count");
		const users = finiteNumber(row, "users", "affected_users");
		const detail = [countPhrase(errors, "error"), countPhrase(users, "user")]
			.filter((part): part is string => Boolean(part))
			.join(", ");
		return [`${shortText(name, 80)}${detail ? ` — ${detail}` : ""}`];
	});
	return summaries.length > 0
		? `Most affected pages: ${summaries.join("; ")}.`
		: null;
}

function summarizeRevenue(
	rows: EvidenceRow[],
	metricKey: string
): string | null {
	const row = rows[0];
	if (!row) {
		return null;
	}
	const currency = textValue(row, "currency");
	const currencyLabel = currency ? `${currency} ` : "";
	if (metricKey === "payment_failure_rate") {
		const failureRate = finiteNumber(row, "payment_failure_rate");
		const failed = finiteNumber(row, "failed_payment_attempts");
		const successful = finiteNumber(row, "successful_payment_attempts");
		const recovered = finiteNumber(row, "recovered_payment_attempts");
		const observedTypes = finiteNumber(row, "observed_failure_event_types");
		const topReason = textValue(row, "top_payment_failure_reason")?.replaceAll(
			"_",
			" "
		);
		if (failureRate === null && failed === null && successful === null) {
			return null;
		}
		const cause = topReason ? ` Most common failure: ${topReason}.` : "";
		const observations =
			observedTypes === null
				? ""
				: observedTypes === 0
					? " No recognized Stripe failure event types were observed in this range."
					: ` ${compactNumber(observedTypes)} distinct Stripe failure event ${observedTypes === 1 ? "type was" : "types were"} observed in this range.`;
		return `Tracked ${currencyLabel}payment failure rate was ${compactNumber(failureRate ?? 0)}%: ${compactNumber(failed ?? 0)} failed and ${compactNumber(successful ?? 0)} successful attempts${recovered === null ? "" : `, with ${compactNumber(recovered)} later recovered`}.${cause}${observations}`;
	}
	const revenue = finiteNumber(row, "total_revenue", "revenue");
	const transactions = finiteNumber(row, "total_transactions", "transactions");
	const customers = finiteNumber(row, "unique_customers", "customers");
	if (revenue === null && transactions === null && customers === null) {
		return null;
	}
	return `Tracked ${currencyLabel}revenue was ${compactNumber(revenue ?? 0)} from ${compactNumber(transactions ?? 0)} transactions across ${compactNumber(customers ?? 0)} customers.`;
}

function summarizeProduct(
	rows: EvidenceRow[],
	label: string,
	expectation?: InvestigationExpectation
): string | null {
	const row = rows[0];
	if (!row) {
		return null;
	}
	const name = textValue(row, "name") ?? label;
	const entrants = finiteNumber(row, "total_users_entered");
	const completions = finiteNumber(row, "total_users_completed");
	const rate = finiteNumber(row, "overall_conversion_rate");
	if (entrants === null && completions === null && rate === null) {
		return null;
	}
	const activity = `${shortText(name, 90)} had ${compactNumber(completions ?? 0)} completions from ${compactNumber(entrants ?? 0)} entrants${rate === null ? "" : ` (${compactNumber(rate)}% conversion)`}.`;
	return expectation
		? `${activity} The active definition expects the "${shortText(expectation.eventName, 90)}" event${expectation.stepName ? ` at ${shortText(expectation.stepName, 70)}` : ""}.`
		: activity;
}

function vitalField(
	metricKey: string
): { field: string; label: string } | null {
	if (metricKey === "lcp") {
		return { field: "p75_lcp", label: "p75 LCP" };
	}
	if (metricKey === "inp") {
		return { field: "p75_inp", label: "p75 INP" };
	}
	return null;
}

function summarizeVitals(
	rows: EvidenceRow[],
	metricKey: string
): string | null {
	const metric = vitalField(metricKey);
	if (!metric) {
		return null;
	}
	const summaries = rows.slice(0, 2).flatMap((row) => {
		const name = textValue(row, "name");
		const value = finiteNumber(row, metric.field);
		if (!(name && value !== null)) {
			return [];
		}
		const visitors = finiteNumber(row, "visitors");
		const measurements = finiteNumber(row, "measurements");
		return [
			`${shortText(name, 80)} — ${metric.label} ${compactNumber(value)} ms${visitors === null ? "" : ` across ${compactNumber(visitors)} visitors`}${measurements === null ? "" : ` (${compactNumber(measurements)} measurements)`}`,
		];
	});
	return summaries.length > 0
		? `Slowest supported segments: ${summaries.join("; ")}.`
		: null;
}

function summarizeNamedRows(rows: EvidenceRow[]): string | null {
	const summaries = rows.slice(0, 3).flatMap((row) => {
		const name = textValue(row, "name", "path", "label");
		if (!name) {
			return [];
		}
		const numeric = Object.entries(row).find(
			([key, value]) =>
				key !== "name" &&
				key !== "path" &&
				typeof value !== "boolean" &&
				Number.isFinite(Number(value))
		);
		return [
			`${shortText(name, 90)}${numeric ? ` — ${numeric[0].replaceAll("_", " ")} ${compactNumber(Number(numeric[1]))}` : ""}`,
		];
	});
	return summaries.length > 0 ? `Top results: ${summaries.join("; ")}.` : null;
}

function summarizeAggregate(rows: EvidenceRow[]): string | null {
	const row = rows[0];
	if (!row) {
		return null;
	}
	const facts = Object.entries(row)
		.filter(([, value]) => Number.isFinite(Number(value)))
		.slice(0, 4)
		.map(
			([key, value]) =>
				`${key.replaceAll("_", " ")} ${compactNumber(Number(value))}`
		);
	return facts.length > 0 ? `${facts.join("; ")}.` : null;
}

function summarizeEvidenceData(
	evidence: QueryEvidence,
	signal: InvestigationSignal
): string {
	const queryType = evidence.queryType;
	const rows = evidenceRows(evidence.data, [
		"error_summary",
		"error_fingerprints",
		"error_types",
		"errors_by_page",
		"goals",
		"funnels",
		"events",
		"results",
	]);
	let summary: string | null = null;
	if (queryType === "errors_summary" || queryType === "error_summary") {
		summary = summarizeErrorOverview(rows);
	} else if (
		queryType === "error_fingerprints" ||
		queryType === "error_types" ||
		queryType === "recent_errors"
	) {
		summary = summarizeErrorFingerprints(rows);
	} else if (queryType === "errors_by_page") {
		summary = summarizePages(rows);
	} else if (queryType === "revenue_overview") {
		summary = summarizeRevenue(rows, signal.metric.key);
	} else if (queryType === "goals_summary" || queryType === "funnels_summary") {
		summary = summarizeProduct(rows, signal.entity.label, signal.expectation);
	} else if (queryType.startsWith("web_vitals_by_")) {
		summary = summarizeVitals(rows, signal.metric.key);
	}
	summary ??= summarizeNamedRows(rows);
	summary ??= summarizeAggregate(rows);
	return (
		summary ??
		`${queryType} returned ${evidence.rowCount} row${evidence.rowCount === 1 ? "" : "s"} for review.`
	);
}

function metric(
	label: string,
	current: number | null,
	format: "duration_ms" | "number" | "percent" = "number"
) {
	return current === null ? [] : [{ label, current, format }];
}

function evidenceMetrics(
	evidence: QueryEvidence,
	signal: InvestigationSignal
): InsightMetric[] {
	const rows = evidenceRows(evidence.data, [
		"error_summary",
		"error_fingerprints",
		"error_types",
		"errors_by_page",
	]);
	const row = rows[0];
	if (!row) {
		return [];
	}
	if (
		evidence.queryType === "errors_summary" ||
		evidence.queryType === "error_summary"
	) {
		return [
			...metric(
				"Affected users",
				finiteNumber(row, "affectedUsers", "affected_users")
			),
			...metric(
				"Affected sessions",
				finiteNumber(row, "affectedSessions", "affected_sessions")
			),
			...metric(
				"Session error rate",
				finiteNumber(row, "errorRate", "error_rate"),
				"percent"
			),
		];
	}
	if (
		evidence.queryType === "error_fingerprints" ||
		evidence.queryType === "error_types"
	) {
		return [
			...metric("Affected users", finiteNumber(row, "users", "affected_users")),
			...metric(
				"Affected sessions",
				finiteNumber(row, "sessions", "affected_sessions")
			),
		];
	}
	if (evidence.queryType === "revenue_overview") {
		return [
			...metric(
				"Queried revenue",
				finiteNumber(row, "total_revenue", "revenue")
			),
			...metric(
				"Transactions",
				finiteNumber(row, "total_transactions", "transactions")
			),
			...metric(
				"Customers",
				finiteNumber(row, "unique_customers", "customers")
			),
			...metric(
				"Payment failure rate",
				finiteNumber(row, "payment_failure_rate"),
				"percent"
			),
			...metric(
				"Failed payment attempts",
				finiteNumber(row, "failed_payment_attempts")
			),
			...metric(
				"Successful payment attempts",
				finiteNumber(row, "successful_payment_attempts")
			),
			...metric(
				"Recovered payment attempts",
				finiteNumber(row, "recovered_payment_attempts")
			),
			...metric(
				"Observed failure event types",
				finiteNumber(row, "observed_failure_event_types")
			),
		];
	}
	if (
		evidence.queryType === "goals_summary" ||
		evidence.queryType === "funnels_summary"
	) {
		return [
			...metric("Entrants", finiteNumber(row, "total_users_entered")),
			...metric("Completions", finiteNumber(row, "total_users_completed")),
			...metric(
				"Conversion rate",
				finiteNumber(row, "overall_conversion_rate"),
				"percent"
			),
		];
	}
	if (evidence.queryType.startsWith("web_vitals_by_")) {
		const vital = vitalField(signal.metric.key);
		return vital
			? [
					...metric(vital.label, finiteNumber(row, vital.field), "duration_ms"),
					...metric("Visitors sampled", finiteNumber(row, "visitors")),
				]
			: [];
	}
	return [];
}

const VITAL_ACTION_THRESHOLDS = {
	inp: { bad: 200, maxPlausible: 10_000 },
	lcp: { bad: 2500, maxPlausible: 60_000 },
} as const;

function qualifyVitalRows(
	rows: EvidenceRow[],
	metricKey: string,
	limit: number
): EvidenceRow[] {
	const vital = vitalField(metricKey);
	const thresholds =
		metricKey === "lcp" || metricKey === "inp"
			? VITAL_ACTION_THRESHOLDS[metricKey]
			: null;
	if (!(vital && thresholds)) {
		return [];
	}
	return rows
		.filter((row) => {
			const value = finiteNumber(row, vital.field);
			const visitors = finiteNumber(row, "visitors") ?? 0;
			const measurements = finiteNumber(row, "measurements") ?? 0;
			return (
				value !== null &&
				value > thresholds.bad &&
				value <= thresholds.maxPlausible &&
				visitors >= 10 &&
				measurements >= 20
			);
		})
		.sort(
			(a, b) =>
				(finiteNumber(b, vital.field) ?? 0) -
				(finiteNumber(a, vital.field) ?? 0)
		)
		.slice(0, limit);
}

function diagnosticEntity(
	queryType: string,
	data: unknown
): InvestigationSignal["entity"] | undefined {
	if (queryType === "error_fingerprints") {
		const row = evidenceRows(data, ["error_fingerprints"])[0];
		const message = textValue(row, "message", "name");
		if (!message) {
			return;
		}
		return {
			type: "error",
			id: `fingerprint:${createHash("sha256").update(message).digest("hex").slice(0, 16)}`,
			label: shortText(message, 120),
		};
	}
	if (queryType === "web_vitals_by_page:qualified") {
		const row = evidenceRows(data)[0];
		const path = textValue(row, "name", "path");
		if (!path) {
			return;
		}
		return {
			type: "page",
			id: `page:${createHash("sha256").update(path).digest("hex").slice(0, 16)}`,
			label: shortText(path, 120),
		};
	}
	return;
}

export function countEvidenceRows(data: unknown): number {
	if (Array.isArray(data)) {
		return data.length;
	}
	if (!(data && typeof data === "object")) {
		return data == null ? 0 : 1;
	}

	const entries = Object.entries(data);
	const arrayRows = entries
		.filter(([, value]) => Array.isArray(value))
		.map(([, value]) => value.length);
	const maxArrayRows = arrayRows.length > 0 ? Math.max(...arrayRows) : 0;
	if (arrayRows.length > 0) {
		return maxArrayRows;
	}
	return entries.some(
		([, value]) =>
			!Array.isArray(value) && value !== null && value !== undefined
	)
		? 1
		: 0;
}

export interface CreateInsightEvidenceReaderParams {
	domain: string;
	/** Overrides product reads for snapshot/evaluation runtimes. */
	fetchProductMetrics?: ProductMetricsFetcher;
	onEvidence?: (evidence: InvestigationEvidence) => void;
	signal: InvestigationSignal;
	timezone: string;
	websiteId: string;
}

type WebInsightQueryType =
	| "country"
	| "device_types"
	| "entry_pages"
	| "revenue_overview"
	| "top_pages"
	| "top_referrers"
	| "utm_campaigns"
	| "web_vitals_by_page";

export type InsightEvidenceReadRequest =
	| {
			input: { period: "current"; queries: OpsInsightQuery[] };
			name: "ops_context";
	  }
	| {
			input: { period: "current" };
			name: "product_metrics";
	  }
	| {
			input: {
				period: "both" | "current";
				queries: Array<{ type: WebInsightQueryType }>;
			};
			name: "web_metrics";
	  };

export type InsightEvidenceReader = (
	request: InsightEvidenceReadRequest,
	appContext: AppContext,
	abortSignal?: AbortSignal
) => Promise<InvestigationEvidence[]>;

function verifiedRemediation(
	signal: InvestigationSignal,
	data: unknown
): InvestigationExpectation | undefined {
	const expectation = signal.expectation;
	if (
		!expectation ||
		signal.kind !== "missing_expected_data" ||
		(signal.entity.type !== "goal" && signal.entity.type !== "funnel")
	) {
		return;
	}
	const row = evidenceRows(data, [
		signal.entity.type === "goal" ? "goals" : "funnels",
	])[0];
	if (
		!row ||
		textValue(row, "id") !== signal.entity.id ||
		row.is_active === false ||
		textValue(row, "definition_updated_at") !==
			expectation.definitionUpdatedAt ||
		finiteNumber(row, "total_users_entered") === null ||
		(finiteNumber(row, "total_users_entered") ?? 0) < 30 ||
		finiteNumber(row, "total_users_completed") !== 0
	) {
		return;
	}
	if (signal.entity.type === "goal") {
		return textValue(row, "type") !== "PAGE_VIEW" &&
			textValue(row, "target") === expectation.eventName
			? expectation
			: undefined;
	}
	const steps = Array.isArray(row.steps)
		? row.steps.filter((step): step is EvidenceRow =>
				Boolean(step && typeof step === "object")
			)
		: [];
	const exactStep = steps.find(
		(step) =>
			textValue(step, "type") !== "PAGE_VIEW" &&
			textValue(step, "target") === expectation.eventName &&
			(!expectation.stepName ||
				textValue(step, "name") === expectation.stepName)
	);
	return exactStep && finiteNumber(exactStep, "users") === 0
		? expectation
		: undefined;
}

export function createInsightEvidenceReader(
	params: CreateInsightEvidenceReaderParams
): InsightEvidenceReader {
	function productScope(): {
		entity: InvestigationSignal["entity"];
		queryType: "custom_events_summary" | "funnels_summary" | "goals_summary";
		target: ProductInsightTarget;
	} {
		let target: ProductInsightTarget;
		let queryType:
			| "custom_events_summary"
			| "funnels_summary"
			| "goals_summary";
		switch (params.signal.entity.type) {
			case "goal":
				target = { id: params.signal.entity.id, type: "goal" };
				queryType = "goals_summary";
				break;
			case "funnel":
				target = { id: params.signal.entity.id, type: "funnel" };
				queryType = "funnels_summary";
				break;
			case "event":
				target = { id: params.signal.entity.id, type: "event" };
				queryType = "custom_events_summary";
				break;
			default:
				throw new Error(
					`Product evidence is not scoped to this ${params.signal.entity.type} signal`
				);
		}
		return {
			entity: params.signal.entity,
			queryType,
			target,
		};
	}

	function materializeEvidence(
		items: QueryEvidence[]
	): InvestigationEvidence[] {
		return items.map((item) => {
			const signalKey = params.signal.signalKey;
			const digest = createHash("sha256")
				.update(
					canonicalJson({
						period: item.period,
						query: item.query,
						queryType: item.queryType,
						range: item.range,
						signalKey,
						source: item.source,
					})
				)
				.digest("hex")
				.slice(0, 16);
			const evidence = toInvestigationEvidence(
				{
					...item,
					evidenceId: `evidence:${item.source}:${digest}`,
					signalKey,
				},
				params.signal
			);
			params.onEvidence?.(evidence);
			return evidence;
		});
	}

	function resolveRanges(period: "current" | "previous" | "both") {
		if (params.signal.detection.method === "zscore" && period !== "current") {
			throw new Error(
				"This signal has a sparse comparable-day baseline; query current only and use the supplied detector evidence for its baseline"
			);
		}
		const bounds = params.signal.period;
		if (period === "both") {
			return [
				{ label: "current" as const, range: bounds.current },
				{ label: "previous" as const, range: bounds.previous },
			];
		}
		return [
			{
				label: period,
				range: period === "current" ? bounds.current : bounds.previous,
			},
		];
	}

	async function fetchContextEvidence(input: {
		abortSignal?: AbortSignal;
		entity?: InvestigationSignal["entity"];
		fetch: () => Promise<{ results: Record<string, unknown>[] }>;
		period: "current" | "previous";
		queries: { limit?: number; type: string }[];
		range: { from: string; to: string };
		source: "ops" | "product";
	}): Promise<QueryEvidence[]> {
		try {
			const response = await readWithRetry(input.fetch, input.abortSignal);
			return input.queries.map((query, index): QueryEvidence => {
				const result = response.results[index];
				const data = result
					? Object.fromEntries(
							Object.entries(result).filter(([key]) => key !== "type")
						)
					: [];
				const rowCount = countEvidenceRows(data);
				const entity = input.entity ?? diagnosticEntity(query.type, data);
				const remediation = verifiedRemediation(params.signal, data);
				return {
					data,
					...(entity ? { entity } : {}),
					period: input.period,
					query,
					queryType: query.type,
					...(remediation ? { remediation } : {}),
					range: input.range,
					rowCount,
					source: input.source,
					status: rowCount === 0 ? "empty" : "ok",
				};
			});
		} catch (error) {
			rethrowAbort(error, input.abortSignal);
			const message =
				error instanceof Error ? error.message.slice(0, 500) : "Query failed";
			return input.queries.map(
				(query): QueryEvidence => ({
					data: [],
					...(input.entity ? { entity: input.entity } : {}),
					error: message,
					period: input.period,
					query,
					queryType: query.type,
					range: input.range,
					rowCount: 0,
					source: input.source,
					status: "failed",
				})
			);
		}
	}

	const webQueryTypeSchema = isRevenueMetric(params.signal.metric.key)
		? z.literal("revenue_overview")
		: params.signal.entity.type === "vital"
			? z.literal("web_vitals_by_page")
			: params.signal.entity.type === "campaign"
				? z.literal("utm_campaigns")
				: z.enum([
						"country",
						"device_types",
						"entry_pages",
						"top_pages",
						"top_referrers",
						"utm_campaigns",
					]);
	const querySchema = z
		.object({
			type: webQueryTypeSchema,
		})
		.strict();
	const webInputSchema = z
		.object({
			period: isRevenueMetric(params.signal.metric.key)
				? z.literal("both")
				: z.literal("current"),
			queries: z.array(querySchema).min(1).max(MAX_QUERIES),
		})
		.strict();

	function fetchWebEvidence(
		{ period, queries }: z.infer<typeof webInputSchema>,
		abortSignal?: AbortSignal
	): Promise<QueryEvidence[]> {
		if (!isRevenueMetric(params.signal.metric.key) && period !== "current") {
			throw new Error(
				"Investigations use the detector baseline and query only the current period"
			);
		}
		if (isRevenueMetric(params.signal.metric.key) && period !== "both") {
			throw new Error(
				"Revenue investigations must reconcile both detector periods"
			);
		}
		const ranges = resolveRanges(period);
		const unique = uniqueQueries(queries);

		const tasks = ranges.flatMap((p) =>
			unique.map(async (q) => {
				const requestedLimit = 10;
				const isVitalPageQuery =
					q.type === "web_vitals_by_page" &&
					params.signal.entity.type === "vital";
				const evidenceQueryType =
					isVitalPageQuery && p.label === "current"
						? "web_vitals_by_page:qualified"
						: q.type;
				const req: QueryRequest = {
					projectId: params.websiteId,
					type: q.type,
					from: p.range.from,
					to: p.range.to,
					timezone: params.timezone,
					limit: isVitalPageQuery ? 50 : requestedLimit,
					filters: params.signal.currency
						? [
								{
									field: "currency",
									op: "eq" as const,
									value: params.signal.currency,
								},
							]
						: params.signal.entity.type === "campaign"
							? [
									{
										field: "utm_campaign",
										op: "eq" as const,
										value: params.signal.entity.id,
									},
								]
							: undefined,
				};

				try {
					const read = () =>
						executeQuery(req, params.domain, params.timezone, abortSignal);
					let data = await readWithRetry(read, abortSignal);
					if (q.type === "revenue_overview") {
						const expected =
							p.label === "current"
								? params.signal.metric.current
								: (params.signal.metric.previous ?? 0);
						if (
							!revenueMetricMatchesDetector(
								data,
								params.signal.metric.key,
								expected
							)
						) {
							data = await read();
						}
					}
					const rawRows = Array.isArray(data) ? data : [];
					const rows =
						isVitalPageQuery && p.label === "current"
							? qualifyVitalRows(
									rawRows.filter((row): row is EvidenceRow =>
										Boolean(row && typeof row === "object")
									),
									params.signal.metric.key,
									requestedLimit
								)
							: rawRows;
					const entity =
						params.signal.entity.type === "campaign"
							? params.signal.entity
							: diagnosticEntity(evidenceQueryType, rows);
					return {
						data: rows,
						...(entity ? { entity } : {}),
						period: p.label,
						query: q,
						queryType: evidenceQueryType,
						range: p.range,
						rowCount: rows.length,
						source: sourceForWebQuery(q.type),
						status: rows.length === 0 ? "empty" : "ok",
					} satisfies QueryEvidence;
				} catch (error) {
					rethrowAbort(error, abortSignal);
					return {
						data: [],
						error:
							error instanceof Error
								? error.message.slice(0, 500)
								: "Query failed",
						period: p.label,
						query: q,
						queryType: evidenceQueryType,
						range: p.range,
						rowCount: 0,
						source: sourceForWebQuery(q.type),
						status: "failed",
					} satisfies QueryEvidence;
				}
			})
		);

		return Promise.all(tasks);
	}

	const productInputSchema = z
		.object({ period: z.literal("current") })
		.strict();
	async function fetchProductEvidence(
		{ period }: z.infer<typeof productInputSchema>,
		appContext: AppContext,
		abortSignal?: AbortSignal
	): Promise<QueryEvidence[]> {
		if (period !== "current") {
			throw new Error(
				"Product investigations use the detector baseline and query only the current period"
			);
		}
		const scope = productScope();
		const ranges = resolveRanges(period);
		const results = await Promise.all(
			ranges.map((p) =>
				fetchContextEvidence({
					abortSignal,
					entity: scope.entity,
					fetch: () =>
						(params.fetchProductMetrics ?? fetchProductMetrics)(
							appContext,
							p.range,
							scope.target,
							abortSignal
						),
					period: p.label,
					queries: [{ type: scope.queryType }],
					range: p.range,
					source: "product",
				})
			)
		);
		return results.flat();
	}
	const opsInputSchema = z
		.object({
			period: z.literal("current"),
			queries: z
				.array(
					z
						.object({
							type: z.enum(OPS_INSIGHT_QUERY_TYPES),
							limit: z.number().min(1).max(10).optional(),
						})
						.strict()
				)
				.min(1)
				.max(MAX_QUERIES),
		})
		.strict();
	async function fetchOpsEvidence(
		{ period, queries }: z.infer<typeof opsInputSchema>,
		appContext: AppContext,
		abortSignal?: AbortSignal
	): Promise<QueryEvidence[]> {
		if (
			(params.signal.entity.type === "error" ||
				params.signal.entity.type === "uptime_monitor") &&
			period !== "current"
		) {
			throw new Error(
				"Reliability investigations use the detector baseline and query only the current period"
			);
		}
		const ranges = resolveRanges(period);
		const unique = uniqueQueries(queries);
		const results = await Promise.all(
			ranges.map((p) =>
				fetchContextEvidence({
					abortSignal,
					fetch: () =>
						fetchOpsMetrics(appContext, p.range, p.label, unique, abortSignal),
					period: p.label,
					queries: unique,
					range: p.range,
					source: "ops",
				})
			)
		);
		return results.flat();
	}
	return async (request, appContext, abortSignal) => {
		switch (request.name) {
			case "product_metrics":
				return materializeEvidence(
					await fetchProductEvidence(
						productInputSchema.parse(request.input),
						appContext,
						abortSignal
					)
				);
			case "ops_context":
				return materializeEvidence(
					await fetchOpsEvidence(
						opsInputSchema.parse(request.input),
						appContext,
						abortSignal
					)
				);
			case "web_metrics":
				return materializeEvidence(
					await fetchWebEvidence(
						webInputSchema.parse(request.input),
						abortSignal
					)
				);
			default:
				throw new Error("Unsupported insight evidence request");
		}
	};
}

export type { ProductMetricsFetcher } from "./product-context";
