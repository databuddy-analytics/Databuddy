import { executeQuery, type Filter, MAX_QUERY_ROWS } from "@databuddy/ai/query";
import { formatCountryName } from "@databuddy/shared/country-codes";
import { normalizeCurrencyCode } from "@databuddy/shared/currency";
import type {
	InvestigationSignal,
	MatchedErrorContinuationMeasurement,
	RetentionMeasurement,
	WeekOverWeekPeriod,
} from "@databuddy/shared/insights";
import dayjs from "dayjs";
import timezonePlugin from "dayjs/plugin/timezone";
import utcPlugin from "dayjs/plugin/utc";
import { z } from "zod";
import {
	hasMaterialRouteContinuation,
	matchedErrorContinuationMeasurement,
	parseRouteContinuationComparison,
	type RouteContinuationComparison,
} from "./error-customer-impact";
import { emitInsightsEvent } from "./lib/evlog-insights";
import {
	LOWER_IS_BETTER_METRICS,
	normalizedLabel,
	rankSignals,
	signalKeyForDetectedSignal,
	TRAFFIC_METRICS,
} from "./investigation";

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);
export interface DetectedSignal {
	baseline: number;
	baselineDates?: string[];
	cohortMeasurement?: MatchedErrorContinuationMeasurement;
	current: number;
	definitionEvidence?: string;
	deltaPercent: number;
	detectedAt: string;
	direction: "up" | "down";
	entityId?: string;
	entityLabel?: string;
	evidence?: string[];
	investigationObjective?: string;
	label: string;
	method: "behavior" | "zscore" | "wow";
	metric: string;
	period?: WeekOverWeekPeriod;
	retentionMeasurement?: RetentionMeasurement;
	severity: "critical" | "warning" | "info";
	subjectKey?: string;
}

export interface DetectSignalsParams {
	lookbackDays: number;
	timezone: string;
	websiteId: string;
}

export interface DetectionDiagnostics {
	failedFamilies: number;
}

interface AnomalyMetric {
	dailyField: string;
	key: string;
	label: string;
	summaryField: string;
}

const ANOMALY_METRICS: AnomalyMetric[] = [
	{
		key: "visitors",
		label: "Visitors",
		dailyField: "visitors",
		summaryField: "unique_visitors",
	},
	{
		key: "sessions",
		label: "Sessions",
		dailyField: "sessions",
		summaryField: "sessions",
	},
	{
		key: "pageviews",
		label: "Pageviews",
		dailyField: "pageviews",
		summaryField: "pageviews",
	},
	{
		key: "bounce_rate",
		label: "Bounce rate",
		dailyField: "bounce_rate",
		summaryField: "bounce_rate",
	},
	{
		key: "session_duration",
		label: "Median session duration",
		dailyField: "median_session_duration",
		summaryField: "median_session_duration",
	},
];

const SESSION_DERIVED_METRICS = new Set(["bounce_rate", "session_duration"]);

function isImprovement(
	metric: string,
	current: number,
	baseline: number
): boolean {
	if (current === baseline) {
		return false;
	}
	return LOWER_IS_BETTER_METRICS.has(metric)
		? current < baseline
		: current > baseline;
}

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	const upper = sorted[mid];
	if (upper === undefined) {
		return 0;
	}
	const lower = sorted[mid - 1];
	return sorted.length % 2 === 0 && lower !== undefined
		? (lower + upper) / 2
		: upper;
}

function mad(values: number[]): number {
	if (values.length < 2) {
		return 0;
	}
	const med = median(values);
	const deviations = values.map((v) => Math.abs(v - med));
	return median(deviations);
}

const MAD_SCALE = 1.4826;
const ZSCORE_THRESHOLD = 2.5;
const ZSCORE_MIN_BASELINE = 6;
const ZSCORE_MIN_DAY_SESSIONS = 100;
const ZSCORE_HISTORY_DAYS = 22;
const WOW_TRAFFIC_THRESHOLD = 40;
const WOW_ERROR_THRESHOLD = 40;
const WOW_REVENUE_THRESHOLD = 30;
const WOW_VITALS_THRESHOLD = 30;
const CUSTOM_EVENT_DROP_THRESHOLD = 50;
const REVENUE_MIN_ABSOLUTE_CHANGE = 25;
const REVENUE_MIN_TRANSACTIONS = 5;
const FILTER_SESSION_DURATION_MIN_DELTA = 60;
const FILTER_SESSION_DURATION_MIN_PEAK = 20;
const FILTER_BOUNCE_MIN_DELTA = 10;
const FILTER_ERROR_MIN_DELTA = 5;
const FILTER_ERROR_MIN_PEAK = 10;
const MIN_AFFECTED_USERS = 5;
const SIGNIFICANT_AFFECTED_USERS = 20;
const ERROR_MIN_SESSION_RATE = 1;
const MIN_ERROR_BEHAVIOR_CANDIDATE_SESSIONS = 30;
const MAX_ERROR_BEHAVIOR_COMPARISONS = 3;
const ERROR_FINGERPRINT_LIMIT = 50;
const LOW_TRAFFIC_WEEKLY_SESSIONS = 50;
const LOW_TRAFFIC_MIN_VALUE = 10;
const FILTER_TRAFFIC_MIN_PEAK = 80;
const FILTER_TRAFFIC_MIN_DELTA = 50;
const MATERIAL_VOLUME_DROP_PERCENT = 60;
const FRESH_ZSCORE_THRESHOLD = 3.5;
const FRESH_MIN_CHANGE_PERCENT = 40;
const FRESH_MIN_BASELINE_TRANSACTIONS = 5;
const FRESH_MIN_BASELINE_EVENTS = 20;
const ADAPTIVE_CV_SCALE = 200;
const DETECTOR_RETRY_DELAY_MS = 100;

export const INSIGHT_VITALS = {
	LCP: {
		badThreshold: 2500,
		label: "Page load time (LCP)",
		maxPlausible: 60_000,
	},
	INP: {
		badThreshold: 200,
		label: "Interaction speed (INP)",
		maxPlausible: 10_000,
	},
} as const;
const VITALS_MIN_SAMPLES = 10;
const PERSISTENT_LCP_MIN_SAMPLES = 100;
const PERSISTENT_LCP_POOR_THRESHOLD = 4000;

function hasMaterialVitalChange(
	current: number,
	baseline: number,
	badThreshold: number
): boolean {
	return (
		Math.abs(safeDeltaPercent(current, baseline)) >= WOW_VITALS_THRESHOLD &&
		current > badThreshold
	);
}

function hasPersistentPoorLcp(
	current: number,
	baseline: number,
	currentSamples: number,
	baselineSamples: number
): boolean {
	return (
		currentSamples >= PERSISTENT_LCP_MIN_SAMPLES &&
		baselineSamples >= PERSISTENT_LCP_MIN_SAMPLES &&
		current > PERSISTENT_LCP_POOR_THRESHOLD &&
		baseline > PERSISTENT_LCP_POOR_THRESHOLD
	);
}

export function wowWindow(today: dayjs.Dayjs, lookbackDays: number) {
	const windowDays = Math.max(3, lookbackDays);
	const lastCompleteDay = today.subtract(1, "day");
	return {
		currentFrom: lastCompleteDay
			.subtract(windowDays - 1, "day")
			.format("YYYY-MM-DD"),
		currentTo: lastCompleteDay.format("YYYY-MM-DD"),
		previousFrom: lastCompleteDay
			.subtract(windowDays * 2 - 1, "day")
			.format("YYYY-MM-DD"),
		previousTo: lastCompleteDay
			.subtract(windowDays, "day")
			.format("YYYY-MM-DD"),
	};
}

function round2(value: number): number {
	return Number(value.toFixed(2));
}

function adaptiveWowThreshold(dailyValues: number[], base: number): number {
	if (dailyValues.length < ZSCORE_MIN_BASELINE) {
		return base;
	}
	const mean = dailyValues.reduce((sum, v) => sum + v, 0) / dailyValues.length;
	if (mean <= 0) {
		return base;
	}
	const variance =
		dailyValues.reduce((sum, v) => sum + (v - mean) ** 2, 0) /
		dailyValues.length;
	const cv = Math.sqrt(variance) / mean;
	return Math.max(base, round2(cv * ADAPTIVE_CV_SCALE));
}

type SignalFilter = (signal: DetectedSignal) => boolean;

const METRIC_FILTERS: Record<string, SignalFilter> = {
	bounce_rate: (s) =>
		Math.abs(s.current - s.baseline) >= FILTER_BOUNCE_MIN_DELTA,
	custom_event_count: () => true,
	custom_event_reach: () => true,
	error_count: () => true,
	inp: () => true,
	lcp: () => true,
	revenue: () => true,
	product_revenue: () => true,
	refund_amount: () => true,
	attribution_rate: () => true,
	session_duration: (s) =>
		Math.abs(s.current - s.baseline) >= FILTER_SESSION_DURATION_MIN_DELTA &&
		Math.max(s.current, s.baseline) >= FILTER_SESSION_DURATION_MIN_PEAK,
};

const DEFAULT_TRAFFIC_FILTER: SignalFilter = (s) =>
	Math.max(s.current, s.baseline) >= FILTER_TRAFFIC_MIN_PEAK &&
	Math.abs(s.current - s.baseline) >= FILTER_TRAFFIC_MIN_DELTA;

export function makeWowSignal(
	metric: string,
	label: string,
	current: number,
	baseline: number,
	detectedAt: string,
	options: { round?: boolean } = {}
): DetectedSignal {
	const pct = safeDeltaPercent(current, baseline);
	const lowerIsBetter = LOWER_IS_BETTER_METRICS.has(metric);
	const direction = lowerIsBetter
		? current > baseline
			? "up"
			: "down"
		: current < baseline
			? "down"
			: "up";
	return {
		metric,
		label,
		method: "wow",
		direction,
		current: options.round ? round2(current) : current,
		baseline: options.round ? round2(baseline) : baseline,
		deltaPercent: round2(pct),
		severity: assignSeverity(
			undefined,
			pct,
			isImprovement(metric, current, baseline)
		),
		detectedAt,
	};
}

function makeRevenueSignal(
	currency: string,
	current: Record<string, unknown>,
	previous: Record<string, unknown>,
	detectedAt: string
): DetectedSignal | null {
	const c = commercialNumberSchema.safeParse(current.total_revenue);
	const p = commercialNumberSchema.safeParse(previous.total_revenue);
	if (!(c.success && p.success) || c.data < 0 || p.data < 0) {
		return null;
	}
	const signal = makeWowSignal(
		"revenue",
		`${currency} gross revenue`,
		c.data,
		p.data,
		detectedAt
	);
	return {
		...signal,
		severity:
			signal.direction === "down" && signal.severity === "info"
				? "warning"
				: signal.severity,
		subjectKey: `revenue:${currency}`,
		investigationObjective: REVENUE_OBJECTIVE,
		definitionEvidence: `Business meaning: gross revenue from completed payments in ${currency}, excluding refunds. The snapshot alone is not publication evidence: confirm with revenue_overview for this currency across both complete signal windows.`,
	};
}

const REVENUE_OBJECTIVE =
	"Find which measured product or payment-description groups account for the gross revenue change and what decision that concentration changes. Inspect revenue_by_product; its names can be payment or invoice descriptions, not verified catalog products. Separate missing coverage from an unchanged group. Do not infer profit, acquisition ROI or subscription churn.";

const commercialNumberSchema = z
	.union([z.number(), z.string().trim().min(1)])
	.pipe(z.coerce.number<string | number>().finite());
const countSchema = commercialNumberSchema.pipe(z.number().int().nonnegative());
const commercialOverviewSchema = z.object({
	total_revenue: commercialNumberSchema.pipe(z.number().nonnegative()),
	total_transactions: countSchema,
	// The native ledger sums refunds as negative amounts; discovery compares money returned.
	refund_amount: commercialNumberSchema
		.transform(Math.abs)
		.nullish()
		.catch(null),
	refund_count: countSchema.nullish().catch(null),
	attributed_revenue: commercialNumberSchema
		.pipe(z.number().nonnegative())
		.nullish()
		.catch(null),
});

const productRevenueRowSchema = z.object({
	currency: z.string().regex(/^[A-Z]{3}$/),
	provider: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/),
	product_id: z.union([z.null(), z.literal("")]),
	name: z
		.string()
		.refine((value) => value.trim().length > 0 && value.trim() !== "Unknown"),
	revenue: commercialNumberSchema.pipe(z.number().nonnegative()),
	transactions: countSchema,
});

function productRevenueRows(rows: Record<string, unknown>[]) {
	const products = new Map<string, z.infer<typeof productRevenueRowSchema>>();
	const ambiguous = new Set<string>();
	for (const row of rows) {
		const parsed = productRevenueRowSchema.safeParse(row);
		if (!parsed.success) {
			continue;
		}
		const product = parsed.data;
		const key = `product_revenue:${product.currency}:${product.provider}:product_name:${encodeURIComponent(product.name)}`;
		if (products.has(key)) {
			ambiguous.add(key);
		}
		products.set(key, product);
	}
	for (const key of ambiguous) {
		products.delete(key);
	}
	return products;
}

