import { chQuery, TABLE_NAMES } from "@databuddy/db/clickhouse";

/** ClickHouse `formatDateTime`: use `%i` for minutes. Since v23.4, `%M` is the full month name (MySQL-style). */

export type AnomalyType = "spike" | "drop";
export type AnomalyMetric = "pageviews" | "custom_events" | "errors";
export type AnomalySeverity = "warning" | "critical";

export interface DetectedAnomaly {
	baselineMean: number;
	baselineStdDev: number;
	currentValue: number;
	detectedAt: string;
	eventName?: string;
	metric: AnomalyMetric;
	percentChange: number;
	periodEnd: string;
	periodStart: string;
	severity: AnomalySeverity;
	type: AnomalyType;
	zScore: number;
}

export interface AnomalyDetectionConfig {
	baselineDays: number;
	criticalThreshold: number;
	minimumBaselineCount: number;
	/** Percentage change threshold used when stddev is 0 (default 200 = 3x the mean) */
	percentChangeFallback: number;
	warningThreshold: number;
}

const DEFAULT_CONFIG: AnomalyDetectionConfig = {
	warningThreshold: 2,
	criticalThreshold: 3,
	baselineDays: 7,
	minimumBaselineCount: 5,
	percentChangeFallback: 200,
};

interface HourlyBaseline {
	avg_count: number;
	hour_of_day: number;
	sample_count: number;
	stddev_count: number;
	total_count: number;
}

interface RecentHourRow {
	event_count: number;
	hour_of_day: number;
	period_end: string;
	period_start: string;
}

function classifySeverity(
	absZScore: number,
	config: AnomalyDetectionConfig
): AnomalySeverity | null {
	if (absZScore >= config.criticalThreshold) {
		return "critical";
	}
	if (absZScore >= config.warningThreshold) {
		return "warning";
	}
	return null;
}

function computePercentChange(current: number, baseline: number): number {
	if (baseline === 0) {
		return current > 0 ? 100 : 0;
	}
	return ((current - baseline) / baseline) * 100;
}

/**
 * When stddev is 0 (perfectly consistent traffic), fall back to
 * percentage-change-based severity. A 3x jump (200% change) is warning,
 * 5x (400%) is critical.
 */
function classifyByPercentChange(
	pctChange: number,
	config: AnomalyDetectionConfig
): AnomalySeverity | null {
	const absPct = Math.abs(pctChange);
	if (absPct >= config.percentChangeFallback * 2) {
		return "critical";
	}
	if (absPct >= config.percentChangeFallback) {
		return "warning";
	}
	return null;
}

function resolveTimeCol(metric: AnomalyMetric): string {
	return metric === "pageviews" ? "time" : "timestamp";
}

function resolveTable(metric: AnomalyMetric): string {
	if (metric === "errors") {
		return TABLE_NAMES.error_spans;
	}
	return TABLE_NAMES.events;
}

function resolveEventFilter(metric: AnomalyMetric): string {
	if (metric === "pageviews") {
		return "AND event_name = 'screen_view'";
	}
	return "";
}

async function fetchHourlyBaseline(
	clientId: string,
	metric: AnomalyMetric,
	config: AnomalyDetectionConfig
): Promise<HourlyBaseline[]> {
	const table = resolveTable(metric);
	const timeCol = resolveTimeCol(metric);
	const eventFilter = resolveEventFilter(metric);

	const query = `
		SELECT
			hour_of_day,
			avg(hourly_count) AS avg_count,
			stddevPop(hourly_count) AS stddev_count,
			count() AS sample_count,
			sum(hourly_count) AS total_count
		FROM (
			SELECT
				toStartOfHour(${timeCol}) AS hour_start,
				toHour(${timeCol}) AS hour_of_day,
				count() AS hourly_count
			FROM ${table}
			WHERE client_id = {clientId: String}
				AND ${timeCol} >= now() - INTERVAL {baselineDays: UInt32} DAY
				AND ${timeCol} < toStartOfHour(now())
				${eventFilter}
			GROUP BY hour_start, hour_of_day
		)
		GROUP BY hour_of_day
		ORDER BY hour_of_day
	`;

	return await chQuery<HourlyBaseline>(query, {
		clientId,
		baselineDays: config.baselineDays,
	});
}

