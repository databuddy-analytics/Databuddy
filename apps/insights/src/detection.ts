import { executeQuery } from "@databuddy/ai/query";
import dayjs from "dayjs";

export interface DetectedSignal {
	baseline: number;
	current: number;
	deltaPercent: number;
	detectedAt: string;
	direction: "up" | "down";
	label: string;
	method: "zscore" | "wow";
	metric: string;
	severity: "critical" | "warning" | "info";
	zScore?: number;
}

export interface DetectSignalsParams {
	lookbackDays: number;
	timezone: string;
	websiteId: string;
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
		label: "Avg. session duration",
		dailyField: "median_session_duration",
		summaryField: "median_session_duration",
	},
];

export function median(values: number[]): number {
	if (values.length === 0) {
		return 0;
	}
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[mid - 1] + sorted[mid]) / 2
		: sorted[mid];
}

export function mad(values: number[]): number {
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
const WOW_TRAFFIC_THRESHOLD = 40;
const WOW_ERROR_THRESHOLD = 40;
const WOW_REVENUE_THRESHOLD = 30;
const WOW_VITALS_THRESHOLD = 30;
const WOW_CUSTOM_EVENT_THRESHOLD = 40;
const FILTER_SESSION_DURATION_MIN_DELTA = 60;
const FILTER_SESSION_DURATION_MIN_PEAK = 20;
const FILTER_BOUNCE_MIN_DELTA = 10;
const FILTER_ERROR_MIN_DELTA = 5;
const FILTER_ERROR_MIN_PEAK = 10;
const FILTER_TRAFFIC_MIN_PEAK = 80;
const FILTER_TRAFFIC_MIN_DELTA = 50;
const CUSTOM_EVENT_MIN_COUNT = 5;
const CUSTOM_EVENT_NEW_THRESHOLD = 10;
const CUSTOM_EVENT_DISAPPEARED_THRESHOLD = 10;

const VITALS_METRICS: Record<string, string> = {
	LCP: "Page load time (LCP)",
	INP: "Interaction speed (INP)",
};

type SignalFilter = (signal: DetectedSignal) => boolean;

const METRIC_FILTERS: Record<string, SignalFilter> = {
	session_duration: (s) =>
		Math.abs(s.current - s.baseline) >= FILTER_SESSION_DURATION_MIN_DELTA &&
		Math.max(s.current, s.baseline) >= FILTER_SESSION_DURATION_MIN_PEAK,
	bounce_rate: (s) =>
		Math.abs(s.current - s.baseline) >= FILTER_BOUNCE_MIN_DELTA,
	error_count: (s) =>
		Math.abs(s.current - s.baseline) >= FILTER_ERROR_MIN_DELTA &&
		Math.max(s.current, s.baseline) >= FILTER_ERROR_MIN_PEAK,
	revenue: () => true,
	lcp: () => true,
	inp: () => true,
};

const DEFAULT_TRAFFIC_FILTER: SignalFilter = (s) =>
	Math.max(s.current, s.baseline) >= FILTER_TRAFFIC_MIN_PEAK &&
	Math.abs(s.current - s.baseline) >= FILTER_TRAFFIC_MIN_DELTA;

function makeWowSignal(
	metric: string,
	label: string,
	current: number,
	baseline: number,
	detectedAt: string
): DetectedSignal {
	const pct = baseline === 0 ? 100 : safeDeltaPercent(current, baseline);
	return {
		metric,
		label,
		method: "wow",
		direction: current > baseline ? "up" : "down",
		current,
		baseline,
		deltaPercent: Number(pct.toFixed(2)),
		severity: assignSeverity(undefined, pct),
		detectedAt,
	};
}

function passesImpactFilter(signal: DetectedSignal): boolean {
	if (signal.metric.startsWith("custom_event:")) {
		return true;
	}
	const filter = METRIC_FILTERS[signal.metric];
	return filter ? filter(signal) : DEFAULT_TRAFFIC_FILTER(signal);
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

export async function detectSignals(
	params: DetectSignalsParams,
	queryFn: QueryFn = executeQuery
): Promise<DetectedSignal[]> {
	const { websiteId, lookbackDays, timezone } = params;

	const today = dayjs();
	const dailyFrom = today
		.subtract(lookbackDays - 1, "day")
		.format("YYYY-MM-DD");
	const dailyTo = today.format("YYYY-MM-DD");

	const rows = await queryFn(
		{
			projectId: websiteId,
			type: "events_by_date",
			from: dailyFrom,
			to: dailyTo,
			timezone,
			timeUnit: "day",
			limit: lookbackDays + 5,
		},
		undefined,
		timezone
	);

	const sorted = [...rows].sort((a, b) =>
		String(a.date ?? "").localeCompare(String(b.date ?? ""))
	);

	const zscoreSignals = detectZscore(sorted);

	const wowSignals = await detectWow(params, today, queryFn);

	const wowDirection = new Map<string, "up" | "down">();
	for (const s of wowSignals) {
		wowDirection.set(s.metric, s.direction);
	}
	const reconciledZscore = zscoreSignals.filter((s) => {
		const wow = wowDirection.get(s.metric);
		return wow === undefined || wow === s.direction;
	});

	const all = [...reconciledZscore, ...wowSignals];

	const byMetric = new Map<string, DetectedSignal>();
	for (const signal of all) {
		const prev = byMetric.get(signal.metric);
		if (!prev || Math.abs(signal.deltaPercent) > Math.abs(prev.deltaPercent)) {
			byMetric.set(signal.metric, signal);
		}
	}

	const filtered = [...byMetric.values()].filter(passesImpactFilter);

	const collapsed = collapseCorrelated(filtered);

	return collapsed.sort(
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
		const baselineValues = baseline
			.map((row) => numberField(row, metric.dailyField))
			.filter((v) => Number.isFinite(v));

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
			direction,
			current: currentValue,
			baseline: baselineMedian,
			deltaPercent: Number(delta.toFixed(2)),
			zScore: Number(zScore.toFixed(2)),
			severity: assignSeverity(zScore, delta),
			detectedAt: latestDate,
		});
	}

	return signals;
}