function makeProductRevenueSignal(
	current: z.infer<typeof productRevenueRowSchema>,
	previous: z.infer<typeof productRevenueRowSchema>,
	currentWhole: unknown,
	previousWhole: unknown,
	detectedAt: string,
	applyThreshold = true
): DetectedSignal | null {
	const cur = commercialOverviewSchema.safeParse(currentWhole);
	const prev = commercialOverviewSchema.safeParse(previousWhole);
	if (!(cur.success && prev.success)) {
		return null;
	}
	const c = cur.data;
	const p = prev.data;
	if (
		normalizeCurrencyCode(current.currency) !== current.currency ||
		Math.min(c.total_transactions, p.total_transactions) < 20 ||
		Math.min(c.total_revenue, p.total_revenue) <= 0 ||
		current.revenue > c.total_revenue ||
		previous.revenue > p.total_revenue ||
		current.transactions > c.total_transactions ||
		previous.transactions > p.total_transactions
	) {
		return null;
	}
	const currentShare = (100 * current.revenue) / c.total_revenue;
	const previousShare = (100 * previous.revenue) / p.total_revenue;
	if (
		applyThreshold &&
		(Math.max(current.transactions, previous.transactions) < 10 ||
			Math.abs(current.revenue - previous.revenue) <
				0.05 * Math.max(c.total_revenue, p.total_revenue) ||
			Math.abs(safeDeltaPercent(current.revenue, previous.revenue)) < 30 ||
			Math.abs(currentShare - previousShare) < 10)
	) {
		return null;
	}
	const label = current.name.trim();
	return {
		...makeWowSignal(
			"product_revenue",
			`${label} ${current.currency} payments`,
			current.revenue,
			previous.revenue,
			detectedAt
		),
		subjectKey: `product_revenue:${current.currency}:${current.provider}:product_name:${encodeURIComponent(current.name)}`,
		entityId: current.name,
		entityLabel: label,
		investigationObjective:
			"Find material changes in the composition of payments, even when total revenue is flat. A verified material payment-description shift is a measured business result and can publish with resolve when no cause or repair is known. Confirm revenue_overview for both windows: currency, provider, product_name=signal.entity.id and product_id=empty string, plus a separate currency-only whole control. These are payment descriptions, not verified catalog products. Do not infer churn, causality or absence from a limited table.",
		definitionEvidence: `${current.provider} payments described ${JSON.stringify(current.name)} with no product ID, ${current.currency} gross revenue from completed payments excluding refunds: ${previous.revenue} across ${previous.transactions} transactions → ${current.revenue} across ${current.transactions}. Whole-currency gross: ${p.total_revenue} → ${c.total_revenue}; payment-description share: ${round2(previousShare)}% → ${round2(currentShare)}%. Remaining gross: ${p.total_revenue - previous.revenue} → ${c.total_revenue - current.revenue}. Confirm description and whole controls with native revenue_overview; the snapshot alone cannot support publication.`,
	};
}

function commercialSignals(
	currency: string,
	current: Record<string, unknown>,
	previous: Record<string, unknown>,
	detectedAt: string,
	applyThreshold = true
): DetectedSignal[] {
	const cur = commercialOverviewSchema.safeParse(current);
	const prev = commercialOverviewSchema.safeParse(previous);
	if (!(cur.success && prev.success)) {
		return [];
	}
	const c = cur.data;
	const p = prev.data;
	const signals: DetectedSignal[] = [];
	const sampled = Math.min(c.total_transactions, p.total_transactions) >= 20;
	if (
		c.refund_amount != null &&
		p.refund_amount != null &&
		c.refund_count != null &&
		p.refund_count != null
	) {
		const delta = Math.abs(c.refund_amount - p.refund_amount);
		if (
			!applyThreshold ||
			(sampled &&
				Math.max(c.refund_count, p.refund_count) >= 5 &&
				delta >= Math.max(c.total_revenue, p.total_revenue) * 0.02 &&
				Math.abs(safeDeltaPercent(c.refund_amount, p.refund_amount)) >= 30)
		) {
			signals.push({
				...makeWowSignal(
					"refund_amount",
					`${currency} refunds`,
					c.refund_amount,
					p.refund_amount,
					detectedAt
				),
				subjectKey: `refund_amount:${currency}`,
				investigationObjective:
					"Investigate the independent refund change and its operational consequence even if gross revenue from completed payments is unchanged. Reconcile amounts and refund counts in this exact currency; do not let stable gross suppress refund review.",
				definitionEvidence: `${currency} refunds: ${p.refund_amount} across ${p.refund_count} refunds → ${c.refund_amount} across ${c.refund_count}. Gross revenue: ${p.total_revenue} → ${c.total_revenue}; refunds are independent of gross, not subtracted from it. Refunds can refer to earlier purchases, so this is not a purchase-cohort refund rate. Confirm both complete windows with revenue_overview.`,
			});
		}
	}
	if (
		c.attributed_revenue != null &&
		p.attributed_revenue != null &&
		c.total_revenue > 0 &&
		p.total_revenue > 0 &&
		c.attributed_revenue <= c.total_revenue &&
		p.attributed_revenue <= p.total_revenue
	) {
		const currentRate = (100 * c.attributed_revenue) / c.total_revenue;
		const previousRate = (100 * p.attributed_revenue) / p.total_revenue;
		if (
			!applyThreshold ||
			(sampled && Math.abs(currentRate - previousRate) >= 15)
		) {
			signals.push({
				...makeWowSignal(
					"attribution_rate",
					`${currency} revenue attribution coverage`,
					currentRate,
					previousRate,
					detectedAt,
					{ round: true }
				),
				subjectKey: `attribution_rate:${currency}`,
				investigationObjective:
					"Investigate the independent attribution coverage change and which acquisition comparison is now unsafe or newly supported. Retain this decision separately from refunds or gross movement. Unattributed revenue is not lost sales.",
				definitionEvidence: `${currency} attributed revenue: ${p.attributed_revenue} of ${p.total_revenue} gross → ${c.attributed_revenue} of ${c.total_revenue} gross. Coverage is ${previousRate}% → ${currentRate}%. This changes which acquisition decisions the observed attribution supports; unattributed revenue is not lost sales. Confirm both complete windows with revenue_overview; attribution does not establish acquisition causality.`,
			});
		}
	}
	return signals;
}

function passesImpactFilter(signal: DetectedSignal): boolean {
	if (signal.method === "behavior") {
		// The matched cohort parser is stricter than a raw count-delta filter.
		return true;
	}
	const filter = METRIC_FILTERS[signal.metric];
	return filter ? filter(signal) : DEFAULT_TRAFFIC_FILTER(signal);
}

const RATE_METRICS = new Set(["bounce_rate", "session_duration", "lcp", "inp"]);

function passesLowTrafficFloor(
	signal: DetectedSignal,
	weeklySessions: number
): boolean {
	if (weeklySessions >= LOW_TRAFFIC_WEEKLY_SESSIONS) {
		return true;
	}
	if (
		signal.metric === "refund_amount" ||
		signal.metric === "attribution_rate"
	) {
		return true; // Commercial cohorts have their own transaction floor.
	}
	if (RATE_METRICS.has(signal.metric)) {
		return false;
	}
	return Math.max(signal.current, signal.baseline) >= LOW_TRAFFIC_MIN_VALUE;
}

function hasMeaningfulErrorImpact(
	affectedUsers: number,
	errorRate: number
): boolean {
	return (
		affectedUsers >= MIN_AFFECTED_USERS &&
		(affectedUsers >= SIGNIFICANT_AFFECTED_USERS ||
			errorRate >= ERROR_MIN_SESSION_RATE)
	);
}

function capLowReachSeverity(
	signal: DetectedSignal,
	affectedUsers: number
): DetectedSignal {
	if (
		affectedUsers < SIGNIFICANT_AFFECTED_USERS &&
		signal.severity === "critical"
	) {
		return { ...signal, severity: "warning" };
	}
	return signal;
}

function errorLabel(row: Record<string, unknown> | undefined): string {
	const message =
		stringField(row, "name") ?? stringField(row, "message") ?? "Error";
	const errorType = stringField(row, "error_type");
	const filename = stringField(row, "filename");
	const path = stringField(row, "path");
	const line = numberField(row, "line");
	const location = filename ? `${filename}${line > 0 ? `:${line}` : ""}` : path;
	return `${errorType ? `${errorType}: ` : ""}${message}${location ? ` at ${location}` : ""}`;
}

function errorCountSignal(
	rawLabel: string,
	fingerprint: string,
	currentRow: Record<string, unknown> | undefined,
	previousRow: Record<string, unknown> | undefined,
	detectedAt: string
): DetectedSignal {
	const label = normalizedLabel(rawLabel);
	const signal = makeWowSignal(
		"error_count",
		label,
		numberField(currentRow, "count"),
		numberField(previousRow, "count"),
		detectedAt
	);
	return {
		...signal,
		definitionEvidence: `${label} occurred ${signal.current} times across ${numberField(currentRow, "users")} visitor identifiers, compared with ${signal.baseline} occurrences across ${numberField(previousRow, "users")} visitor identifiers previously.`,
		entityId: fingerprint,
		entityLabel: label,
		subjectKey: `error:${fingerprint}`,
	};
}

function errorBehaviorSignal(params: {
	behavior: RouteContinuationComparison;
	currentRow: Record<string, unknown>;
	detectedAt: string;
	fingerprint: string;
	previousRow: Record<string, unknown> | undefined;
}): DetectedSignal {
	const material = hasMaterialRouteContinuation(params.behavior);
	return {
		...errorCountSignal(
			errorLabel(params.currentRow ?? params.previousRow),
			params.fingerprint,
			params.currentRow,
			params.previousRow,
			params.detectedAt
		),
		cohortMeasurement: matchedErrorContinuationMeasurement(params.behavior),
		deltaPercent: 0,
		direction: material ? "up" : "down",
		method: "behavior",
		severity: material
			? params.behavior.exposedSessions >= 100 &&
				params.behavior.percentagePointDifference <= -30
				? "critical"
				: "warning"
			: "info",
	};
}

interface ErrorBehaviorCandidate {
	currentRow: Record<string, unknown>;
	fingerprint: string;
	previousRow: Record<string, unknown> | undefined;
}
function errorBehaviorCandidates(params: {
	currentByFingerprint: Map<string, Record<string, unknown>>;
	detectedAt: string;
	previousByFingerprint: Map<string, Record<string, unknown>>;
}): ErrorBehaviorCandidate[] {
	const candidates = [...params.currentByFingerprint.entries()]
		.filter(
			([, row]) =>
				numberField(row, "sessions") >= MIN_ERROR_BEHAVIOR_CANDIDATE_SESSIONS
		)
		.map(([fingerprint, currentRow]) => ({
			currentRow,
			fingerprint,
			previousRow: params.previousByFingerprint.get(fingerprint),
		}))
		.sort(
			(left, right) =>
				numberField(right.currentRow, "sessions") -
					numberField(left.currentRow, "sessions") ||
				numberField(right.currentRow, "users") -
					numberField(left.currentRow, "users") ||
				numberField(right.currentRow, "count") -
					numberField(left.currentRow, "count") ||
				left.fingerprint.localeCompare(right.fingerprint)
		);
	if (candidates.length <= MAX_ERROR_BEHAVIOR_COMPARISONS) {
		return candidates;
	}
	const alwaysProbe = candidates.slice(0, MAX_ERROR_BEHAVIOR_COMPARISONS - 1);
	const rotatingCandidates = candidates.slice(alwaysProbe.length);
	const week = Math.floor(
		Date.parse(`${params.detectedAt}T00:00:00.000Z`) / (7 * 24 * 60 * 60 * 1000)
	);
	const rotating = rotatingCandidates[week % rotatingCandidates.length];
	if (!rotating) {
		throw new Error(
			`Error behavior detection needs a valid detectedAt date, got ${params.detectedAt}.`
		);
	}
	return [...alwaysProbe, rotating];
}

async function detectErrorBehaviorSignals(params: {
	abortSignal?: AbortSignal;
	candidates: ErrorBehaviorCandidate[];
	detectedAt: string;
	query: (fingerprint: string) => Promise<Record<string, unknown>[]>;
	websiteId: string;
}): Promise<DetectedSignal[]> {
	const results = await Promise.allSettled(
		params.candidates.map(async (candidate) => ({
			candidate,
			comparison: parseRouteContinuationComparison(
				(await params.query(candidate.fingerprint))[0]
			),
		}))
	);
	const signals: DetectedSignal[] = [];
	for (const result of results) {
		if (result.status === "rejected") {
			rethrowDetectionAbort(result.reason, params.abortSignal);
			emitInsightsEvent("warn", "detection.error_behavior.comparison_failed", {
				website_id: params.websiteId,
				error_type:
					result.reason instanceof Error
						? result.reason.constructor.name
						: typeof result.reason,
			});
			continue;
		}
		if (
			!(
				result.value.comparison &&
				hasMaterialRouteContinuation(result.value.comparison)
			)
		) {
			continue;
		}
		signals.push(
			errorBehaviorSignal({
				behavior: result.value.comparison,
				currentRow: result.value.candidate.currentRow,
				detectedAt: params.detectedAt,
				fingerprint: result.value.candidate.fingerprint,
				previousRow: result.value.candidate.previousRow,
			})
		);
	}
	return signals;
}

const customEventCounts = z.object({
	total_events: countSchema,
	unique_users: countSchema,
	unique_sessions: countSchema,
});

function makeCustomEventSignal(
	name: string,
	currentRow: Record<string, unknown> | undefined,
	previousRow: Record<string, unknown> | undefined,
	detectedAt: string,
	metric: "custom_event_count" | "custom_event_reach" = "custom_event_count",
	subjectKey = `${metric === "custom_event_count" ? "custom_event" : metric}:${name}`
): DetectedSignal | null {
	const empty = { total_events: 0, unique_users: 0, unique_sessions: 0 };
	const current = customEventCounts.safeParse(currentRow ?? empty);
	const previous = customEventCounts.safeParse(previousRow ?? empty);
	if (!(current.success && previous.success)) {
		return null;
	}
	const field =
		metric === "custom_event_reach" ? "unique_users" : "total_events";
	const label = normalizedLabel(name);
	const signal = capLowReachSeverity(
		makeWowSignal(
			metric,
			metric === "custom_event_reach" ? `${label} recorded visitors` : label,
			current.data[field],
			previous.data[field],
			detectedAt
		),
		Math.max(previous.data.unique_users, previous.data.unique_sessions)
	);

	signal.subjectKey = subjectKey;
	signal.entityId = name;
	signal.entityLabel = label;
	signal.definitionEvidence = `Event "${label}" occurred ${current.data.total_events} times across ${current.data.unique_users} recorded visitor identifiers and ${current.data.unique_sessions} sessions, compared with ${previous.data.total_events} occurrences across ${previous.data.unique_users} recorded visitor identifiers and ${previous.data.unique_sessions} sessions previously.`;
	if (metric === "custom_event_reach") {
		signal.investigationObjective =
			"Explain the measured recorded-participation change alongside occurrence volume. Nonzero unique_users still measures recorded visitor identifiers; unavailable emitter context does not invalidate it or establish instrumentation failure. Claim identity-coverage loss only with evidence of missing identifiers, not fewer identifiers. Leave causes unknown without inspected support. Event names alone do not establish behavior, business outcomes or conversion rates; recorded identifiers are not people.";
	}
	return signal;
}