/**
 * Fetches the last 3 completed hours + the current in-progress hour.
 * This catches spikes that are happening right now, not just finished ones.
 */
async function fetchRecentHours(
	clientId: string,
	metric: AnomalyMetric
): Promise<RecentHourRow[]> {
	const table = resolveTable(metric);
	const timeCol = resolveTimeCol(metric);
	const eventFilter = resolveEventFilter(metric);

	const query = `
		SELECT
			count() AS event_count,
			toHour(toStartOfHour(${timeCol})) AS hour_of_day,
			formatDateTime(toStartOfHour(${timeCol}), '%Y-%m-%d %H:%i:%S') AS period_start,
			formatDateTime(toStartOfHour(${timeCol}) + INTERVAL 1 HOUR, '%Y-%m-%d %H:%i:%S') AS period_end
		FROM ${table}
		WHERE client_id = {clientId: String}
			AND ${timeCol} >= toStartOfHour(now() - INTERVAL 3 HOUR)
			${eventFilter}
		GROUP BY toStartOfHour(${timeCol})
		ORDER BY period_start DESC
	`;

	return await chQuery<RecentHourRow>(query, { clientId });
}

function buildAnomaly(
	metric: AnomalyMetric,
	current: RecentHourRow,
	hourBaseline: HourlyBaseline,
	config: AnomalyDetectionConfig,
	eventName?: string
): DetectedAnomaly | null {
	const pctChange = computePercentChange(
		current.event_count,
		hourBaseline.avg_count
	);

	let zScore: number;
	let severity: AnomalySeverity | null;

	if (hourBaseline.stddev_count === 0) {
		severity = classifyByPercentChange(pctChange, config);
		zScore =
			hourBaseline.avg_count > 0
				? (current.event_count - hourBaseline.avg_count) /
					Math.max(hourBaseline.avg_count * 0.1, 1)
				: current.event_count > 0
					? 5
					: 0;
	} else {
		zScore =
			(current.event_count - hourBaseline.avg_count) /
			hourBaseline.stddev_count;
		severity = classifySeverity(Math.abs(zScore), config);
	}

	if (!severity) {
		return null;
	}

	return {
		metric,
		type: current.event_count > hourBaseline.avg_count ? "spike" : "drop",
		severity,
		currentValue: current.event_count,
		baselineMean: Math.round(hourBaseline.avg_count * 100) / 100,
		baselineStdDev: Math.round(hourBaseline.stddev_count * 100) / 100,
		zScore: Math.round(zScore * 100) / 100,
		percentChange: Math.round(pctChange * 10) / 10,
		detectedAt: new Date().toISOString(),
		periodStart: current.period_start,
		periodEnd: current.period_end,
		eventName,
	};
}

async function detectMetricAnomalies(
	clientId: string,
	metric: "pageviews" | "errors",
	config: AnomalyDetectionConfig
): Promise<DetectedAnomaly[]> {
	const [baseline, recentHours] = await Promise.all([
		fetchHourlyBaseline(clientId, metric, config),
		fetchRecentHours(clientId, metric),
	]);

	if (recentHours.length === 0) {
		return [];
	}

	const anomalies: DetectedAnomaly[] = [];

	for (const hourRow of recentHours) {
		const hourBaseline = baseline.find(
			(b) => b.hour_of_day === hourRow.hour_of_day
		);

		if (
			!hourBaseline ||
			hourBaseline.total_count < config.minimumBaselineCount
		) {
			continue;
		}

		const anomaly = buildAnomaly(metric, hourRow, hourBaseline, config);
		if (anomaly) {
			anomalies.push(anomaly);
		}
	}

	return anomalies;
}

