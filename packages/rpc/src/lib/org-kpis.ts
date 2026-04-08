import { chQuery } from "@databuddy/db";

export type KpiMetric = "visitors" | "sessions" | "bounce" | "errors" | "lcp";

export interface DailyKpiRow {
	bounces: number;
	date: string;
	errors: number;
	lcp_p75_ms: number;
	sessions: number;
	visitors: number;
	website_id: string;
}

export interface KpiSummary {
	change: number;
	current: number;
	previous: number;
	sparkline: { date: string; value: number }[];
}

export interface OrgKpis {
	bounce: KpiSummary;
	errors: KpiSummary;
	lcp: KpiSummary;
	sessions: KpiSummary;
	visitors: KpiSummary;
}

function addDays(dateStr: string, days: number): string {
	const d = new Date(`${dateStr}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return d.toISOString().slice(0, 10);
}

function todayUtc(): string {
	return new Date().toISOString().slice(0, 10);
}

function aggregate(metric: KpiMetric, rows: DailyKpiRow[]): number {
	if (metric === "visitors") {
		return rows.reduce((s, r) => s + r.visitors, 0);
	}
	if (metric === "sessions") {
		return rows.reduce((s, r) => s + r.sessions, 0);
	}
	if (metric === "errors") {
		return rows.reduce((s, r) => s + r.errors, 0);
	}
	if (metric === "bounce") {
		const s = rows.reduce((acc, r) => acc + r.sessions, 0);
		if (s === 0) {
			return 0;
		}
		return (rows.reduce((acc, r) => acc + r.bounces, 0) / s) * 100;
	}
	if (metric === "lcp") {
		const w = rows.reduce((acc, r) => acc + r.visitors, 0);
		if (w === 0) {
			return 0;
		}
		return rows.reduce((acc, r) => acc + r.lcp_p75_ms * r.visitors, 0) / w;
	}
	return 0;
}

export function aggregateKpiSeries(
	rows: DailyKpiRow[],
	opts: { rangeDays: number; metric: KpiMetric }
): KpiSummary {
	const { rangeDays, metric } = opts;

	const firstDate = rows[0]?.date ?? todayUtc();
	const anchor =
		rows.length > 0
			? rows.reduce((max, r) => (r.date > max ? r.date : max), firstDate)
			: todayUtc();

	const currentStart = addDays(anchor, -(rangeDays - 1));
	const previousStart = addDays(anchor, -(rangeDays * 2 - 1));
	const previousEnd = addDays(anchor, -rangeDays);

	const byDate = new Map<string, DailyKpiRow[]>();
	for (const row of rows) {
		const bucket = byDate.get(row.date) ?? [];
		bucket.push(row);
		byDate.set(row.date, bucket);
	}

	const sparkline: { date: string; value: number }[] = [];
	for (let i = 0; i < rangeDays; i++) {
		const date = addDays(currentStart, i);
		const dayRows = byDate.get(date) ?? [];
		sparkline.push({ date, value: aggregate(metric, dayRows) });
	}

	const currentRows = rows.filter(
		(r) => r.date >= currentStart && r.date <= anchor
	);
	const previousRows = rows.filter(
		(r) => r.date >= previousStart && r.date <= previousEnd
	);

	const current = aggregate(metric, currentRows);
	const previous = aggregate(metric, previousRows);
	const change = previous === 0 ? 0 : ((current - previous) / previous) * 100;

	return { current, previous, change, sparkline };
}

export async function fetchOrgKpis(
	websiteIds: string[],
	rangeDays: number
): Promise<OrgKpis> {
	const zeroSummary = (): KpiSummary => ({
		current: 0,
		previous: 0,
		change: 0,
		sparkline: Array.from({ length: rangeDays }, (_, i) => ({
			date: addDays(addDays(todayUtc(), -(rangeDays - 1)), i),
			value: 0,
		})),
	});

	if (websiteIds.length === 0) {
		return {
			visitors: zeroSummary(),
			sessions: zeroSummary(),
			bounce: zeroSummary(),
			errors: zeroSummary(),
			lcp: zeroSummary(),
		};
	}

	const lookbackDays = rangeDays * 2;

	const eventsSql = `
WITH session_agg AS (
  SELECT
    toDate(time) AS date,
    client_id,
    session_id,
    countIf(event_name = 'screen_view') AS page_count,
    sumIf(time_on_page, event_name = 'page_exit' AND time_on_page > 0) AS duration,
    countIf(event_name != 'screen_view' AND event_name != 'page_exit') AS engagement_count
  FROM analytics.events
  WHERE client_id IN {websiteIds:Array(String)}
    AND time >= today() - {lookbackDays:UInt32}
    AND time < today() + 1
    AND session_id != ''
  GROUP BY date, client_id, session_id
),
page_agg AS (
  SELECT
    toDate(time) AS date,
    client_id,
    uniqIf(anonymous_id, event_name = 'screen_view') AS visitors
  FROM analytics.events
  WHERE client_id IN {websiteIds:Array(String)}
    AND time >= today() - {lookbackDays:UInt32}
    AND time < today() + 1
    AND session_id != ''
  GROUP BY date, client_id
),
session_stats AS (
  SELECT
    date,
    client_id,
    countIf(page_count >= 1) AS sessions,
    countIf(page_count = 1 AND duration < 10 AND engagement_count = 0) AS bounces
  FROM session_agg
  GROUP BY date, client_id
)
SELECT
  formatDateTime(p.date, '%Y-%m-%d') AS date,
  p.client_id AS website_id,
  toInt64(p.visitors) AS visitors,
  toInt64(s.sessions) AS sessions,
  toInt64(s.bounces) AS bounces
FROM page_agg p
LEFT JOIN session_stats s ON s.date = p.date AND s.client_id = p.client_id
ORDER BY date ASC
`;

	const errorsSql = `
SELECT
  formatDateTime(toDate(timestamp), '%Y-%m-%d') AS date,
  client_id AS website_id,
  toInt64(count()) AS errors
FROM analytics.error_spans
WHERE client_id IN {websiteIds:Array(String)}
  AND timestamp >= today() - {lookbackDays:UInt32}
  AND timestamp < today() + 1
  AND message != ''
GROUP BY date, client_id
ORDER BY date ASC
`;

	const vitalsSql = `
SELECT
  formatDateTime(toDate(timestamp), '%Y-%m-%d') AS date,
  client_id AS website_id,
  toInt64(quantileIf(0.75)(metric_value, metric_name = 'LCP' AND metric_value > 0)) AS lcp_p75_ms
FROM analytics.web_vitals_spans
WHERE client_id IN {websiteIds:Array(String)}
  AND timestamp >= today() - {lookbackDays:UInt32}
  AND timestamp < today() + 1
GROUP BY date, client_id
ORDER BY date ASC
`;

	const [eventRowsRaw, errorRowsRaw, vitalsRowsRaw] = await Promise.all([
		chQuery<{
			date: unknown;
			website_id: unknown;
			visitors: unknown;
			sessions: unknown;
			bounces: unknown;
		}>(eventsSql, { websiteIds, lookbackDays }),
		chQuery<{
			date: unknown;
			website_id: unknown;
			errors: unknown;
		}>(errorsSql, { websiteIds, lookbackDays }),
		chQuery<{
			date: unknown;
			website_id: unknown;
			lcp_p75_ms: unknown;
		}>(vitalsSql, { websiteIds, lookbackDays }),
	]);

	const key = (date: string, websiteId: string) => `${date}|${websiteId}`;

	const errorsByKey = new Map<string, number>();
	for (const r of errorRowsRaw) {
		errorsByKey.set(
			key(String(r.date), String(r.website_id)),
			Number(r.errors ?? 0)
		);
	}

	const lcpByKey = new Map<string, number>();
	for (const r of vitalsRowsRaw) {
		lcpByKey.set(
			key(String(r.date), String(r.website_id)),
			Number(r.lcp_p75_ms ?? 0)
		);
	}

	const rows = eventRowsRaw.map((r) => {
		const date = String(r.date);
		const websiteId = String(r.website_id);
		const k = key(date, websiteId);
		return {
			date,
			website_id: websiteId,
			visitors: Number(r.visitors ?? 0),
			sessions: Number(r.sessions ?? 0),
			bounces: Number(r.bounces ?? 0),
			errors: errorsByKey.get(k) ?? 0,
			lcp_p75_ms: lcpByKey.get(k) ?? 0,
		} satisfies DailyKpiRow;
	});

	return {
		visitors: aggregateKpiSeries(rows, { rangeDays, metric: "visitors" }),
		sessions: aggregateKpiSeries(rows, { rangeDays, metric: "sessions" }),
		bounce: aggregateKpiSeries(rows, { rangeDays, metric: "bounce" }),
		errors: aggregateKpiSeries(rows, { rangeDays, metric: "errors" }),
		lcp: aggregateKpiSeries(rows, { rangeDays, metric: "lcp" }),
	};
}