export function safeDeltaPercent(current: number, previous: number): number {
	if (previous === 0) {
		return current === 0 ? 0 : 100;
	}
	return ((current - previous) / previous) * 100;
}

function isWeekend(dateStr: string): boolean {
	const day = dayjs(dateStr).day();
	return day === 0 || day === 6;
}

export function numberField(
	row: Record<string, unknown> | undefined,
	key: string
): number {
	const value = Number(row?.[key] ?? 0);
	return Number.isFinite(value) ? value : 0;
}

export function stringField(
	row: Record<string, unknown> | undefined,
	key: string
): string | null {
	const value = row?.[key];
	return typeof value === "string" && value ? value : null;
}

function mapRowsByStringField(
	rows: Record<string, unknown>[],
	key: string
): Map<string, Record<string, unknown>> {
	const mapped = new Map<string, Record<string, unknown>>();
	for (const row of rows) {
		const value = stringField(row, key);
		if (value) {
			mapped.set(value, row);
		}
	}
	return mapped;
}

function densifyDailyHistory(
	rows: Record<string, unknown>[],
	from: string,
	to: string
): Record<string, unknown>[] {
	const byDate = new Map<string, Record<string, unknown>>();
	for (const row of rows) {
		const date = String(row.date ?? "").slice(0, 10);
		if (date >= from && date <= to) {
			byDate.set(date, row);
		}
	}

	const dense: Record<string, unknown>[] = [];
	let date = dayjs.utc(from);
	const end = dayjs.utc(to);
	while (!date.isAfter(end, "day")) {
		const key = date.format("YYYY-MM-DD");
		dense.push(
			byDate.get(key) ?? {
				date: key,
				bounce_rate: 0,
				median_session_duration: 0,
				pageviews: 0,
				sessions: 0,
				visitors: 0,
			}
		);
		date = date.add(1, "day");
	}
	return dense;
}

function weeklySessionVolume(
	rows: Record<string, unknown>[],
	windowDays: number
): number {
	const recent = rows.slice(-windowDays);
	const sessions = recent.reduce(
		(sum, row) => sum + numberField(row, "sessions"),
		0
	);
	return (sessions / Math.max(1, windowDays)) * 7;
}

function assignSeverity(
	zScore: number | undefined,
	deltaPercent: number,
	improvement: boolean
): "critical" | "warning" | "info" {
	const absZ = zScore === undefined ? 0 : Math.abs(zScore);
	const absD = Math.abs(deltaPercent);
	if (!improvement && (absZ >= 3.5 || absD >= 60)) {
		return "critical";
	}
	if (absZ >= 3.0 || absD >= 50) {
		return "warning";
	}
	return "info";
}

export type QueryFn = typeof executeQuery;
export async function remeasureMetricSignal(
	params: DetectSignalsParams,
	prior: InvestigationSignal,
	queryFn: QueryFn = executeQuery,
	today: dayjs.Dayjs = params.timezone ? dayjs().tz(params.timezone) : dayjs(),
	abortSignal?: AbortSignal
): Promise<DetectedSignal | null> {
	const { currentFrom, currentTo, previousFrom, previousTo } = wowWindow(
		today,
		params.lookbackDays
	);
	const query = (
		type: string,
		from: string,
		to: string,
		filters?: { field: string; op: "eq"; value: string }[]
	) =>
		queryFn(
			{
				projectId: params.websiteId,
				type,
				from,
				to,
				timezone: params.timezone,
				...(filters ? { filters } : {}),
			},
			undefined,
			params.timezone,
			abortSignal
		);
	const readPair = (
		family: "custom_events" | "errors" | "revenue" | "summary" | "vitals",
		type: string,
		filters?: { field: string; op: "eq"; value: string }[]
	) =>
		readDetectorPair({
			abortSignal,
			current: () => query(type, currentFrom, currentTo, filters),
			family,
			previous: () => query(type, previousFrom, previousTo, filters),
			websiteId: params.websiteId,
		});

	const summaryMetric = ANOMALY_METRICS.find(
		(metric) => metric.key === prior.signalKey
	);
	if (summaryMetric) {
		const pair = await readPair("summary", "summary_metrics");
		if (!pair.value) {
			return null;
		}
		const [currentRows, previousRows] = pair.value;
		if (
			SESSION_DERIVED_METRICS.has(summaryMetric.key) &&
			(numberField(currentRows[0], "sessions") === 0 ||
				numberField(previousRows[0], "sessions") === 0)
		) {
			return null;
		}
		return makeWowSignal(
			summaryMetric.key,
			prior.metric.label,
			numberField(currentRows[0], summaryMetric.summaryField),
			numberField(previousRows[0], summaryMetric.summaryField),
			currentTo
		);
	}

	if (prior.signalKey.startsWith("error:")) {
		const fingerprint = prior.entity.id;
		const pair = await readPair("errors", "error_fingerprints", [
			{ field: "message", op: "eq", value: fingerprint },
		]);
		if (!pair.value) {
			return null;
		}
		const [currentRows, previousRows] = pair.value;
		const currentRow = currentRows[0];
		const previousRow = previousRows[0];
		const countSignal = () => ({
			...errorCountSignal(
				prior.entity.label || prior.metric.label,
				fingerprint,
				currentRow,
				previousRow,
				currentTo
			),
			subjectKey: prior.signalKey,
		});
		if (prior.cohortMeasurement) {
			if (!currentRow) {
				return countSignal();
			}
			const continuationRows = await query(
				"error_route_continuation_comparison",
				currentFrom,
				currentTo,
				[{ field: "message", op: "eq", value: fingerprint }]
			);
			const behavior = parseRouteContinuationComparison(continuationRows[0]);
			if (behavior) {
				return errorBehaviorSignal({
					behavior,
					currentRow,
					detectedAt: currentTo,
					fingerprint,
					previousRow,
				});
			}
			return null;
		}
		return countSignal();
	}

	if (
		prior.signalKey.startsWith("custom_event:") ||
		prior.signalKey.startsWith("custom_event_reach:")
	) {
		const name = prior.entity.id;
		const pair = await readPair("custom_events", "custom_events", [
			{ field: "event_name", op: "eq", value: name },
		]);
		if (!pair.value) {
			return null;
		}
		const [currentRows, previousRows] = pair.value;
		return makeCustomEventSignal(
			name,
			currentRows[0],
			previousRows[0],
			currentTo,
			prior.signalKey.startsWith("custom_event_reach:")
				? "custom_event_reach"
				: "custom_event_count",
			prior.signalKey
		);
	}

	if (prior.signalKey.startsWith("product_revenue:")) {
		const [, currency, provider, selector] = prior.signalKey.split(":");
		const key = `product_revenue:${currency}:${provider}:product_name:${encodeURIComponent(prior.entity.id)}`;
		if (
			normalizeCurrencyCode(currency) !== currency ||
			selector !== "product_name" ||
			!provider ||
			!prior.entity.id ||
			signalKeyForDetectedSignal({
				metric: "product_revenue",
				subjectKey: key,
			}) !== prior.signalKey
		) {
			return null;
		}
		const currencyFilter = {
			field: "currency",
			op: "eq",
			value: currency,
		} as const;
		const [product, whole] = await Promise.all([
			readPair("revenue", "revenue_by_product", [
				currencyFilter,
				{ field: "provider", op: "eq", value: provider },
				{ field: "product_name", op: "eq", value: prior.entity.id },
				{ field: "product_id", op: "eq", value: "" },
			]),
			readPair("revenue", "revenue_overview", [currencyFilter]),
		]);
		if (!(product.value && whole.value)) {
			return null;
		}
		const [current, previous] = product.value.map((rows) =>
			productRevenueRows(rows).get(key)
		);
		const [currentWhole, previousWhole] = whole.value.map((rows) => {
			const [row, ...others] = rows.filter(
				(entry) => entry.currency === currency
			);
			return others.length === 0 ? row : undefined;
		});
		return current && previous && currentWhole && previousWhole
			? makeProductRevenueSignal(
					current,
					previous,
					currentWhole,
					previousWhole,
					currentTo,
					false
				)
			: null;
	}

	if (
		["revenue", "refund_amount", "attribution_rate"].some((metric) =>
			prior.signalKey.startsWith(`${metric}:`)
		)
	) {
		const [metric, currency] = prior.signalKey.split(":");
		if (normalizeCurrencyCode(currency) !== currency) {
			return null;
		}
		const pair = await readPair("revenue", "revenue_overview", [
			{ field: "currency", op: "eq", value: currency },
		]);
		if (!pair.value) {
			return null;
		}
		const [currentRows, previousRows] = pair.value;
		const current = mapRowsByStringField(currentRows, "currency").get(currency);
		const previous = mapRowsByStringField(previousRows, "currency").get(
			currency
		);
		// An absent currency is not a measured zero; unscoped legacy signals are inconclusive.
		return current && previous
			? metric === "revenue"
				? makeRevenueSignal(currency, current, previous, currentTo)
				: (commercialSignals(
						currency,
						current,
						previous,
						currentTo,
						false
					).find((signal) => signal.metric === metric) ?? null)
			: null;
	}

	const vital =
		prior.signalKey === "lcp" ? INSIGHT_VITALS.LCP : INSIGHT_VITALS.INP;
	if (prior.signalKey === "lcp" || prior.signalKey === "inp") {
		const pair = await readPair("vitals", "vitals_overview");
		if (!pair.value) {
			return null;
		}
		const [currentRows, previousRows] = pair.value;
		const metricName = prior.signalKey.toUpperCase();
		const currentRow = mapRowsByStringField(currentRows, "metric_name").get(
			metricName
		);
		const previousRow = mapRowsByStringField(previousRows, "metric_name").get(
			metricName
		);
		const current = numberField(currentRow, "p75");
		const baseline = numberField(previousRow, "p75");
		const currentSamples = numberField(currentRow, "samples");
		const baselineSamples = numberField(previousRow, "samples");
		if (
			currentSamples < VITALS_MIN_SAMPLES ||
			baselineSamples < VITALS_MIN_SAMPLES ||
			current <= 0 ||
			baseline <= 0 ||
			current > vital.maxPlausible ||
			baseline > vital.maxPlausible
		) {
			return null;
		}
		if (
			prior.signalKey === "lcp" &&
			!hasMaterialVitalChange(current, baseline, vital.badThreshold) &&
			!hasPersistentPoorLcp(current, baseline, currentSamples, baselineSamples)
		) {
			return null;
		}
		return makeWowSignal(
			prior.signalKey,
			prior.metric.label,
			current,
			baseline,
			currentTo
		);
	}

	return null;
}

interface DetectorFamilyResult<T> {
	failed: boolean;
	value: T | null;
}

export function rethrowDetectionAbort(
	error: unknown,
	abortSignal?: AbortSignal
): void {
	if (abortSignal?.aborted) {
		throw abortSignal.reason ?? error;
	}
	if (error instanceof Error && error.name === "AbortError") {
		throw error;
	}
}

async function readDetectorFamily<T>(params: {
	abortSignal?: AbortSignal;
	family:
		| "custom_events"
		| "errors"
		| "history"
		| "revenue"
		| "summary"
		| "vitals";
	read: () => Promise<T>;
	websiteId: string;
}): Promise<DetectorFamilyResult<T>> {
	try {
		return { failed: false, value: await params.read() };
	} catch (firstError) {
		rethrowDetectionAbort(firstError, params.abortSignal);
		await new Promise((resolve) =>
			setTimeout(resolve, DETECTOR_RETRY_DELAY_MS)
		);
		params.abortSignal?.throwIfAborted();
		try {
			return { failed: false, value: await params.read() };
		} catch (error) {
			rethrowDetectionAbort(error, params.abortSignal);
			emitInsightsEvent("warn", "generation.detection.metric_family_failed", {
				website_id: params.websiteId,
				metric_family: params.family,
				error_type:
					error instanceof Error ? error.constructor.name : typeof error,
			});
			return { failed: true, value: null };
		}
	}
}

async function readDetectorPair<T>(params: {
	abortSignal?: AbortSignal;
	current: () => Promise<T>;
	family: "custom_events" | "errors" | "revenue" | "summary" | "vitals";
	previous: () => Promise<T>;
	websiteId: string;
}): Promise<DetectorFamilyResult<[T, T]>> {
	const [current, previous] = await Promise.all([
		readDetectorFamily({
			abortSignal: params.abortSignal,
			family: params.family,
			read: params.current,
			websiteId: params.websiteId,
		}),
		readDetectorFamily({
			abortSignal: params.abortSignal,
			family: params.family,
			read: params.previous,
			websiteId: params.websiteId,
		}),
	]);
	return {
		failed: current.failed || previous.failed,
		value:
			current.value === null || previous.value === null
				? null
				: [current.value, previous.value],
	};
}

