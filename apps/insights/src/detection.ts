import { executeQuery, type Filter } from "@databuddy/ai/query";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import dayjs from "dayjs";
import timezonePlugin from "dayjs/plugin/timezone";
import utcPlugin from "dayjs/plugin/utc";
import { emitInsightsEvent } from "./lib/evlog-insights";

dayjs.extend(utcPlugin);
dayjs.extend(timezonePlugin);

/**
 * A bounded, canonical telemetry target that an investigation agent may use
 * when proposing measurement setup. It deliberately excludes raw paths,
 * query strings, and dynamic identifiers.
 */
export type MeasurementCandidate =
	| {
			basis: "observed_custom_event";
			kind: "event_goal_candidate";
			target: string;
			type: "EVENT";
	  }
	| {
			basis: "observed_navigation_proxy";
			kind: "page_navigation_proxy";
			target: string;
			type: "PAGE_VIEW";
	  };

export interface DetectedSignal {
	baseline: number;
	baselineDates?: string[];
	current: number;
	definitionEvidence?: string;
	deltaPercent: number;
	detectedAt: string;
	direction: "up" | "down";
	entityId?: string;
	entityLabel?: string;
	label: string;
	measurementCandidate?: MeasurementCandidate;
	method: "zscore" | "wow";
	metric: string;
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

function median(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[mid - 1] + sorted[mid]) / 2
		: sorted[mid];
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
const ZSCORE_HISTORY_DAYS = 22;
const WOW_TRAFFIC_THRESHOLD = 40;
const WOW_ERROR_THRESHOLD = 40;
const WOW_REVENUE_THRESHOLD = 30;
const WOW_VITALS_THRESHOLD = 30;
const CUSTOM_EVENT_DROP_THRESHOLD = 50;
const CUSTOM_EVENT_MIN_BASELINE = 10;
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
const LOW_TRAFFIC_WEEKLY_SESSIONS = 50;
const LOW_TRAFFIC_MIN_VALUE = 10;
const FILTER_TRAFFIC_MIN_PEAK = 80;
const FILTER_TRAFFIC_MIN_DELTA = 50;
const MATERIAL_VOLUME_DROP_PERCENT = 60;
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
const VITALS = INSIGHT_VITALS;
const VITALS_MIN_SAMPLES = 10;

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
	error_count: (s) =>
		Math.abs(s.current - s.baseline) >= FILTER_ERROR_MIN_DELTA &&
		Math.max(s.current, s.baseline) >= FILTER_ERROR_MIN_PEAK,
	inp: () => true,
	lcp: () => true,
	revenue: () => true,
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
	const pct =
		baseline === 0
			? current === 0
				? 0
				: 100
			: safeDeltaPercent(current, baseline);
	const lowerIsBetter = ["bounce_rate", "error_count", "lcp", "inp"].includes(
		metric
	);
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
		severity: assignSeverity(undefined, pct),
		detectedAt,
	};
}

