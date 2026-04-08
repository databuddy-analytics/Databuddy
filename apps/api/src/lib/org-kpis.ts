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

	const sql = `
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
    countIf(event_name = 'screen_view') AS pageviews,
    uniqIf(anonymous_id, event_name = 'screen_view') AS visitors,
    toInt64(0) AS errors -- TODO(DAT-100): wire real error event filter (errors live in analytics.error_spans)
  FROM analytics.events
  WHERE client_id IN {websiteIds:Array(String)}
    AND time >= today() - {lookbackDays:UInt32}
    AND time < today() + 1
  GROUP BY date, client_id
),
session_stats AS (
  SELECT
    date,
    client_id,
    count() AS sessions,
    countIf(page_count = 1 AND duration < 10 AND engagement_count = 0) AS bounces
  FROM session_agg
  GROUP BY date, client_id
)
SELECT
  formatDateTime(p.date, '%Y-%m-%d') AS date,
  p.client_id AS website_id,
  toInt64(p.visitors) AS visitors,
  toInt64(s.sessions) AS sessions,
  toInt64(s.bounces) AS bounces,
  toInt64(p.errors) AS errors,
  toInt64(0) AS lcp_p75_ms -- TODO(DAT-100): wire vitals query
FROM page_agg p
LEFT JOIN session_stats s ON s.date = p.date AND s.client_id = p.client_id
ORDER BY date ASC
`;

	const raw = await chQuery<{
		date: unknown;
		website_id: unknown;
		visitors: unknown;
		sessions: unknown;
		bounces: unknown;
		errors: unknown;
		lcp_p75_ms: unknown;
	}>(sql, { websiteIds, lookbackDays });

	const rows = raw.map(
		(r) =>
			({
				date: String(r.date),
				website_id: String(r.website_id),
				visitors: Number(r.visitors ?? 0),
				sessions: Number(r.sessions ?? 0),
				bounces: Number(r.bounces ?? 0),
				errors: Number(r.errors ?? 0),
				lcp_p75_ms: Number(r.lcp_p75_ms ?? 0),
			}) satisfies DailyKpiRow
	);

	return {
		visitors: aggregateKpiSeries(rows, { rangeDays, metric: "visitors" }),
		sessions: aggregateKpiSeries(rows, { rangeDays, metric: "sessions" }),
		bounce: aggregateKpiSeries(rows, { rangeDays, metric: "bounce" }),
		errors: aggregateKpiSeries(rows, { rangeDays, metric: "errors" }),
		lcp: aggregateKpiSeries(rows, { rangeDays, metric: "lcp" }),
	};
}