export async function detectSignals(
	params: DetectSignalsParams,
	queryFn: QueryFn = executeQuery,
	today: dayjs.Dayjs = params.timezone ? dayjs().tz(params.timezone) : dayjs(),
	abortSignal?: AbortSignal,
	diagnostics?: DetectionDiagnostics
): Promise<DetectedSignal[]> {
	const { websiteId, lookbackDays, timezone } = params;

	const lastCompleteDay = today.subtract(1, "day");
	const dailyHistoryDays = Math.max(lookbackDays, ZSCORE_HISTORY_DAYS);
	const dailyFrom = lastCompleteDay
		.subtract(dailyHistoryDays - 1, "day")
		.format("YYYY-MM-DD");
	const dailyTo = lastCompleteDay.format("YYYY-MM-DD");

	const history = await readDetectorFamily({
		abortSignal,
		family: "history",
		websiteId,
		read: () =>
			queryFn(
				{
					projectId: websiteId,
					type: "events_by_date",
					from: dailyFrom,
					to: dailyTo,
					timezone,
					timeUnit: "day",
					limit: dailyHistoryDays + 5,
				},
				undefined,
				timezone,
				abortSignal
			),
	});
	const sorted = history.failed
		? []
		: densifyDailyHistory(history.value ?? [], dailyFrom, dailyTo);
	const zscoreSignals = history.failed ? [] : detectZscore(sorted);

	const baselineRows = sorted.slice(0, -1);
	const wowThresholds = new Map<string, number>();
	for (const metric of ANOMALY_METRICS) {
		const dailyValues = baselineRows.map((row) =>
			numberField(row, metric.dailyField)
		);
		wowThresholds.set(
			metric.key,
			adaptiveWowThreshold(dailyValues, WOW_TRAFFIC_THRESHOLD)
		);
	}

	const wow = await detectWow(
		params,
		today,
		queryFn,
		wowThresholds,
		abortSignal
	);
	if (diagnostics) {
		diagnostics.failedFamilies = (history.failed ? 1 : 0) + wow.failedFamilies;
	}
	const freshSignals = history.failed
		? []
		: await detectFreshBreaks({
				abortSignal,
				customEventNames: wow.customEventNames,
				history: sorted,
				query: (type, options = {}) =>
					queryFn(
						{
							from: dailyFrom,
							projectId: websiteId,
							timezone,
							to: dailyTo,
							type,
							...options,
						},
						undefined,
						timezone,
						abortSignal
					),
				websiteId,
			});

	const wowDirection = new Map<string, "up" | "down">();
	for (const s of wow.signals) {
		wowDirection.set(s.subjectKey ?? s.metric, s.direction);
	}
	const reconciledZscore = [...zscoreSignals, ...freshSignals].filter((s) => {
		const wow = wowDirection.get(s.subjectKey ?? s.metric);
		return wow === undefined || wow === s.direction;
	});

	const all = [...reconciledZscore, ...wow.signals];

	const bySubject = new Map<string, DetectedSignal>();
	for (const signal of all) {
		const key = signal.subjectKey ?? signal.metric;
		const prev = bySubject.get(key);
		if (
			!prev ||
			(signal.method === "behavior" && prev.method !== "behavior") ||
			(signal.method === "wow" &&
				prev.method === "zscore" &&
				Math.abs(prev.deltaPercent) < 1.5 * Math.abs(signal.deltaPercent)) ||
			(signal.method === prev.method &&
				Math.abs(signal.deltaPercent) > Math.abs(prev.deltaPercent))
		) {
			bySubject.set(key, signal);
		}
	}

	const weeklySessions = Math.max(
		weeklySessionVolume(sorted, Math.max(3, lookbackDays)),
		wow.weeklySessions
	);

	const filtered = [...bySubject.values()].filter(
		(signal) =>
			passesImpactFilter(signal) &&
			passesLowTrafficFloor(signal, weeklySessions)
	);

	return collapseCorrelated(filtered).sort(
		(a, b) => Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent)
	);
}

function collapseCorrelated(signals: DetectedSignal[]): DetectedSignal[] {
	const up = signals.filter((s) => s.direction === "up");
	const down = signals.filter((s) => s.direction === "down");

	const collapseTraffic = (group: DetectedSignal[]): DetectedSignal[] => {
		const traffic = group.filter((s) => TRAFFIC_METRICS.has(s.metric));
		const nonTraffic = group.filter((s) => !TRAFFIC_METRICS.has(s.metric));
		if (traffic.length < 2) {
			return group;
		}
		const strongest = traffic.reduce((best, s) =>
			Math.abs(s.deltaPercent) > Math.abs(best.deltaPercent) ? s : best
		);
		return [strongest, ...nonTraffic];
	};

	const collapsedUp = collapseTraffic(up);
	const collapsedDown = collapseTraffic(down);
	return [...collapsedUp, ...collapsedDown];
}

function detectZscore(sorted: Record<string, unknown>[]): DetectedSignal[] {
	const latest = sorted.at(-1);
	if (!latest) {
		return [];
	}

	const latestDate = String(latest.date ?? "");
	const latestIsWeekend = isWeekend(latestDate);
	const baselineAll = sorted.slice(0, -1);

	const baseline = baselineAll.filter((row) => {
		const rowIsWeekend = isWeekend(String(row.date ?? ""));
		return latestIsWeekend === rowIsWeekend;
	});

	if (baseline.length < ZSCORE_MIN_BASELINE) {
		return [];
	}

	const signals: DetectedSignal[] = [];

	for (const metric of ANOMALY_METRICS) {
		if (
			SESSION_DERIVED_METRICS.has(metric.key) &&
			numberField(latest, "sessions") < ZSCORE_MIN_DAY_SESSIONS
		) {
			continue;
		}
		const comparableRows = baseline.filter(
			(row) =>
				!SESSION_DERIVED_METRICS.has(metric.key) ||
				numberField(row, "sessions") > 0
		);
		const baselineValues = comparableRows.map((row) =>
			numberField(row, metric.dailyField)
		);

		if (baselineValues.length < ZSCORE_MIN_BASELINE) {
			continue;
		}

		const baselineMedian = median(baselineValues);
		const baselineMad = mad(baselineValues);
		const scaledMad = baselineMad * MAD_SCALE;
		if (scaledMad === 0) {
			continue;
		}

		const currentValue = numberField(latest, metric.dailyField);
		const zScore = (currentValue - baselineMedian) / scaledMad;
		if (Math.abs(zScore) < ZSCORE_THRESHOLD) {
			continue;
		}

		const delta = safeDeltaPercent(currentValue, baselineMedian);
		const direction: "up" | "down" =
			currentValue > baselineMedian ? "up" : "down";

		signals.push({
			metric: metric.key,
			label: metric.label,
			method: "zscore",
			baselineDates: comparableRows.map((row) => String(row.date ?? "")),
			direction,
			current: currentValue,
			baseline: baselineMedian,
			deltaPercent: Number(delta.toFixed(2)),
			severity: assignSeverity(
				zScore,
				delta,
				isImprovement(metric.key, currentValue, baselineMedian)
			),
			detectedAt: latestDate,
		});
	}

	return signals;
}

interface DailyPoint {
	date: string;
	value: number;
}

function comparableDays(points: DailyPoint[]) {
	const latest = points.at(-1);
	if (!latest) {
		return null;
	}
	const weekend = isWeekend(latest.date);
	const comparable = points
		.slice(0, -1)
		.filter((point) => isWeekend(point.date) === weekend);
	if (comparable.length < ZSCORE_MIN_BASELINE) {
		return null;
	}
	const values = comparable.map((point) => point.value);
	return {
		dates: comparable.map((point) => point.date),
		latest,
		median: median(values),
		spread: mad(values) * MAD_SCALE,
		weekend,
	};
}

function dailySeries<T>(
	rows: Record<string, unknown>[],
	entityOf: (row: Record<string, unknown>) => string | null,
	read: (row: Record<string, unknown>) => T | null
): Map<string, Map<string, T>> {
	const series = new Map<string, Map<string, T>>();
	const unreadable = new Set<string>();
	for (const row of rows) {
		const entity = entityOf(row);
		if (!entity) {
			continue;
		}
		const value = read(row);
		if (value === null) {
			unreadable.add(entity);
			continue;
		}
		const days = series.get(entity) ?? new Map<string, T>();
		days.set(String(row.date ?? "").slice(0, 10), value);
		series.set(entity, days);
	}
	for (const entity of unreadable) {
		series.delete(entity);
	}
	return series;
}

function comparableWindow(
	days: NonNullable<ReturnType<typeof comparableDays>>
) {
	return `the ${days.dates.length} comparable ${days.weekend ? "weekend" : "weekday"} days from ${days.dates[0]} to ${days.dates.at(-1)}`;
}

export function freshRevenueSignals(
	rows: Record<string, unknown>[],
	dates: string[]
): DetectedSignal[] {
	const byCurrency = dailySeries(
		rows,
		(row) => {
			const currency = stringField(row, "currency");
			return currency && normalizeCurrencyCode(currency) === currency
				? currency
				: null;
		},
		(row) => {
			const revenue = commercialNumberSchema.safeParse(row.revenue);
			const transactions = countSchema.safeParse(row.transactions);
			return revenue.success && transactions.success && revenue.data >= 0
				? { revenue: revenue.data, transactions: transactions.data }
				: null;
		}
	);
	const signals: DetectedSignal[] = [];
	for (const [currency, days] of byCurrency) {
		const points = dates.map((date) => ({
			date,
			...(days.get(date) ?? { revenue: 0, transactions: 0 }),
		}));
		const revenue = comparableDays(
			points.map((point) => ({ date: point.date, value: point.revenue }))
		);
		const transactions = comparableDays(
			points.map((point) => ({ date: point.date, value: point.transactions }))
		);
		if (
			!(revenue && transactions) ||
			revenue.median <= 0 ||
			transactions.median < FRESH_MIN_BASELINE_TRANSACTIONS
		) {
			continue;
		}
		const current = revenue.latest.value;
		const deltaPercent = safeDeltaPercent(current, revenue.median);
		const zScore =
			(current - revenue.median) /
			Math.max(revenue.spread, revenue.median * 0.1);
		const transactionScore =
			(transactions.latest.value - transactions.median) /
			Math.sqrt(transactions.median);
		if (
			Math.abs(zScore) < FRESH_ZSCORE_THRESHOLD ||
			Math.abs(transactionScore) < 3 ||
			Math.sign(transactionScore) !== Math.sign(zScore) ||
			Math.abs(deltaPercent) < FRESH_MIN_CHANGE_PERCENT ||
			Math.abs(current - revenue.median) < REVENUE_MIN_ABSOLUTE_CHANGE
		) {
			continue;
		}
		const direction = current < revenue.median ? "down" : "up";
		const severity = assignSeverity(zScore, deltaPercent, direction === "up");
		signals.push({
			metric: "revenue",
			label: `${currency} gross revenue`,
			method: "zscore",
			baselineDates: revenue.dates,
			direction,
			current,
			baseline: revenue.median,
			deltaPercent: round2(deltaPercent),
			severity:
				direction === "down" && severity === "info" ? "warning" : severity,
			detectedAt: revenue.latest.date,
			subjectKey: `revenue:${currency}`,
			investigationObjective: REVENUE_OBJECTIVE,
			definitionEvidence: `Business meaning: gross revenue from completed payments in ${currency}, excluding refunds. On ${revenue.latest.date} it was ${current.toLocaleString("en-US")} across ${transactions.latest.value} payments, against a median of ${revenue.median.toLocaleString("en-US")} across ${transactions.median} payments on ${comparableWindow(revenue)}. Confirm with revenue_time_series for this currency on those dates.`,
		});
	}
	return signals;
}

export function freshCustomEventSignals(
	rows: Record<string, unknown>[],
	dates: string[],
	sessions: number[]
): DetectedSignal[] {
	const latestSessions = sessions.at(-1) ?? 0;
	if (latestSessions <= 0) {
		return [];
	}
	const byName = dailySeries(
		rows,
		(row) => stringField(row, "event_name"),
		(row) => {
			const total = countSchema.safeParse(row.total_events);
			return total.success ? total.data : null;
		}
	);
	const signals: DetectedSignal[] = [];
	for (const [name, days] of byName) {
		const points = dates.map((date) => ({ date, value: days.get(date) ?? 0 }));
		const counts = comparableDays(points);
		if (!counts || counts.median < FRESH_MIN_BASELINE_EVENTS) {
			continue;
		}
		const current = counts.latest.value;
		const deltaPercent = safeDeltaPercent(current, counts.median);
		const zScore =
			(current - counts.median) /
			Math.max(counts.spread, Math.sqrt(counts.median));
		const comparable = new Set(counts.dates);
		const baselineRates = points.flatMap((point, index) => {
			const daySessions = sessions[index] ?? 0;
			return comparable.has(point.date) && daySessions > 0
				? [point.value / daySessions]
				: [];
		});
		const rate = current / latestSessions;
		const baselineRate = median(baselineRates);
		if (
			zScore > -FRESH_ZSCORE_THRESHOLD ||
			deltaPercent > -CUSTOM_EVENT_DROP_THRESHOLD ||
			baselineRates.length < ZSCORE_MIN_BASELINE ||
			!(baselineRate > 0) ||
			safeDeltaPercent(rate, baselineRate) > -CUSTOM_EVENT_DROP_THRESHOLD
		) {
			continue;
		}
		const label = normalizedLabel(name);
		signals.push({
			metric: "custom_event_count",
			label,
			method: "zscore",
			baselineDates: counts.dates,
			direction: "down",
			current,
			baseline: counts.median,
			deltaPercent: round2(deltaPercent),
			severity: assignSeverity(zScore, deltaPercent, false),
			detectedAt: counts.latest.date,
			subjectKey: `custom_event:${name}`,
			entityId: name,
			entityLabel: label,
			definitionEvidence: `Event "${label}" occurred ${current} times on ${counts.latest.date} (${round2(rate)} per session), against a median of ${counts.median} (${round2(baselineRate)} per session) on ${comparableWindow(counts)}.`,
		});
	}
	return signals;
}

async function detectFreshBreaks(params: {
	abortSignal?: AbortSignal;
	customEventNames: string[];
	history: Record<string, unknown>[];
	query: (
		type: string,
		options?: { filters?: Filter[]; limit?: number }
	) => Promise<Record<string, unknown>[]>;
	websiteId: string;
}): Promise<DetectedSignal[]> {
	const dates = params.history.map((row) =>
		String(row.date ?? "").slice(0, 10)
	);
	const sessions = params.history.map((row) => numberField(row, "sessions"));
	const tracked = params.customEventNames.slice(
		0,
		Math.floor((MAX_QUERY_ROWS - 1) / Math.max(1, dates.length))
	);
	const eventLimit = tracked.length * dates.length + 1;
	const [revenue, events] = await Promise.all([
		readDetectorFamily({
			abortSignal: params.abortSignal,
			family: "revenue",
			read: () => params.query("revenue_time_series"),
			websiteId: params.websiteId,
		}),
		tracked.length === 0
			? null
			: readDetectorFamily({
					abortSignal: params.abortSignal,
					family: "custom_events",
					read: () =>
						params.query("custom_events_trends_by_event", {
							filters: [
								{
									field: "event_name",
									op: "in",
									value: tracked,
								},
							],
							limit: eventLimit,
						}),
					websiteId: params.websiteId,
				}),
	]);
	return [
		...(revenue.value ? freshRevenueSignals(revenue.value, dates) : []),
		...(events?.value && events.value.length < eventLimit
			? freshCustomEventSignals(events.value, dates, sessions)
			: []),
	];
}