function passesImpactFilter(signal: DetectedSignal): boolean {
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

function makeCustomEventSignal(
	name: string,
	currentRow: Record<string, unknown> | undefined,
	previousRow: Record<string, unknown> | undefined,
	detectedAt: string,
	subjectKey = `custom_event:${name}`
): DetectedSignal {
	const current = numberField(currentRow, "total_events");
	const previous = numberField(previousRow, "total_events");
	const currentUsers = numberField(currentRow, "unique_users");
	const previousUsers = numberField(previousRow, "unique_users");
	const currentSessions = numberField(currentRow, "unique_sessions");
	const previousSessions = numberField(previousRow, "unique_sessions");
	const signal = capLowReachSeverity(
		makeWowSignal("custom_event_count", name, current, previous, detectedAt),
		Math.max(previousUsers, previousSessions)
	);
	signal.subjectKey = subjectKey;
	signal.entityId = name;
	signal.definitionEvidence = `Event "${name}" occurred ${current} times across ${currentUsers} users and ${currentSessions} sessions, compared with ${previous} occurrences across ${previousUsers} users and ${previousSessions} sessions previously.`;
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

function numberField(
	row: Record<string, unknown> | undefined,
	key: string
): number {
	const value = Number(row?.[key] ?? 0);
	return Number.isFinite(value) ? value : 0;
}

function stringField(
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

export function assignSeverity(
	zScore: number | undefined,
	deltaPercent: number
): "critical" | "warning" | "info" {
	const absZ = zScore === undefined ? 0 : Math.abs(zScore);
	const absD = Math.abs(deltaPercent);
	if (absZ >= 3.5 || absD >= 60) {
		return "critical";
	}
	if (absZ >= 3.0 || absD >= 50) {
		return "warning";
	}
	return "info";
}

export type QueryFn = typeof executeQuery;

/**
 * Measures the same stored subject over the newest complete comparison window.
 * Unlike detection, this deliberately has no anomaly threshold: an open case
 * must still get a recovery measurement after its spike or drop disappears.
 */
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
		const label = prior.entity.label || prior.metric.label;
		const signal = makeWowSignal(
			"error_count",
			label,
			numberField(currentRow, "count"),
			numberField(previousRow, "count"),
			currentTo
		);
		signal.subjectKey = prior.signalKey;
		signal.entityId = fingerprint;
		signal.entityLabel = label;
		signal.definitionEvidence = `${label} occurred ${signal.current} times and affected ${numberField(currentRow, "users")} users, compared with ${signal.baseline} occurrences affecting ${numberField(previousRow, "users")} users previously.`;
		return signal;
	}

	if (prior.signalKey.startsWith("custom_event:")) {
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
			prior.signalKey
		);
	}

	if (prior.signalKey === "revenue") {
		const pair = await readPair("revenue", "revenue_overview");
		if (!pair.value) {
			return null;
		}
		const [currentRows, previousRows] = pair.value;
		return makeWowSignal(
			"revenue",
			prior.metric.label,
			numberField(currentRows[0], "total_revenue"),
			numberField(previousRows[0], "total_revenue"),
			currentTo
		);
	}

	const vital = prior.signalKey === "lcp" ? VITALS.LCP : VITALS.INP;
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
		if (
			numberField(currentRow, "samples") < VITALS_MIN_SAMPLES ||
			numberField(previousRow, "samples") < VITALS_MIN_SAMPLES ||
			current <= 0 ||
			baseline <= 0 ||
			current > vital.maxPlausible ||
			baseline > vital.maxPlausible
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

function rethrowDetectionAbort(
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
	const historyIncomplete = history.failed;
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
	const wowSignals = wow.signals;
	if (diagnostics) {
		diagnostics.failedFamilies =
			(historyIncomplete ? 1 : 0) + wow.failedFamilies;
	}

	const wowDirection = new Map<string, "up" | "down">();
	for (const s of wowSignals) {
		wowDirection.set(s.metric, s.direction);
	}
	const reconciledZscore = zscoreSignals.filter((s) => {
		const wow = wowDirection.get(s.metric);
		return wow === undefined || wow === s.direction;
	});

	const all = [...reconciledZscore, ...wowSignals];

	const bySubject = new Map<string, DetectedSignal>();
	for (const signal of all) {
		const key = signal.subjectKey ?? signal.metric;
		const prev = bySubject.get(key);
		if (!prev || Math.abs(signal.deltaPercent) > Math.abs(prev.deltaPercent)) {
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

const TRAFFIC_METRICS = new Set(["visitors", "sessions", "pageviews"]);

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
	if (sorted.length < 7) {
		return [];
	}

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
			numberField(latest, "sessions") === 0
		) {
			continue;
		}
		const comparableRows = baseline.filter(
			(row) =>
				Number.isFinite(numberField(row, metric.dailyField)) &&
				(!SESSION_DERIVED_METRICS.has(metric.key) ||
					numberField(row, "sessions") > 0)
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
			severity: assignSeverity(zScore, delta),
			detectedAt: latestDate,
		});
	}

	return signals;
}

async function detectWow(
	params: DetectSignalsParams,
	today: dayjs.Dayjs,
	queryFn: QueryFn,
	wowThresholds: Map<string, number>,
	abortSignal?: AbortSignal
): Promise<{
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
		options: { filters?: Filter[]; limit?: number } = {}
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
			abortSignal
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
		current: () => query("error_fingerprints", currentFrom, currentTo),
		family: "errors",
		previous: () => query("error_fingerprints", previousFrom, previousTo),
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
		const row = affectedRow ?? currentRow ?? previousRow;
		const message =
			stringField(row, "name") ?? stringField(row, "message") ?? "Error";
		const errorType = stringField(row, "error_type");
		const filename = stringField(row, "filename");
		const path = stringField(row, "path");
		const line = numberField(row, "line");
		const location = filename
			? `${filename}${line > 0 ? `:${line}` : ""}`
			: path;
		const label = `${errorType ? `${errorType}: ` : ""}${message}${location ? ` at ${location}` : ""}`;
		const signal = capLowReachSeverity(
			makeWowSignal("error_count", label, current, previous, currentTo),
			affectedUsers
		);
		signal.subjectKey = `error:${fingerprint}`;
		signal.entityId = fingerprint;
		signal.entityLabel = label;
		signal.definitionEvidence = `${label} occurred ${current} times and affected ${numberField(currentRow, "users")} users, compared with ${previous} occurrences affecting ${numberField(previousRow, "users")} users previously.`;
		signals.push(signal);
	}

	const currentByName = mapRowsByStringField(currentCustomEvents, "name");
	for (const previousRow of previousCustomEvents) {
		const name = stringField(previousRow, "name");
		if (!name) {
			continue;
		}
		const currentRow = currentByName.get(name);
		const current = numberField(currentRow, "total_events");
		const previous = numberField(previousRow, "total_events");
		const previousReach = Math.max(
			numberField(previousRow, "unique_users"),
			numberField(previousRow, "unique_sessions")
		);
		if (
			previous < CUSTOM_EVENT_MIN_BASELINE ||
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
		signals.push(
			makeCustomEventSignal(name, currentRow, previousRow, currentTo)
		);
	}

	const revNow = numberField(currentRevenue[0], "total_revenue");
	const revPrev = numberField(previousRevenue[0], "total_revenue");
	const revenueTransactions = Math.max(
		numberField(currentRevenue[0], "total_transactions"),
		numberField(previousRevenue[0], "total_transactions")
	);
	const meaningfulRevenueChange =
		Math.abs(revNow - revPrev) >= REVENUE_MIN_ABSOLUTE_CHANGE ||
		revenueTransactions >= REVENUE_MIN_TRANSACTIONS;
	if ((revNow > 0 || revPrev > 0) && meaningfulRevenueChange) {
		const pct = revPrev === 0 ? 100 : safeDeltaPercent(revNow, revPrev);
		if (
			Math.abs(pct) >= WOW_REVENUE_THRESHOLD ||
			(revPrev === 0 && revNow > 0)
		) {
			signals.push(
				makeWowSignal("revenue", "Revenue", revNow, revPrev, currentTo)
			);
		}
	}

	const vitalsCurrentMap = mapRowsByStringField(currentVitals, "metric_name");
	const vitalsPreviousMap = mapRowsByStringField(previousVitals, "metric_name");

	for (const [metricName, vital] of Object.entries(VITALS)) {
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

		const pct = safeDeltaPercent(curVal, prevVal);
		if (Math.abs(pct) < WOW_VITALS_THRESHOLD) {
			continue;
		}
		if (curVal > prevVal && curVal <= vital.badThreshold) {
			continue;
		}

		signals.push(
			makeWowSignal(
				metricName.toLowerCase(),
				vital.label,
				curVal,
				prevVal,
				currentTo
			)
		);
	}

	return {
		failedFamilies:
			[summary, errors, revenue, vitals].filter((result) => result.failed)
				.length + (customEventsFailed ? 1 : 0),
		signals,
		weeklySessions:
			(Math.max(
				numberField(currentSummary[0], "sessions"),
				numberField(previousSummary[0], "sessions")
			) /
				Math.max(3, lookbackDays)) *
			7,
	};
}