async function fetchCustomEventAnomalies(
	clientId: string,
	config: AnomalyDetectionConfig
): Promise<DetectedAnomaly[]> {
	const query = `
		WITH baseline AS (
			SELECT
				event_name,
				hour_of_day,
				avg(hourly_count) AS avg_count,
				stddevPop(hourly_count) AS stddev_count,
				sum(hourly_count) AS total_count
			FROM (
				SELECT
					event_name,
					toStartOfHour(timestamp) AS hour_start,
					toHour(timestamp) AS hour_of_day,
					count() AS hourly_count
				FROM ${TABLE_NAMES.custom_events}
				WHERE owner_id = {clientId: String}
					AND timestamp >= now() - INTERVAL {baselineDays: UInt32} DAY
					AND timestamp < toStartOfHour(now())
				GROUP BY event_name, hour_start, hour_of_day
			)
			GROUP BY event_name, hour_of_day
		),
		recent AS (
			SELECT
				event_name,
				count() AS event_count,
				toHour(toStartOfHour(timestamp)) AS hour_of_day,
				formatDateTime(toStartOfHour(timestamp), '%Y-%m-%d %H:%i:%S') AS period_start,
				formatDateTime(toStartOfHour(timestamp) + INTERVAL 1 HOUR, '%Y-%m-%d %H:%i:%S') AS period_end
			FROM ${TABLE_NAMES.custom_events}
			WHERE owner_id = {clientId: String}
				AND timestamp >= toStartOfHour(now() - INTERVAL 3 HOUR)
			GROUP BY event_name, toStartOfHour(timestamp)
		)
		SELECT
			r.event_name,
			r.event_count,
			b.avg_count,
			b.stddev_count,
			b.total_count,
			r.period_start,
			r.period_end,
			r.hour_of_day
		FROM recent r
		LEFT JOIN baseline b ON r.event_name = b.event_name AND r.hour_of_day = b.hour_of_day
		WHERE b.total_count >= {minBaseline: UInt32}
	`;

	const rows = await chQuery<{
		event_name: string;
		event_count: number;
		avg_count: number;
		stddev_count: number;
		total_count: number;
		period_start: string;
		period_end: string;
		hour_of_day: number;
	}>(query, {
		clientId,
		baselineDays: config.baselineDays,
		minBaseline: config.minimumBaselineCount,
	});

	const anomalies: DetectedAnomaly[] = [];

	for (const row of rows) {
		const hourBaseline: HourlyBaseline = {
			hour_of_day: row.hour_of_day,
			avg_count: row.avg_count,
			stddev_count: row.stddev_count,
			sample_count: 0,
			total_count: row.total_count,
		};
		const current: RecentHourRow = {
			event_count: row.event_count,
			hour_of_day: row.hour_of_day,
			period_start: row.period_start,
			period_end: row.period_end,
		};

		const anomaly = buildAnomaly(
			"custom_events",
			current,
			hourBaseline,
			config,
			row.event_name
		);
		if (anomaly) {
			anomalies.push(anomaly);
		}
	}

	return anomalies.sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}

export async function detectAnomalies(
	clientId: string,
	config: Partial<AnomalyDetectionConfig> = {}
): Promise<DetectedAnomaly[]> {
	const mergedConfig = { ...DEFAULT_CONFIG, ...config };

	const [pageviewAnomalies, errorAnomalies, customEventAnomalies] =
		await Promise.all([
			detectMetricAnomalies(clientId, "pageviews", mergedConfig),
			detectMetricAnomalies(clientId, "errors", mergedConfig),
			fetchCustomEventAnomalies(clientId, mergedConfig),
		]);

	return [
		...pageviewAnomalies,
		...errorAnomalies,
		...customEventAnomalies,
	].sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}

export async function fetchAnomalyTimeSeries(
	clientId: string,
	metric: AnomalyMetric,
	days = 7
): Promise<Array<{ hour: string; count: number }>> {
	const table =
		metric === "errors"
			? TABLE_NAMES.error_spans
			: metric === "custom_events"
				? TABLE_NAMES.custom_events
				: TABLE_NAMES.events;

	const timeCol = metric === "pageviews" ? "time" : "timestamp";
	const idCol = metric === "custom_events" ? "owner_id" : "client_id";
	const eventFilter = resolveEventFilter(metric);

	const query = `
		SELECT
			formatDateTime(toStartOfHour(${timeCol}), '%Y-%m-%d %H:00:00') AS hour,
			count() AS count
		FROM ${table}
		WHERE ${idCol} = {clientId: String}
			AND ${timeCol} >= now() - INTERVAL {days: UInt32} DAY	
			${eventFilter}
		GROUP BY hour
		ORDER BY hour
	`;

	return await chQuery<{ hour: string; count: number }>(query, {
		clientId,
		days,
	});
}