async function detectWow(
	params: DetectSignalsParams,
	today: dayjs.Dayjs,
	queryFn: QueryFn,
	wowThresholds: Map<string, number>,
	abortSignal?: AbortSignal
): Promise<{
	customEventNames: string[];
	failedFamilies: number;
	signals: DetectedSignal[];
	weeklySessions: number;
}> {
	const { websiteId, lookbackDays, timezone } = params;
	const { currentFrom, currentTo, previousFrom, previousTo } = wowWindow(
		today,
		lookbackDays
	);

	function query(
		type: string,
		from: string,
		to: string,
		options: { filters?: Filter[]; limit?: number } = {},
		signal = abortSignal
	) {
		return queryFn(
			{
				from,
				projectId: websiteId,
				timezone,
				to,
				type,
				...options,
			},
			undefined,
			timezone,
			signal
		);
	}

	const summary = await readDetectorPair({
		abortSignal,
		current: () => query("summary_metrics", currentFrom, currentTo),
		family: "summary",
		previous: () => query("summary_metrics", previousFrom, previousTo),
		websiteId,
	});
	const errors = await readDetectorPair({
		abortSignal,
		current: () =>
			query("error_fingerprints", currentFrom, currentTo, {
				limit: ERROR_FINGERPRINT_LIMIT,
			}),
		family: "errors",
		previous: () =>
			query("error_fingerprints", previousFrom, previousTo, {
				limit: ERROR_FINGERPRINT_LIMIT,
			}),
		websiteId,
	});
	const revenue = await readDetectorPair({
		abortSignal,
		current: () => query("revenue_overview", currentFrom, currentTo),
		family: "revenue",
		previous: () => query("revenue_overview", previousFrom, previousTo),
		websiteId,
	});
	const vitals = await readDetectorPair({
		abortSignal,
		current: () => query("vitals_overview", currentFrom, currentTo),
		family: "vitals",
		previous: () => query("vitals_overview", previousFrom, previousTo),
		websiteId,
	});
	const [currentSummary, previousSummary] = summary.value ?? [[], []];
	const [currentErrors, previousErrors] = errors.value ?? [[], []];
	const [currentRevenue, previousRevenue] = revenue.value ?? [[], []];
	const [currentVitals, previousVitals] = vitals.value ?? [[], []];

	const signals: DetectedSignal[] = [];
	const currentSessions = numberField(currentSummary[0], "sessions");
	const previousSessions = numberField(previousSummary[0], "sessions");
	let customEventsFailed = false;
	let customEventNames: string[] = [];
	let currentCustomEvents: Record<string, unknown>[] = [];
	let previousCustomEvents: Record<string, unknown>[] = [];
	if (!(summary.failed || (previousSessions > 0 && currentSessions === 0))) {
		const previous = await readDetectorFamily({
			abortSignal,
			family: "custom_events",
			read: () =>
				query("custom_events", previousFrom, previousTo, { limit: 200 }),
			websiteId,
		});
		customEventsFailed = previous.failed;
		const baselineEvents = previous.value ?? [];
		const names = baselineEvents.flatMap((row) => {
			const name = stringField(row, "name");
			return name ? [name] : [];
		});
		if (!(previous.failed || names.length === 0)) {
			customEventNames = names;
			const current = await readDetectorFamily({
				abortSignal,
				family: "custom_events",
				read: () =>
					query("custom_events", currentFrom, currentTo, {
						filters: [{ field: "event_name", op: "in", value: names }],
						limit: 200,
					}),
				websiteId,
			});
			customEventsFailed = current.failed;
			if (!current.failed) {
				currentCustomEvents = current.value ?? [];
				previousCustomEvents = baselineEvents;
			}
		}
	}

	for (const metric of ANOMALY_METRICS) {
		if (
			SESSION_DERIVED_METRICS.has(metric.key) &&
			(currentSessions === 0 || previousSessions === 0)
		) {
			continue;
		}
		const currentValue = numberField(currentSummary[0], metric.summaryField);
		const previousValue = numberField(previousSummary[0], metric.summaryField);

		if (previousValue === 0) {
			continue;
		}

		const deltaPercent = safeDeltaPercent(currentValue, previousValue);
		const materialVolumeDrop =
			TRAFFIC_METRICS.has(metric.key) &&
			deltaPercent <= -MATERIAL_VOLUME_DROP_PERCENT &&
			previousValue - currentValue >= FILTER_TRAFFIC_MIN_DELTA;
		const threshold = wowThresholds.get(metric.key) ?? WOW_TRAFFIC_THRESHOLD;
		if (!materialVolumeDrop && Math.abs(deltaPercent) < threshold) {
			continue;
		}
		signals.push(
			makeWowSignal(
				metric.key,
				metric.label,
				currentValue,
				previousValue,
				currentTo
			)
		);
	}

	const currentByFingerprint = mapRowsByStringField(currentErrors, "name");
	const previousByFingerprint = mapRowsByStringField(previousErrors, "name");
	// The native query caps each window at 50. Read omitted counterparts before
	// interpreting absence as zero; each filtered set has at most 50 names.
	const errorWindows = [
		[
			currentByFingerprint,
			previousByFingerprint,
			currentErrors,
			currentFrom,
			currentTo,
		],
		[
			previousByFingerprint,
			currentByFingerprint,
			previousErrors,
			previousFrom,
			previousTo,
		],
	] as const;
	const missingFingerprints = errorWindows.map(([window, other, rows]) =>
		rows.length < ERROR_FINGERPRINT_LIMIT
			? []
			: [...other.keys()].filter((name) => !window.has(name))
	);
	const errorCompletionFailures = await Promise.all(
		errorWindows.map(async ([window, , , from, to], index) => {
			const names = missingFingerprints[index] ?? [];
			if (names.length === 0) {
				return false;
			}
			const completed = await readDetectorFamily({
				abortSignal,
				family: "errors",
				read: () =>
					query("error_fingerprints", from, to, {
						filters: [{ field: "message", op: "in", value: names }],
						limit: ERROR_FINGERPRINT_LIMIT,
					}),
				websiteId,
			});
			for (const [name, row] of mapRowsByStringField(
				completed.value ?? [],
				"name"
			)) {
				window.set(name, row);
			}
			return completed.failed;
		})
	);
	if (errorCompletionFailures.some(Boolean)) {
		errors.failed = true;
		currentByFingerprint.clear();
		previousByFingerprint.clear();
	}
	for (const fingerprint of new Set([
		...currentByFingerprint.keys(),
		...previousByFingerprint.keys(),
	])) {
		const currentRow = currentByFingerprint.get(fingerprint);
		const previousRow = previousByFingerprint.get(fingerprint);
		const current = numberField(currentRow, "count");
		const previous = numberField(previousRow, "count");
		const delta = safeDeltaPercent(current, previous);
		if (
			Math.abs(current - previous) < FILTER_ERROR_MIN_DELTA ||
			Math.max(current, previous) < FILTER_ERROR_MIN_PEAK ||
			Math.abs(delta) < WOW_ERROR_THRESHOLD
		) {
			continue;
		}
		const affectedRow = delta > 0 ? currentRow : previousRow;
		const affectedUsers = numberField(affectedRow, "users");
		const sessions = delta > 0 ? currentSessions : previousSessions;
		if (
			!hasMeaningfulErrorImpact(
				affectedUsers,
				sessions > 0
					? (numberField(affectedRow, "sessions") / sessions) * 100
					: 0
			)
		) {
			continue;
		}
		signals.push(
			capLowReachSeverity(
				errorCountSignal(
					errorLabel(affectedRow ?? currentRow ?? previousRow),
					fingerprint,
					currentRow,
					previousRow,
					currentTo
				),
				affectedUsers
			)
		);
	}
	const behaviorSignals = await detectErrorBehaviorSignals({
		abortSignal,
		candidates: errorBehaviorCandidates({
			currentByFingerprint,
			detectedAt: currentTo,
			previousByFingerprint,
		}),
		detectedAt: currentTo,
		query: (fingerprint) =>
			query("error_route_continuation_comparison", currentFrom, currentTo, {
				filters: [{ field: "message", op: "eq", value: fingerprint }],
			}),
		websiteId,
	});
	signals.push(...behaviorSignals);

	const currentByName = mapRowsByStringField(currentCustomEvents, "name");
	for (const previousRow of previousCustomEvents) {
		const name = stringField(previousRow, "name");
		if (!name) {
			continue;
		}
		const currentRow = currentByName.get(name);
		const current = numberField(currentRow, "total_events");
		const previous = numberField(previousRow, "total_events");
		if (current >= previous && currentSessions >= previousSessions) {
			const reach = makeCustomEventSignal(
				name,
				currentRow,
				previousRow,
				currentTo,
				"custom_event_reach"
			);
			if (
				reach &&
				reach.baseline >= SIGNIFICANT_AFFECTED_USERS &&
				reach.deltaPercent <= -CUSTOM_EVENT_DROP_THRESHOLD
			) {
				signals.push(reach);
			}
		}
		const previousReach = Math.max(
			numberField(previousRow, "unique_users"),
			numberField(previousRow, "unique_sessions")
		);
		if (
			previous - current <= 3 * Math.sqrt(previous + current) ||
			previousReach < MIN_AFFECTED_USERS ||
			safeDeltaPercent(current, previous) > -CUSTOM_EVENT_DROP_THRESHOLD
		) {
			continue;
		}
		if (
			currentSessions > 0 &&
			previousSessions > 0 &&
			safeDeltaPercent(current / currentSessions, previous / previousSessions) >
				-CUSTOM_EVENT_DROP_THRESHOLD
		) {
			continue;
		}
		const event = makeCustomEventSignal(
			name,
			currentRow,
			previousRow,
			currentTo
		);
		if (event) {
			signals.push(event);
		}
	}

	const previousCurrencies = mapRowsByStringField(previousRevenue, "currency");
	for (const [currency, current] of mapRowsByStringField(
		currentRevenue,
		"currency"
	)) {
		const previous = previousCurrencies.get(currency);
		if (!previous || normalizeCurrencyCode(currency) !== currency) {
			continue;
		}
		signals.push(...commercialSignals(currency, current, previous, currentTo));
		const signal = makeRevenueSignal(currency, current, previous, currentTo);
		const transactions = Math.max(
			numberField(current, "total_transactions"),
			numberField(previous, "total_transactions")
		);
		if (
			signal &&
			(signal.current > 0 || signal.baseline > 0) &&
			(Math.abs(signal.current - signal.baseline) >=
				REVENUE_MIN_ABSOLUTE_CHANGE ||
				transactions >= REVENUE_MIN_TRANSACTIONS) &&
			Math.abs(safeDeltaPercent(signal.current, signal.baseline)) >=
				WOW_REVENUE_THRESHOLD
		) {
			signals.push(signal);
		}
	}

	// Two bounded discovery reads; a missing top-table row never becomes zero.
	if (
		currentRevenue.some(
			(row) =>
				Math.min(
					numberField(row, "total_transactions"),
					numberField(
						previousCurrencies.get(String(row.currency)),
						"total_transactions"
					)
				) >= 20
		)
	) {
		const probeSignal = AbortSignal.any([
			...(abortSignal ? [abortSignal] : []),
			AbortSignal.timeout(3000),
		]);
		const [currentProbe, previousProbe] = await Promise.allSettled([
			query(
				"revenue_by_product",
				currentFrom,
				currentTo,
				{ limit: 20 },
				probeSignal
			),
			query(
				"revenue_by_product",
				previousFrom,
				previousTo,
				{ limit: 20 },
				probeSignal
			),
		]);
		abortSignal?.throwIfAborted();
		if (
			currentProbe.status === "fulfilled" &&
			previousProbe.status === "fulfilled"
		) {
			const currentRows = productRevenueRows(currentProbe.value);
			const previousRows = productRevenueRows(previousProbe.value);
			const currentWhole = mapRowsByStringField(currentRevenue, "currency");
			const movements: DetectedSignal[] = [];
			for (const [key, current] of currentRows) {
				const previous = previousRows.get(key);
				if (!previous) {
					continue;
				}
				const productSignal = makeProductRevenueSignal(
					current,
					previous,
					currentWhole.get(current.currency),
					previousCurrencies.get(current.currency),
					currentTo
				);
				if (productSignal) {
					movements.push(productSignal);
				}
			}
			// Keep the same covered movement on an identical next run, rather than rotating to its offset.
			const coveredCurrencies = new Map<string, DetectedSignal>();
			movements.sort((a, b) =>
				(a.subjectKey ?? "").localeCompare(b.subjectKey ?? "")
			);
			for (const movement of rankSignals(movements).reverse()) {
				coveredCurrencies.set(
					movement.subjectKey?.split(":")[1] ?? "",
					movement
				);
			}
			signals.push(...coveredCurrencies.values());
		} else {
			emitInsightsEvent(
				"warn",
				"generation.detection.optional_product_unavailable",
				{ website_id: websiteId }
			);
		}
	}

	const vitalsCurrentMap = mapRowsByStringField(currentVitals, "metric_name");
	const vitalsPreviousMap = mapRowsByStringField(previousVitals, "metric_name");

	for (const [metricName, vital] of Object.entries(INSIGHT_VITALS)) {
		const cur = vitalsCurrentMap.get(metricName);
		const prev = vitalsPreviousMap.get(metricName);
		const curVal = numberField(cur, "p75");
		const prevVal = numberField(prev, "p75");
		const curSamples = numberField(cur, "samples");
		const prevSamples = numberField(prev, "samples");

		if (
			curSamples < VITALS_MIN_SAMPLES ||
			prevSamples < VITALS_MIN_SAMPLES ||
			prevVal === 0 ||
			curVal === 0 ||
			curVal > vital.maxPlausible ||
			prevVal > vital.maxPlausible
		) {
			continue;
		}

		const hasMaterialChange = hasMaterialVitalChange(
			curVal,
			prevVal,
			vital.badThreshold
		);
		const isPersistentPoorLcp =
			metricName === "LCP" &&
			hasPersistentPoorLcp(curVal, prevVal, curSamples, prevSamples);
		if (!(hasMaterialChange || isPersistentPoorLcp)) {
			continue;
		}

		const signal = makeWowSignal(
			metricName.toLowerCase(),
			vital.label,
			curVal,
			prevVal,
			currentTo
		);
		if (isPersistentPoorLcp) {
			signal.severity =
				signal.severity === "info" ? "warning" : signal.severity;
			signal.definitionEvidence = `LCP p75 was ${curVal.toLocaleString("en-US")} ms across ${curSamples.toLocaleString("en-US")} samples and remained above the ${PERSISTENT_LCP_POOR_THRESHOLD.toLocaleString("en-US")} ms poor threshold, compared with ${prevVal.toLocaleString("en-US")} ms across ${prevSamples.toLocaleString("en-US")} samples in the prior period.`;
		}
		signals.push(signal);
	}

	return {
		customEventNames,
		failedFamilies:
			[summary, errors, revenue, vitals].filter((result) => result.failed)
				.length + (customEventsFailed ? 1 : 0),
		signals,
		weeklySessions:
			(Math.max(currentSessions, previousSessions) /
				Math.max(3, lookbackDays)) *
			7,
	};
}