async function detectWow(
	params: DetectSignalsParams,
	today: dayjs.Dayjs,
	queryFn: QueryFn
): Promise<DetectedSignal[]> {
	const { websiteId, lookbackDays, timezone } = params;
	const windowDays = Math.max(3, lookbackDays);

	const currentFrom = today
		.subtract(windowDays - 1, "day")
		.format("YYYY-MM-DD");
	const currentTo = today.format("YYYY-MM-DD");
	const previousFrom = today
		.subtract(windowDays * 2 - 1, "day")
		.format("YYYY-MM-DD");
	const previousTo = today.subtract(windowDays, "day").format("YYYY-MM-DD");

	function query(type: string, from: string, to: string) {
		return queryFn(
			{ projectId: websiteId, type, from, to, timezone },
			undefined,
			timezone
		);
	}

	const [
		currentSummary,
		previousSummary,
		currentErrors,
		previousErrors,
		currentRevenue,
		previousRevenue,
		currentVitals,
		previousVitals,
		currentCustom,
		previousCustom,
	] = await Promise.all([
		query("summary_metrics", currentFrom, currentTo),
		query("summary_metrics", previousFrom, previousTo),
		query("error_summary", currentFrom, currentTo),
		query("error_summary", previousFrom, previousTo),
		query("revenue_overview", currentFrom, currentTo),
		query("revenue_overview", previousFrom, previousTo),
		query("vitals_overview", currentFrom, currentTo),
		query("vitals_overview", previousFrom, previousTo),
		query("custom_events_discovery", currentFrom, currentTo),
		query("custom_events_discovery", previousFrom, previousTo),
	]);

	const signals: DetectedSignal[] = [];

	for (const metric of ANOMALY_METRICS) {
		const currentValue = numberField(currentSummary[0], metric.summaryField);
		const previousValue = numberField(previousSummary[0], metric.summaryField);

		if (previousValue === 0 || currentValue === 0) {
			continue;
		}

		if (
			Math.abs(safeDeltaPercent(currentValue, previousValue)) <
			WOW_TRAFFIC_THRESHOLD
		) {
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

	const errNow = numberField(currentErrors[0], "totalErrors");
	const errPrev = numberField(previousErrors[0], "totalErrors");
	if (errPrev === 0 && errNow >= FILTER_ERROR_MIN_PEAK) {
		signals.push(makeWowSignal("error_count", "Errors", errNow, 0, currentTo));
	} else if (
		errNow > 0 &&
		errPrev > 0 &&
		Math.abs(safeDeltaPercent(errNow, errPrev)) >= WOW_ERROR_THRESHOLD
	) {
		signals.push(
			makeWowSignal("error_count", "Errors", errNow, errPrev, currentTo)
		);
	}

	const revNow = numberField(currentRevenue[0], "total_revenue");
	const revPrev = numberField(previousRevenue[0], "total_revenue");
	if ((revNow > 0 || revPrev > 0) && Math.abs(revNow - revPrev) > 0) {
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

	for (const [metricName, label] of Object.entries(VITALS_METRICS)) {
		const cur = vitalsCurrentMap.get(metricName);
		const prev = vitalsPreviousMap.get(metricName);
		const curVal = numberField(cur, "p75");
		const prevVal = numberField(prev, "p75");
		const curSamples = numberField(cur, "samples");

		if (curSamples < 10 || prevVal === 0 || curVal === 0) {
			continue;
		}

		const pct = safeDeltaPercent(curVal, prevVal);
		if (Math.abs(pct) < WOW_VITALS_THRESHOLD) {
			continue;
		}

		signals.push(
			makeWowSignal(metricName.toLowerCase(), label, curVal, prevVal, currentTo)
		);
	}

	const prevEventsMap = new Map<string, number>();
	for (const row of previousCustom) {
		const name = stringField(row, "event_name");
		if (name) {
			prevEventsMap.set(name, numberField(row, "total_events"));
		}
	}

	const curEventNames = new Set<string>();
	for (const row of currentCustom) {
		const name = stringField(row, "event_name");
		const curCount = numberField(row, "total_events");
		if (!name) {
			continue;
		}
		curEventNames.add(name);
		if (curCount < CUSTOM_EVENT_MIN_COUNT) {
			continue;
		}

		const prevCount = prevEventsMap.get(name) ?? 0;
		if (prevCount === 0 && curCount >= CUSTOM_EVENT_NEW_THRESHOLD) {
			signals.push(
				makeWowSignal(
					`custom_event:${name}`,
					`Custom event "${name}"`,
					curCount,
					0,
					currentTo
				)
			);
			continue;
		}
		if (prevCount === 0) {
			continue;
		}
		if (
			Math.abs(safeDeltaPercent(curCount, prevCount)) <
			WOW_CUSTOM_EVENT_THRESHOLD
		) {
			continue;
		}
		if (Math.abs(curCount - prevCount) < CUSTOM_EVENT_MIN_COUNT) {
			continue;
		}
		signals.push(
			makeWowSignal(
				`custom_event:${name}`,
				`Custom event "${name}"`,
				curCount,
				prevCount,
				currentTo
			)
		);
	}

	for (const [name, prevCount] of prevEventsMap) {
		if (prevCount < CUSTOM_EVENT_DISAPPEARED_THRESHOLD) {
			continue;
		}
		if (curEventNames.has(name)) {
			continue;
		}
		signals.push({
			...makeWowSignal(
				`custom_event:${name}`,
				`Custom event "${name}"`,
				0,
				prevCount,
				currentTo
			),
			severity: "warning",
			detectedAt: currentTo,
		});
	}

	return signals;
}