const ONSET_BASELINE_DAYS = 14;
const ONSET_MIN_QUASI_LLR = 15;
const ONSET_MIN_RATIO = 1.5;
const ONSET_MAX_SURROUNDING_RATIO = 2;
const ONSET_LOCATION_SLACK = 3;
const ONSET_MAX_SPREAD_HOURS = 3;
const ONSET_MIN_OUTSIDE_HOURS = 6;
const ONSET_MIN_EXPLAINED_SHARE = 0.5;
const ONSET_LOOKBACK_HOURS = 6;
const HOUR_LABEL = "YYYY-MM-DD HH:00:00";

export interface HourlyCount {
	hour: string;
	value: number;
}

export interface OnsetEstimate {
	earliest: number;
	expected: number;
	latest: number;
	observed: number;
	ongoing: boolean;
	recoveredBy: number | null;
}

function poissonTerm(count: number, expected: number): number {
	return count > 0 ? count * Math.log(count / expected) : 0;
}

function hourProfileKey(hour: string): string {
	return `${isWeekend(hour.slice(0, 10)) ? "weekend" : "weekday"}:${hour.slice(11, 13)}`;
}

function hourlyBaseline(baseline: HourlyCount[]) {
	const profile = new Map<string, { hours: number; total: number }>();
	let baselineTotal = 0;
	for (const point of baseline) {
		const key = hourProfileKey(point.hour);
		const entry = profile.get(key) ?? { hours: 0, total: 0 };
		entry.hours += 1;
		entry.total += point.value;
		profile.set(key, entry);
		baselineTotal += point.value;
	}
	const hourlyMean = baseline.length > 0 ? baselineTotal / baseline.length : 0;
	const expectedAt = (hour: string) => {
		if (hourlyMean === 0) {
			return 1;
		}
		const entry = profile.get(hourProfileKey(hour));
		return ((entry?.total ?? 0) + hourlyMean) / ((entry?.hours ?? 0) + 1);
	};
	let pearson = 0;
	for (const point of baseline) {
		const expected = expectedAt(point.hour);
		pearson += (point.value - expected) ** 2 / expected;
	}
	const freedom = baseline.length - profile.size;
	return {
		dispersion:
			hourlyMean > 0 && freedom > 0 ? Math.max(1, pearson / freedom) : 1,
		expectedAt,
		hourlyMean,
	};
}

function runningTotals(
	window: HourlyCount[],
	expectedAt: (hour: string) => number
) {
	const counts = [0];
	const exposure = [0];
	for (const [index, point] of window.entries()) {
		counts.push((counts[index] ?? 0) + point.value);
		exposure.push((exposure[index] ?? 0) + expectedAt(point.hour));
	}
	return {
		countIn: (from: number, to: number) =>
			(counts[to] ?? 0) - (counts[from] ?? 0),
		exposureIn: (from: number, to: number) =>
			(exposure[to] ?? 0) - (exposure[from] ?? 0),
	};
}

export function estimateChangeOnset(params: {
	baseline: HourlyCount[];
	direction: "up" | "down";
	flaggedFrom: number;
	window: HourlyCount[];
}): OnsetEstimate | null {
	const { baseline, direction, flaggedFrom, window } = params;
	const n = window.length;
	if (n <= ONSET_MIN_OUTSIDE_HOURS || flaggedFrom < 0 || flaggedFrom >= n) {
		return null;
	}
	const { dispersion, expectedAt, hourlyMean } = hourlyBaseline(baseline);
	const { countIn, exposureIn } = runningTotals(window, expectedAt);
	const totalCount = countIn(0, n);
	const totalExposure = exposureIn(0, n);
	const nullTerm = poissonTerm(totalCount, totalExposure);
	const span = (from: number, to: number) => {
		const insideCount = countIn(from, to);
		const insideExposure = exposureIn(from, to);
		const outsideCount = totalCount - insideCount;
		const outsideExposure = totalExposure - insideExposure;
		const insideRate = insideCount / insideExposure;
		const outsideRate = outsideCount / outsideExposure;
		const valid =
			n - (to - from) >= ONSET_MIN_OUTSIDE_HOURS &&
			to > flaggedFrom &&
			(direction === "down"
				? insideRate < outsideRate
				: insideRate > outsideRate);
		return {
			insideCount,
			insideExposure,
			insideRate,
			llr: valid
				? poissonTerm(insideCount, insideExposure) +
					poissonTerm(outsideCount, outsideExposure) -
					nullTerm
				: Number.NEGATIVE_INFINITY,
			outsideRate,
		};
	};

	let best = { from: 0, llr: Number.NEGATIVE_INFINITY, to: 0 };
	for (let from = 0; from < n; from++) {
		for (let to = from + 1; to <= n; to++) {
			const { llr } = span(from, to);
			if (llr > best.llr) {
				best = { from, llr, to };
			}
		}
	}
	if (best.llr / dispersion < ONSET_MIN_QUASI_LLR) {
		return null;
	}
	const chosen = span(best.from, best.to);
	const changeRatio =
		direction === "down"
			? chosen.outsideRate / Math.max(chosen.insideRate, Number.MIN_VALUE)
			: chosen.insideRate / Math.max(chosen.outsideRate, Number.MIN_VALUE);
	const departsFromBaseline =
		hourlyMean === 0 ||
		(direction === "down"
			? chosen.insideRate <= 1 / ONSET_MIN_RATIO &&
				chosen.outsideRate <= ONSET_MAX_SURROUNDING_RATIO
			: chosen.insideRate >= ONSET_MIN_RATIO);
	if (changeRatio < ONSET_MIN_RATIO || !departsFromBaseline) {
		return null;
	}

	let flaggedDeviation = 0;
	let explainedDeviation = 0;
	for (let index = flaggedFrom; index < n; index++) {
		const point = window[index];
		if (!point) {
			continue;
		}
		const deviation =
			point.value - (hourlyMean === 0 ? 0 : expectedAt(point.hour));
		flaggedDeviation += deviation;
		if (index >= best.from && index < best.to) {
			explainedDeviation += deviation;
		}
	}
	if (
		flaggedDeviation === 0 ||
		explainedDeviation / flaggedDeviation < ONSET_MIN_EXPLAINED_SHARE
	) {
		return null;
	}

	const floor = best.llr - ONSET_LOCATION_SLACK * dispersion;
	const starts: number[] = [];
	for (let from = 0; from < best.to; from++) {
		if (span(from, best.to).llr >= floor) {
			starts.push(from);
		}
	}
	const earliest = Math.min(...starts);
	const latest = Math.max(...starts);
	if (earliest === 0 || latest - earliest + 1 > ONSET_MAX_SPREAD_HOURS) {
		return null;
	}
	const ends: number[] = [];
	for (let to = best.from + 1; to <= n; to++) {
		if (span(best.from, to).llr >= floor) {
			ends.push(to);
		}
	}
	const lastEnd = Math.max(...ends);
	const endIsSharp =
		lastEnd < n && lastEnd - Math.min(...ends) + 1 <= ONSET_MAX_SPREAD_HOURS;
	return {
		earliest,
		expected: chosen.outsideRate * chosen.insideExposure,
		latest,
		observed: chosen.insideCount,
		ongoing: best.to === n,
		recoveredBy: best.to < n && endIsSharp ? lastEnd : null,
	};
}

type SignalSubject =
	| { kind: "error"; message: string }
	| { kind: "event"; name: string }
	| { kind: "revenue"; currency: string }
	| { kind: "traffic"; metric: string };

function signalSubject(signal: InvestigationSignal): SignalSubject | null {
	if (TRAFFIC_METRICS.has(signal.signalKey)) {
		return { kind: "traffic", metric: signal.signalKey };
	}
	if (signal.signalKey.startsWith("error:") && signal.entity.type === "error") {
		return { kind: "error", message: signal.entity.id };
	}
	if (
		signal.signalKey.startsWith("custom_event:") &&
		signal.entity.type === "event"
	) {
		return { kind: "event", name: signal.entity.id };
	}
	if (signal.signalKey.startsWith("revenue:")) {
		return { kind: "revenue", currency: signal.signalKey.slice(8) };
	}
	return null;
}

interface OnsetSeries {
	field: string;
	filters: Filter[];
	noun: string;
	subject: string;
	type:
		| "custom_events_trends_by_event"
		| "error_trends"
		| "events_by_date"
		| "revenue_time_series";
}

const PAGEVIEW_SERIES: OnsetSeries = {
	field: "pageviews",
	filters: [],
	noun: "pageviews",
	subject: "Hourly pageviews",
	type: "events_by_date",
};

function onsetSeries(subject: SignalSubject): OnsetSeries {
	switch (subject.kind) {
		case "traffic":
			return PAGEVIEW_SERIES;
		case "error":
			return {
				field: "errors",
				filters: [{ field: "message", op: "eq", value: subject.message }],
				noun: "occurrences",
				subject: "Hourly counts of this error",
				type: "error_trends",
			};
		case "revenue":
			return {
				field: "transactions",
				filters: [{ field: "currency", op: "eq", value: subject.currency }],
				noun: "payments",
				subject: "Hourly payments",
				type: "revenue_time_series",
			};
		case "event":
			return {
				field: "total_events",
				filters: [{ field: "event_name", op: "eq", value: subject.name }],
				noun: `${normalizedLabel(subject.name)} events`,
				subject: `Hourly ${normalizedLabel(subject.name)} counts`,
				type: "custom_events_trends_by_event",
			};
		default:
			return subject satisfies never;
	}
}

export interface ChangeOnset {
	direction: "up" | "down";
	earliest: string;
	expected: number;
	latest: string;
	noun: string;
	observed: number;
	ongoingThrough: string | null;
	recoveredBy: string | null;
	subject: string;
	timezone: string;
}

async function readHourlyCounts(params: {
	abortSignal?: AbortSignal;
	from: string;
	query: QueryFn;
	series: OnsetSeries;
	timezone: string;
	to: string;
	websiteId: string;
}): Promise<HourlyCount[]> {
	const { series, timezone } = params;
	const rows = await params.query(
		{
			filters: series.filters,
			from: params.from,
			projectId: params.websiteId,
			timeUnit: "hour",
			timezone,
			to: params.to,
			type: series.type,
		},
		undefined,
		timezone,
		params.abortSignal
	);
	const values = new Map<string, number>();
	for (const row of rows) {
		const hour = stringField(row, "date");
		if (hour) {
			values.set(
				hour,
				(values.get(hour) ?? 0) + numberField(row, series.field)
			);
		}
	}
	const hours: string[] = [];
	const end = dayjs.tz(`${params.to} 23:00`, timezone);
	for (
		let instant = dayjs.tz(`${params.from} 00:00`, timezone);
		!instant.isAfter(end);
		instant = instant.add(1, "hour")
	) {
		const label = instant.tz(timezone).format(HOUR_LABEL);
		if (hours.at(-1) !== label) {
			hours.push(label);
		}
	}
	return hours.map((hour) => ({ hour, value: values.get(hour) ?? 0 }));
}

export async function loadChangeOnset(
	params: {
		abortSignal?: AbortSignal;
		signal: InvestigationSignal;
		timezone: string;
		websiteId: string;
	},
	query: QueryFn = executeQuery
): Promise<ChangeOnset | null> {
	const { signal, timezone } = params;
	const subject = signalSubject(signal);
	const { current, previous } = signal.metric;
	if (!subject || previous === undefined || current === previous) {
		return null;
	}
	const series = onsetSeries(subject);
	const direction = current < previous ? "down" : "up";
	const flaggedFrom = signal.period.current.from;
	const searchFrom = dayjs(flaggedFrom).subtract(1, "day").format("YYYY-MM-DD");
	const baselineFrom = dayjs(searchFrom)
		.subtract(ONSET_BASELINE_DAYS, "day")
		.format("YYYY-MM-DD");
	const lastDay = signal.period.current.to;
	const points = await readHourlyCounts({
		abortSignal: params.abortSignal,
		from: baselineFrom,
		query,
		series,
		timezone,
		to: lastDay,
		websiteId: params.websiteId,
	});
	const windowStart = points.findIndex((point) => point.hour >= searchFrom);
	if (windowStart <= 0) {
		return null;
	}
	const window = points.slice(windowStart);
	const estimate = estimateChangeOnset({
		baseline: points.slice(0, windowStart),
		direction,
		flaggedFrom: window.findIndex((point) => point.hour >= flaggedFrom),
		window,
	});
	if (!estimate) {
		return null;
	}
	const hourAt = (index: number) => window[index]?.hour ?? "";
	return {
		direction,
		earliest: hourAt(estimate.earliest),
		expected: estimate.expected,
		latest: hourAt(estimate.latest),
		noun: series.noun,
		observed: estimate.observed,
		ongoingThrough: estimate.ongoing ? lastDay : null,
		recoveredBy:
			estimate.recoveredBy === null ? null : hourAt(estimate.recoveredBy),
		subject: series.subject,
		timezone,
	};
}

export function changeOnsetWindow(onset: ChangeOnset): {
	from: Date;
	lookbackFrom: Date;
	to: Date;
} {
	const from = dayjs.tz(onset.earliest, onset.timezone);
	return {
		from: from.toDate(),
		lookbackFrom: from.subtract(ONSET_LOOKBACK_HOURS, "hour").toDate(),
		to: dayjs.tz(onset.latest, onset.timezone).add(1, "hour").toDate(),
	};
}

function counted(count: number, noun: string): string {
	const rounded = Math.round(count);
	return `${rounded.toLocaleString("en-US")} ${rounded === 1 && noun.endsWith("s") ? noun.slice(0, -1) : noun}`;
}

function hourRange(from: string, to: string, timezone: string): string {
	const end = dayjs.tz(to, timezone).add(1, "hour").tz(timezone);
	return from.slice(0, 10) === end.format("YYYY-MM-DD")
		? `between ${from.slice(11, 16)} and ${end.format("HH:mm")} on ${from.slice(0, 10)}`
		: `between ${from.slice(0, 16)} and ${end.format("YYYY-MM-DD HH:mm")}`;
}

export function changeOnsetEvidence(onset: ChangeOnset): string {
	const change = onset.direction === "down" ? "drop" : "rise";
	const observed = counted(onset.observed, onset.noun);
	const expected = Math.round(onset.expected).toLocaleString("en-US");
	const start = `${onset.subject} place the start of this ${change} ${hourRange(onset.earliest, onset.latest, onset.timezone)} (${onset.timezone}).`;
	if (onset.recoveredBy) {
		return `${start} It returned to the surrounding rate by ${onset.recoveredBy.slice(0, 16)}. In between there were ${observed} where that rate predicted about ${expected}.`;
	}
	const through = onset.ongoingThrough
		? ` It had not recovered by the end of ${onset.ongoingThrough}.`
		: "";
	return `${start} From then on there were ${observed} where the earlier rate predicted about ${expected}.${through}`;
}

const SHARED_START_GAP_HOURS = 1;
const SHARED_START_NAME_LENGTH = 120;
const EVIDENCE_MAX_LENGTH = 500;

function subjectName(subject: SignalSubject): string {
	switch (subject.kind) {
		case "traffic":
			return "pageviews";
		case "error": {
			const message = normalizedLabel(subject.message);
			return `error "${
				message.length > SHARED_START_NAME_LENGTH
					? `${message.slice(0, SHARED_START_NAME_LENGTH - 1).trimEnd()}…`
					: message
			}"`;
		}
		case "event":
			return `${normalizedLabel(subject.name)} events`;
		case "revenue":
			return `${subject.currency.toUpperCase()} payments`;
		default:
			return subject satisfies never;
	}
}

export function hourlyChangeName(signal: InvestigationSignal): string | null {
	const subject = signalSubject(signal);
	return subject ? subjectName(subject) : null;
}

function onsetSpan(onset: ChangeOnset): { end: number; start: number } {
	return {
		end: dayjs.tz(onset.latest, onset.timezone).add(1, "hour").valueOf(),
		start: dayjs.tz(onset.earliest, onset.timezone).valueOf(),
	};
}

interface ChangeStart {
	onset: ChangeOnset | null;
	signal: InvestigationSignal;
}

function startsEvidence(
	own: InvestigationSignal,
	changes: ChangeStart[],
	within: (span: { end: number; start: number }) => boolean,
	intro: (count: number) => string
): string | null {
	const seen = new Set([hourlyChangeName(own)]);
	const shared: { name: string; start: string; traffic: boolean }[] = [];
	for (const { onset, signal } of changes) {
		const subject = signalSubject(signal);
		const name = subject ? subjectName(subject) : null;
		if (
			!(onset && subject && name) ||
			seen.has(name) ||
			!within(onsetSpan(onset))
		) {
			continue;
		}
		seen.add(name);
		shared.push({
			name,
			start: `${onset.direction === "down" ? "Dropping" : "Rising"} ${hourRange(onset.earliest, onset.latest, onset.timezone)}`,
			traffic: subject.kind === "traffic",
		});
	}
	if (shared.length === 0) {
		return null;
	}
	shared.sort((left, right) => Number(right.traffic) - Number(left.traffic));
	const sentence = (listed: number) => {
		const groups = new Map<string, string[]>();
		for (const { name, start } of shared.slice(0, listed)) {
			const names = groups.get(start);
			if (names) {
				names.push(name);
			} else {
				groups.set(start, [name]);
			}
		}
		const lines = [...groups].map(
			([start, names]) => `${start}: ${names.join(", ")}`
		);
		const unlisted = shared.length - listed;
		return `${intro(shared.length)}. ${lines.join(". ")}${unlisted > 0 ? `. ${unlisted} more not listed` : ""}.`;
	};
	let listed = shared.length;
	while (listed > 1 && sentence(listed).length > EVIDENCE_MAX_LENGTH) {
		listed -= 1;
	}
	return sentence(listed);
}

const SHARED_START_INTRO =
	/^(?:(?:Another change|\d+ other changes) on this website started within an hour of this one|(?:One change|\d+ changes) on this website started (?:on \d{4}-\d{2}-\d{2}|between \d{4}-\d{2}-\d{2} and \d{4}-\d{2}-\d{2}))\. /;

export function isSharedStartEvidence(value: string): boolean {
	return SHARED_START_INTRO.test(value);
}

export function sharedStartEvidence(
	own: ChangeStart,
	changes: ChangeStart[],
	timezone: string
): string | null {
	if (own.onset) {
		const gap = SHARED_START_GAP_HOURS * 60 * 60 * 1000;
		const ownSpan = onsetSpan(own.onset);
		return startsEvidence(
			own.signal,
			changes,
			(span) =>
				span.start < ownSpan.end + gap && ownSpan.start < span.end + gap,
			(count) =>
				count === 1
					? "Another change on this website started within an hour of this one"
					: `${count} other changes on this website started within an hour of this one`
		);
	}
	if (hourlyChangeName(own.signal)) {
		return null;
	}
	const { from, to } = own.signal.period.current;
	const periodStart = dayjs.tz(from, timezone).valueOf();
	const periodEnd = dayjs.tz(to, timezone).add(1, "day").valueOf();
	return startsEvidence(
		own.signal,
		changes,
		(span) => span.start < periodEnd && periodStart < span.end,
		(count) =>
			`${count === 1 ? "One change" : `${count} changes`} on this website started ${from === to ? `on ${from}` : `between ${from} and ${to}`}`
	);
}

const SEGMENT_DIMENSIONS = [
	"browser",
	"browser_version",
	"os",
	"device",
	"country",
] as const;
const SEGMENT_MIN_SHARE = 0.6;
const SEGMENT_MIN_LIFT = 2;
const SEGMENT_MIN_SESSIONS = 5;
const SEGMENT_SPREAD_MIN_SESSIONS = 20;
const SEGMENT_MIN_CHANGE = 0.3;
const SEGMENT_REST_CHANGE_RATIO = 3;
const SEGMENT_MIN_VOLUME = 20;
const SEGMENT_SHIFT_MIN_SESSIONS = 20;
const SEGMENT_SHIFT_MAX_BASE_SHARE = 0.8;
const SEGMENT_SPREAD_MIN_VOLUME = 100;
const SHIFT_DIMENSIONS = SEGMENT_DIMENSIONS.filter(
	(dimension) => dimension !== "browser_version"
);

type SegmentDimension = (typeof SEGMENT_DIMENSIONS)[number];
type SegmentTable = Map<
	SegmentDimension,
	Map<string, { count: number; sessions: number }>
>;

function isSegmentDimension(value: string): value is SegmentDimension {
	return (SEGMENT_DIMENSIONS as readonly string[]).includes(value);
}

export function segmentTable(
	rows: Record<string, unknown>[],
	countField: string
): SegmentTable {
	const table: SegmentTable = new Map();
	for (const row of rows) {
		const dimension = stringField(row, "dimension");
		if (!(dimension && isSegmentDimension(dimension))) {
			continue;
		}
		const raw = typeof row.value === "string" ? row.value : "";
		const value = dimension === "country" ? formatCountryName(raw) : raw;
		const values = table.get(dimension) ?? new Map();
		const prior = values.get(value) ?? { count: 0, sessions: 0 };
		values.set(value, {
			count: prior.count + numberField(row, countField),
			sessions: prior.sessions + numberField(row, "sessions"),
		});
		table.set(dimension, values);
	}
	return table;
}

function tableTotal(
	values: Map<string, { count: number; sessions: number }>,
	field: "count" | "sessions"
): number {
	let total = 0;
	for (const counts of values.values()) {
		total += counts[field];
	}
	return total;
}

export interface SegmentConcentration {
	dimension: SegmentDimension;
	sessionShare: number;
	subjectSessions: number;
	subjectShare: number;
	totalSubjectSessions: number;
	value: string;
}

export function concentratedSegment(
	subject: SegmentTable,
	exposure: SegmentTable
): SegmentConcentration | null {
	let best: (SegmentConcentration & { lift: number }) | null = null;
	for (const dimension of SEGMENT_DIMENSIONS) {
		const subjectValues = subject.get(dimension);
		const exposureValues = exposure.get(dimension);
		if (!(subjectValues && exposureValues)) {
			continue;
		}
		const totalSubjectSessions = tableTotal(subjectValues, "sessions");
		const totalExposure = tableTotal(exposureValues, "sessions");
		if (totalSubjectSessions === 0 || totalExposure === 0) {
			continue;
		}
		for (const [value, counts] of subjectValues) {
			const subjectShare = counts.sessions / totalSubjectSessions;
			const sessionShare =
				Math.max(exposureValues.get(value)?.sessions ?? 0, counts.sessions) /
				totalExposure;
			const lift = subjectShare / sessionShare;
			if (
				!value ||
				counts.sessions < SEGMENT_MIN_SESSIONS ||
				subjectShare < SEGMENT_MIN_SHARE ||
				lift < SEGMENT_MIN_LIFT
			) {
				continue;
			}
			if (
				!best ||
				lift > best.lift ||
				(lift === best.lift && subjectShare > best.subjectShare)
			) {
				best = {
					dimension,
					lift,
					sessionShare,
					subjectSessions: counts.sessions,
					subjectShare,
					totalSubjectSessions,
					value,
				};
			}
		}
	}
	if (!best) {
		return null;
	}
	const { lift: _lift, ...concentration } = best;
	return concentration;
}

export interface SegmentShift {
	afterDaily: number;
	beforeDaily: number;
	dimension: SegmentDimension;
	explained: number;
	restChange: number;
	segmentChange: number;
	value: string;
}

export function shiftedSegment(params: {
	after: SegmentTable;
	afterDays: number;
	before: SegmentTable;
	beforeDays: number;
	direction: "up" | "down";
}): SegmentShift | null {
	const { after, afterDays, before, beforeDays, direction } = params;
	let best: (SegmentShift & { lift: number }) | null = null;
	for (const dimension of SHIFT_DIMENSIONS) {
		const beforeValues = before.get(dimension) ?? new Map();
		const afterValues = after.get(dimension) ?? new Map();
		const beforeTotal = tableTotal(beforeValues, "count") / beforeDays;
		const afterTotal = tableTotal(afterValues, "count") / afterDays;
		const change = afterTotal - beforeTotal;
		if (
			beforeTotal * beforeDays < SEGMENT_MIN_VOLUME ||
			(direction === "down" ? change >= 0 : change <= 0)
		) {
			continue;
		}
		for (const value of new Set([
			...beforeValues.keys(),
			...afterValues.keys(),
		])) {
			const beforeDaily = (beforeValues.get(value)?.count ?? 0) / beforeDays;
			const afterDaily = (afterValues.get(value)?.count ?? 0) / afterDays;
			const explained = (afterDaily - beforeDaily) / change;
			const restBefore = beforeTotal - beforeDaily;
			const restAfter = afterTotal - afterDaily;
			const restChange =
				restBefore > 0
					? (restAfter - restBefore) / restBefore
					: restAfter > 0
						? Number.POSITIVE_INFINITY
						: 0;
			const segmentChange =
				beforeDaily > 0
					? (afterDaily - beforeDaily) / beforeDaily
					: Number.POSITIVE_INFINITY;
			const volume =
				direction === "down"
					? beforeDaily * beforeDays
					: afterDaily * afterDays;
			const sessions =
				(direction === "down" ? beforeValues : afterValues).get(value)
					?.sessions ?? 0;
			const restHeld =
				Number.isFinite(restChange) &&
				(Math.sign(restChange) !== Math.sign(segmentChange) ||
					Math.abs(restChange) * SEGMENT_REST_CHANGE_RATIO <=
						Math.abs(segmentChange));
			if (
				!value ||
				volume < SEGMENT_MIN_VOLUME ||
				sessions < SEGMENT_SHIFT_MIN_SESSIONS ||
				restBefore * beforeDays < SEGMENT_MIN_VOLUME ||
				beforeDaily / beforeTotal > SEGMENT_SHIFT_MAX_BASE_SHARE ||
				explained < SEGMENT_MIN_SHARE ||
				Math.abs(segmentChange) < SEGMENT_MIN_CHANGE ||
				!restHeld
			) {
				continue;
			}
			const lift = explained / Math.max(beforeDaily / beforeTotal, 1e-9);
			if (!best || lift > best.lift) {
				best = {
					afterDaily,
					beforeDaily,
					dimension,
					explained,
					lift,
					restChange,
					segmentChange,
					value,
				};
			}
		}
	}
	if (!best) {
		return null;
	}
	const { lift: _lift, ...shift } = best;
	return shift;
}

export type SegmentFinding =
	| { kind: "concentration"; concentration: SegmentConcentration }
	| {
			after: { from: string; to: string };
			before: { from: string; to: string };
			kind: "shift";
			direction: "up" | "down";
			noun: string;
			shift: SegmentShift;
	  }
	| { kind: "spread"; direction: "up" | "down"; subject: "error" | "change" };

function inclusiveDays(from: string, to: string): number {
	return dayjs(to).diff(dayjs(from), "day") + 1;
}

export async function loadSegmentFinding(
	params: {
		abortSignal?: AbortSignal;
		signal: InvestigationSignal;
		timezone: string;
		websiteId: string;
	},
	query: QueryFn = executeQuery
): Promise<SegmentFinding | null> {
	const { signal, timezone } = params;
	const subject = signalSubject(signal);
	const { current, previous } = signal.metric;
	if (
		!subject ||
		subject.kind === "revenue" ||
		previous === undefined ||
		current === previous
	) {
		return null;
	}
	const direction = current < previous ? "down" : "up";
	const read = (
		type: string,
		period: { from: string; to: string },
		filters: Filter[] = []
	) =>
		query(
			{
				filters,
				from: period.from,
				projectId: params.websiteId,
				timezone,
				to: period.to,
				type,
			},
			undefined,
			timezone,
			params.abortSignal
		);

	if (subject.kind === "error") {
		if (direction !== "up") {
			return null;
		}
		const [errors, traffic] = await Promise.all([
			read("error_segments", signal.period.current, [
				{ field: "message", op: "eq", value: subject.message },
			]),
			read("traffic_segments", signal.period.current),
		]);
		const errorSegments = segmentTable(errors, "errors");
		const concentration = concentratedSegment(
			errorSegments,
			segmentTable(traffic, "pageviews")
		);
		if (concentration) {
			return { concentration, kind: "concentration" };
		}
		const errorSessions = tableTotal(
			errorSegments.get("browser") ?? new Map(),
			"sessions"
		);
		return errorSessions >= SEGMENT_SPREAD_MIN_SESSIONS
			? { direction, kind: "spread", subject: "error" }
			: null;
	}

	const series =
		subject.kind === "traffic"
			? {
					countField: subject.metric === "pageviews" ? "pageviews" : "sessions",
					filters: [],
					noun: subject.metric === "pageviews" ? "Pageviews" : "Sessions",
					type: "traffic_segments",
				}
			: {
					countField: "events",
					filters: [
						{ field: "event_name", op: "eq" as const, value: subject.name },
					],
					noun: `${subject.name} events`,
					type: "custom_event_segments",
				};
	const comparableDay = signal.baselineDates?.at(-1);
	const beforePeriod = comparableDay
		? { from: comparableDay, to: comparableDay }
		: signal.period.previous;
	const [beforeRows, afterRows] = await Promise.all([
		read(series.type, beforePeriod, series.filters),
		read(series.type, signal.period.current, series.filters),
	]);
	const before = segmentTable(beforeRows, series.countField);
	const after = segmentTable(afterRows, series.countField);
	const shift = shiftedSegment({
		after,
		afterDays: inclusiveDays(
			signal.period.current.from,
			signal.period.current.to
		),
		before,
		beforeDays: inclusiveDays(beforePeriod.from, beforePeriod.to),
		direction,
	});
	if (shift) {
		return {
			after: signal.period.current,
			before: beforePeriod,
			direction,
			kind: "shift",
			noun: series.noun,
			shift,
		};
	}
	const volume = Math.max(
		tableTotal(before.get("browser") ?? new Map(), "count"),
		tableTotal(after.get("browser") ?? new Map(), "count")
	);
	return volume >= SEGMENT_SPREAD_MIN_VOLUME
		? { direction, kind: "spread", subject: "change" }
		: null;
}

function percent(value: number): string {
	return `${Math.round(value * 100)}%`;
}

function segmentPhrase(dimension: SegmentDimension, value: string): string {
	if (dimension === "device") {
		return `${value.toLowerCase()} devices`;
	}
	return value;
}

export function segmentEvidence(finding: SegmentFinding): string {
	if (finding.kind === "concentration") {
		const { concentration } = finding;
		const where =
			concentration.dimension === "country"
				? `came from ${concentration.value}`
				: concentration.dimension === "device"
					? `were on ${segmentPhrase("device", concentration.value)}`
					: `used ${concentration.value}`;
		return `${percent(concentration.subjectShare)} of the sessions with this error (${concentration.subjectSessions.toLocaleString("en-US")} of ${concentration.totalSubjectSessions.toLocaleString("en-US")}) ${where}, compared with ${percent(concentration.sessionShare)} of all sessions in the same period.`;
	}
	if (finding.kind === "spread") {
		return finding.subject === "error"
			? "No browser, browser version, operating system, device type or country accounts for most sessions with this error at more than twice its share of all sessions."
			: `No browser, operating system, device type or country accounts for most of this ${finding.direction === "down" ? "drop" : "rise"} while the rest held steady.`;
	}
	const { after, before, shift } = finding;
	const segment = segmentPhrase(shift.dimension, shift.value);
	const verb = finding.direction === "down" ? "fell" : "rose";
	const segmentChange = Number.isFinite(shift.segmentChange)
		? ` ${percent(Math.abs(shift.segmentChange))}`
		: "";
	const restChange = `${shift.restChange >= 0 ? "+" : "-"}${percent(Math.abs(shift.restChange))}`;
	const count = (value: number) => Math.round(value).toLocaleString("en-US");
	const singleDays = before.from === before.to && after.from === after.to;
	const levels = singleDays
		? `from ${count(shift.beforeDaily)} on ${before.from} to ${count(shift.afterDaily)} on ${after.from}`
		: `from about ${count(shift.beforeDaily)} to ${count(shift.afterDaily)} a day`;
	return `${finding.noun} from ${segment} ${verb}${segmentChange} (${levels}), ${percent(Math.min(shift.explained, 1))} of the whole ${finding.direction === "down" ? "drop" : "rise"}, while everything else changed ${restChange}.`;
}

const RECOVERY_MIN_HOLD_HOURS = 24;
const RECOVERY_MAX_WINDOW_DAYS = 21;
const RECOVERY_NEAR_BASELINE = 1.5;
const RECOVERY_NEW_SERIES_REMAINDER = 0.1;
const RECOVERY_NEW_SERIES_ONGOING = 0.5;
const RECOVERY_MIN_TRAFFIC_SHARE = 0.5;
const RECOVERY_ONGOING_MIN_Z = 3;
const RECOVERY_NEW_SERIES_MIN_COUNT = 5;

export type RecoveryState =
	| {
			brokenCount: number;
			heldHours: number;
			kind: "recovered";
			observed: number;
			recoveredAt: number | null;
			recoveredFrom: number;
	  }
	| { expectedNormal: number; kind: "ongoing"; observed: number };

export function estimateRecovery(params: {
	baseline: HourlyCount[];
	direction: "up" | "down";
	window: HourlyCount[];
}): RecoveryState | null {
	const { baseline, direction, window } = params;
	const n = window.length;
	if (n < RECOVERY_MIN_HOLD_HOURS + ONSET_MIN_OUTSIDE_HOURS) {
		return null;
	}
	const { dispersion, expectedAt, hourlyMean } = hourlyBaseline(baseline);
	const { countIn, exposureIn } = runningTotals(window, expectedAt);
	const level = (from: number, to: number) =>
		countIn(from, to) / exposureIn(from, to);
	const lastDay = n - RECOVERY_MIN_HOLD_HOURS;
	const nearBaseline = (from: number, brokenLevel: number) => {
		const value = level(from, n);
		if (hourlyMean === 0) {
			return value <= brokenLevel * RECOVERY_NEW_SERIES_REMAINDER;
		}
		return direction === "down"
			? value >= 1 / RECOVERY_NEAR_BASELINE
			: value <= RECOVERY_NEAR_BASELINE;
	};
	const nullTerm = poissonTerm(countIn(0, n), exposureIn(0, n));
	const split = (at: number) => {
		const broken = level(0, at);
		const after = level(at, n);
		return (direction === "down" ? after > broken : after < broken)
			? poissonTerm(countIn(0, at), exposureIn(0, at)) +
					poissonTerm(countIn(at, n), exposureIn(at, n)) -
					nullTerm
			: Number.NEGATIVE_INFINITY;
	};
	let best = { at: 0, llr: Number.NEGATIVE_INFINITY };
	for (let at = 1; at <= lastDay; at++) {
		const llr = split(at);
		if (llr > best.llr) {
			best = { at, llr };
		}
	}
	const brokenLevel = best.at > 0 ? level(0, best.at) : level(0, lastDay);
	if (
		best.at > 0 &&
		best.llr / dispersion >= ONSET_MIN_QUASI_LLR &&
		nearBaseline(best.at, brokenLevel) &&
		nearBaseline(lastDay, brokenLevel)
	) {
		const floor = best.llr - ONSET_LOCATION_SLACK * dispersion;
		const plausible: number[] = [];
		for (let at = 1; at <= lastDay; at++) {
			if (split(at) >= floor) {
				plausible.push(at);
			}
		}
		const latest = Math.max(...plausible);
		return {
			brokenCount: countIn(0, best.at),
			heldHours: n - best.at,
			kind: "recovered",
			observed: countIn(best.at, n),
			recoveredAt:
				latest - Math.min(...plausible) + 1 <= ONSET_MAX_SPREAD_HOURS
					? latest
					: null,
			recoveredFrom: best.at,
		};
	}
	const recent = level(lastDay, n);
	const recentCount = countIn(lastDay, n);
	const recentExpected = exposureIn(lastDay, n);
	const recentZ =
		(recentCount - recentExpected) /
		Math.sqrt(Math.max(recentExpected, 1) * dispersion);
	const stillBroken =
		hourlyMean === 0
			? recentCount >= RECOVERY_NEW_SERIES_MIN_COUNT &&
				recentCount >=
					countIn(0, RECOVERY_MIN_HOLD_HOURS) * RECOVERY_NEW_SERIES_ONGOING
			: direction === "down"
				? recent <= 1 / RECOVERY_NEAR_BASELINE &&
					recentZ <= -RECOVERY_ONGOING_MIN_Z
				: recent >= RECOVERY_NEAR_BASELINE && recentZ >= RECOVERY_ONGOING_MIN_Z;
	return stillBroken
		? {
				expectedNormal: hourlyMean === 0 ? 0 : recentExpected,
				kind: "ongoing",
				observed: recentCount,
			}
		: null;
}

export type ChangeRecovery = {
	direction: "up" | "down";
	noun: string;
	subject: string;
	through: string;
	timezone: string;
} & (
	| {
			brokenCount: number;
			brokenHours: number;
			heldHours: number;
			observed: number;
			recoveredAt: string | null;
			recoveredOn: string;
			state: "recovered";
	  }
	| { expected: number; observed: number; state: "ongoing" }
);

function trafficContinued(
	points: HourlyCount[],
	start: string,
	recoveredFrom: string
): boolean {
	const { expectedAt } = hourlyBaseline(
		points.filter((point) => point.hour < start)
	);
	const level = (inSpan: (hour: string) => boolean) => {
		let observed = 0;
		let expected = 0;
		for (const point of points) {
			if (inSpan(point.hour)) {
				observed += point.value;
				expected += expectedAt(point.hour);
			}
		}
		return expected > 0 ? observed / expected : 0;
	};
	const during = level((hour) => hour >= start && hour < recoveredFrom);
	const after = level((hour) => hour >= recoveredFrom);
	return after >= Math.min(during, 1) * RECOVERY_MIN_TRAFFIC_SHARE;
}

export async function loadRecovery(
	params: {
		abortSignal?: AbortSignal;
		prior: InvestigationSignal;
		through: string;
		timezone: string;
		websiteId: string;
	},
	query: QueryFn = executeQuery
): Promise<{ onset: ChangeOnset; recovery: ChangeRecovery } | null> {
	const { prior, timezone } = params;
	const subject = signalSubject(prior);
	if (!subject) {
		return null;
	}
	const onset = await loadChangeOnset(
		{
			abortSignal: params.abortSignal,
			signal: prior,
			timezone,
			websiteId: params.websiteId,
		},
		query
	);
	if (!onset) {
		return null;
	}
	const onsetDay = onset.earliest.slice(0, 10);
	const lastDay = dayjs(onsetDay)
		.add(RECOVERY_MAX_WINDOW_DAYS, "day")
		.format("YYYY-MM-DD");
	const through = params.through < lastDay ? params.through : lastDay;
	if (through <= onsetDay) {
		return null;
	}
	const series = onsetSeries(subject);
	const read = (readSeries: OnsetSeries) =>
		readHourlyCounts({
			abortSignal: params.abortSignal,
			from: dayjs(onsetDay)
				.subtract(ONSET_BASELINE_DAYS, "day")
				.format("YYYY-MM-DD"),
			query,
			series: readSeries,
			timezone,
			to: through,
			websiteId: params.websiteId,
		});
	const points = await read(series);
	const start = points.findIndex((point) => point.hour >= onset.earliest);
	if (start <= 0) {
		return null;
	}
	const window = points.slice(start);
	const state = estimateRecovery({
		baseline: points.slice(0, start),
		direction: onset.direction,
		window,
	});
	if (!state) {
		return null;
	}
	const shared = {
		direction: onset.direction,
		noun: series.noun,
		subject: series.subject,
		through,
		timezone,
	};
	if (state.kind === "ongoing") {
		return {
			onset,
			recovery: {
				...shared,
				expected: state.expectedNormal,
				observed: state.observed,
				state: "ongoing",
			},
		};
	}
	const recoveredFrom = window[state.recoveredFrom]?.hour ?? onset.earliest;
	if (
		subject.kind === "error" &&
		!trafficContinued(
			await read(PAGEVIEW_SERIES),
			onset.earliest,
			recoveredFrom
		)
	) {
		return null;
	}
	return {
		onset,
		recovery: {
			...shared,
			brokenCount: state.brokenCount,
			brokenHours: state.recoveredFrom,
			heldHours: state.heldHours,
			observed: state.observed,
			recoveredAt:
				state.recoveredAt === null
					? null
					: (window[state.recoveredAt]?.hour ?? null),
			recoveredOn: recoveredFrom.slice(0, 10),
			state: "recovered",
		},
	};
}

function hoursPhrase(hours: number): string {
	if (hours < 48) {
		return `${hours} ${hours === 1 ? "hour" : "hours"}`;
	}
	return `${Math.floor(hours / 24)} days`;
}

export function recoveryEvidence(recovery: ChangeRecovery): string {
	const change = recovery.direction === "down" ? "drop" : "rise";
	if (recovery.state === "ongoing") {
		return `${recovery.subject} show the ${change} still in effect: ${counted(recovery.observed, recovery.noun)} in the 24 hours through ${recovery.through} (${recovery.timezone}), where the earlier rate predicted about ${Math.round(recovery.expected).toLocaleString("en-US")}.`;
	}
	const when = recovery.recoveredAt
		? `${recovery.recoveredAt.slice(11, 16)} on ${recovery.recoveredAt.slice(0, 10)}`
		: recovery.recoveredOn;
	return `${recovery.subject} show a return to the earlier rate from ${when} (${recovery.timezone}), holding for ${hoursPhrase(recovery.heldHours)} through ${recovery.through}: ${counted(recovery.observed, recovery.noun)} since then, against ${Math.round(recovery.brokenCount).toLocaleString("en-US")} in the ${hoursPhrase(recovery.brokenHours)} of the ${change}.`;
}
