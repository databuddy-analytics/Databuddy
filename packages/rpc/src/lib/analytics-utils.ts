import { chQuery } from "@databuddy/db";
import { referrers } from "@databuddy/shared/lists/referrers";

// Types
export type AnalyticsStep = {
	step_number: number;
	name: string;
	type: "PAGE_VIEW" | "EVENT";
	target: string;
};

export type StepAnalytics = {
	step_number: number;
	step_name: string;
	users: number;
	total_users: number;
	conversion_rate: number;
	dropoffs: number;
	dropoff_rate: number;
	avg_time_to_complete: number;
};

export type FunnelAnalytics = {
	overall_conversion_rate: number;
	total_users_entered: number;
	total_users_completed: number;
	avg_completion_time: number;
	avg_completion_time_formatted: string;
	biggest_dropoff_step: number;
	biggest_dropoff_rate: number;
	steps_analytics: StepAnalytics[];
};

export type ReferrerAnalytics = {
	referrer: string;
	referrer_parsed: { name: string; type: string; domain: string };
	total_users: number;
	completed_users: number;
	conversion_rate: number;
};

type Filter = { field: string; operator: string; value: string | string[] };
type VisitorStep = { step: number; time: number; referrer?: string };

// Helpers
const formatDuration = (seconds: number): string => {
	if (!seconds || seconds <= 0) {
		return "—";
	}
	if (seconds < 60) {
		return `${Math.round(seconds)}s`;
	}
	if (seconds < 3600) {
		const m = Math.floor(seconds / 60);
		const s = Math.round(seconds % 60);
		return s > 0 ? `${m}m ${s}s` : `${m}m`;
	}
	const h = Math.floor(seconds / 3600);
	const m = Math.round((seconds % 3600) / 60);
	return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

const avg = (arr: number[]): number =>
	arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

const pct = (num: number, denom: number): number =>
	denom > 0 ? Math.round((num / denom) * 10_000) / 100 : 0;

const parseReferrer = (ref: string) => {
	if (!ref || ref === "Direct" || ref.toLowerCase() === "(direct)") {
		return { name: "Direct", type: "direct", domain: "" };
	}

	try {
		const url = new URL(ref.includes("://") ? ref : `https://${ref}`);
		const host = url.hostname.replace(/^www\./, "").toLowerCase();
		const known = referrers[url.hostname] || referrers[host];

		return known
			? { name: known.name, type: known.type, domain: host }
			: { name: host, type: "referrer", domain: host };
	} catch {
		return { name: ref, type: "referrer", domain: "" };
	}
};

// Filter building
const FIELDS = new Set([
	"event_name",
	"path",
	"referrer",
	"user_agent",
	"country",
	"city",
	"device_type",
	"browser_name",
	"os_name",
	"screen_resolution",
	"language",
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_term",
	"utm_content",
]);

const OPS = new Set([
	"equals",
	"not_equals",
	"contains",
	"not_contains",
	"starts_with",
	"ends_with",
	"in",
	"not_in",
	"is_null",
	"is_not_null",
]);

const buildFilterSQL = (
	filters: Filter[],
	params: Record<string, unknown>
): string => {
	const parts: string[] = [];

	for (let i = 0; i < filters.length; i++) {
		const { field, operator, value } = filters[i];
		if (!(FIELDS.has(field) && OPS.has(operator))) {
			continue;
		}

		const key = `f${i}`;

		if (operator === "is_null") {
			parts.push(`${field} IS NULL`);
		} else if (operator === "is_not_null") {
			parts.push(`${field} IS NOT NULL`);
		} else if (Array.isArray(value)) {
			params[key] = value;
			parts.push(
				`${field} ${operator === "in" ? "IN" : "NOT IN"} {${key}:Array(String)}`
			);
		} else {
			const escaped = value.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&");
			if (operator === "contains" || operator === "not_contains") {
				params[key] = `%${escaped}%`;
				parts.push(
					`${field} ${operator === "contains" ? "LIKE" : "NOT LIKE"} {${key}:String}`
				);
			} else if (operator === "starts_with") {
				params[key] = `${escaped}%`;
				parts.push(`${field} LIKE {${key}:String}`);
			} else if (operator === "ends_with") {
				params[key] = `%${escaped}`;
				parts.push(`${field} LIKE {${key}:String}`);
			} else {
				params[key] = escaped;
				parts.push(
					`${field} ${operator === "equals" ? "=" : "!="} {${key}:String}`
				);
			}
		}
	}

	return parts.length > 0 ? ` AND ${parts.join(" AND ")}` : "";
};

// Query building
const buildStepQuery = (
	step: AnalyticsStep,
	idx: number,
	filterSQL: string,
	params: Record<string, unknown>,
	includeReferrer = false
): string => {
	params[`n${idx}`] = step.name;
	params[`t${idx}`] = step.target;

	const refCol = includeReferrer ? ", any(referrer) as ref" : "";
	const base = `client_id = {websiteId:String}
		AND time >= parseDateTimeBestEffort({startDate:String})
		AND time <= parseDateTimeBestEffort({endDate:String})`;

	if (step.type === "PAGE_VIEW") {
		const escapedTarget = step.target
			.replace(/\\/g, "\\\\")
			.replace(/[%_]/g, "\\$&");
		params[`t${idx}l`] = `%${escapedTarget}%`;
		return `SELECT ${idx + 1} as step, {n${idx}:String} as name, anonymous_id as vid, MIN(time) as ts${refCol}
			FROM analytics.events
			WHERE ${base} AND event_name = 'screen_view'
				AND (path = {t${idx}:String} OR path LIKE {t${idx}l:String})${filterSQL}
			GROUP BY vid`;
	}

	// EVENT: query both tables
	const refJoin = includeReferrer
		? `LEFT JOIN (
			SELECT anonymous_id as vid, argMin(referrer, time) as vref
			FROM analytics.events WHERE ${base} AND event_name = 'screen_view' AND referrer != ''
			GROUP BY vid
		) r ON e.vid = r.vid`
		: "";

	return `SELECT ${idx + 1} as step, {n${idx}:String} as name, e.vid as vid, MIN(ts) as ts${includeReferrer ? ", COALESCE(r.vref, '') as ref" : ""}
		FROM (
			SELECT anonymous_id as vid, time as ts FROM analytics.events
			WHERE ${base} AND event_name = {t${idx}:String}${filterSQL}
			UNION ALL
			SELECT anonymous_id as vid, timestamp as ts FROM analytics.custom_event_spans
			WHERE client_id = {websiteId:String}
				AND timestamp >= parseDateTimeBestEffort({startDate:String})
				AND timestamp <= parseDateTimeBestEffort({endDate:String})
				AND event_name = {t${idx}:String}
		) e ${refJoin}
		GROUP BY e.vid${includeReferrer ? ", r.vref" : ""}`;
};

// Process raw results into visitor -> steps map
const groupByVisitor = (
	rows: Array<{ step: number; vid: string; ts: number; ref?: string }>
): Map<string, VisitorStep[]> => {
	const map = new Map<string, VisitorStep[]>();
	for (const r of rows) {
		let arr = map.get(r.vid);
		if (!arr) {
			arr = [];
			map.set(r.vid, arr);
		}
		arr.push({ step: r.step, time: r.ts, referrer: r.ref });
	}
	return map;
};

// Count visitors who completed each step in order
const countStepCompletions = (
	visitors: Map<string, VisitorStep[]>,
	filter?: Set<string>
): Map<number, Set<string>> => {
	const counts = new Map<number, Set<string>>();

	for (const [vid, steps] of visitors) {
		if (filter && !filter.has(vid)) {
			continue;
		}

		steps.sort((a, b) => a.time - b.time);
		let expected = 1;

		for (const s of steps) {
			if (s.step === expected) {
				let set = counts.get(expected);
				if (!set) {
					set = new Set();
					counts.set(expected, set);
				}
				set.add(vid);
				expected += 1;
			}
		}
	}
	return counts;
};

// Main funnel analytics
export const processFunnelAnalytics = async (
	steps: AnalyticsStep[],
	filters: Filter[],
	params: Record<string, unknown>
): Promise<FunnelAnalytics> => {
	const filterSQL = buildFilterSQL(filters, params);
	const stepQueries = steps.map((s, i) =>
		buildStepQuery(s, i, filterSQL, params)
	);

	const rows = await chQuery<{
		step: number;
		name: string;
		vid: string;
		ts: number;
	}>(
		`WITH events AS (${stepQueries.join("\nUNION ALL\n")})
		 SELECT DISTINCT step, name, vid, ts FROM events ORDER BY vid, ts`,
		params
	);

	const visitors = groupByVisitor(rows);
	const counts = countStepCompletions(visitors);
	const totalSteps = steps.length;
	const totalUsers = counts.get(1)?.size || 0;

	// Calculate step timings
	const completionTimes: number[] = [];
	const stepTimes = new Map<number, number[]>();

	for (const [, stepList] of visitors) {
		stepList.sort((a, b) => a.time - b.time);
		let expected = 1;
		let firstTime = 0;
		let prevTime = 0;

		for (const s of stepList) {
			if (s.step === expected) {
				if (expected === 1) {
					firstTime = prevTime = s.time;
				} else {
					let arr = stepTimes.get(expected);
					if (!arr) {
						arr = [];
						stepTimes.set(expected, arr);
					}
					arr.push(s.time - prevTime);
					prevTime = s.time;
				}
				if (expected === totalSteps) {
					completionTimes.push(s.time - firstTime);
				}
				expected += 1;
			}
		}
	}

	const avgTime = avg(completionTimes);

	// Build step analytics
	const stepsAnalytics: StepAnalytics[] = steps.map((s, i) => {
		const stepNum = i + 1;
		const users = counts.get(stepNum)?.size || 0;
		const prev = i > 0 ? counts.get(i)?.size || 0 : users;
		const drops = i > 0 ? prev - users : 0;

		return {
			step_number: stepNum,
			step_name: s.name,
			users,
			total_users: totalUsers,
			conversion_rate: i > 0 ? pct(users, prev) : 100,
			dropoffs: drops,
			dropoff_rate: i > 0 ? pct(drops, prev) : 0,
			avg_time_to_complete: avg(stepTimes.get(stepNum) || []),
		};
	});

	const lastStep = stepsAnalytics.at(-1);
	const biggestDropoff = stepsAnalytics
		.slice(1)
		.reduce(
			(max, s) => (s.dropoff_rate > max.dropoff_rate ? s : max),
			stepsAnalytics[1] || stepsAnalytics[0]
		);

	return {
		overall_conversion_rate: pct(lastStep?.users || 0, totalUsers),
		total_users_entered: totalUsers,
		total_users_completed: lastStep?.users || 0,
		avg_completion_time: avgTime,
		avg_completion_time_formatted: formatDuration(avgTime),
		biggest_dropoff_step: biggestDropoff?.step_number || 1,
		biggest_dropoff_rate: biggestDropoff?.dropoff_rate || 0,
		steps_analytics: stepsAnalytics,
	};
};

// Goal analytics (single step)
export const processGoalAnalytics = async (
	steps: AnalyticsStep[],
	filters: Filter[],
	params: Record<string, unknown>,
	totalWebsiteUsers: number
): Promise<FunnelAnalytics> => {
	const filterSQL = buildFilterSQL(filters, params);
	const step = steps[0];

	const rows = await chQuery<{ step: number; vid: string; ts: number }>(
		`WITH events AS (${buildStepQuery(step, 0, filterSQL, params)})
		 SELECT DISTINCT step, vid, ts FROM events`,
		params
	);

	const completions = new Set(rows.map((r) => r.vid)).size;

	return {
		overall_conversion_rate: pct(completions, totalWebsiteUsers),
		total_users_entered: totalWebsiteUsers,
		total_users_completed: completions,
		avg_completion_time: 0,
		avg_completion_time_formatted: "—",
		biggest_dropoff_step: 1,
		biggest_dropoff_rate: 0,
		steps_analytics: [
			{
				step_number: 1,
				step_name: step.name,
				users: completions,
				total_users: totalWebsiteUsers,
				conversion_rate: pct(completions, totalWebsiteUsers),
				dropoffs: 0,
				dropoff_rate: 0,
				avg_time_to_complete: 0,
			},
		],
	};
};

// Referrer analytics
export const processFunnelAnalyticsByReferrer = async (
	steps: AnalyticsStep[],
	filters: Filter[],
	params: Record<string, unknown>
): Promise<{ referrer_analytics: ReferrerAnalytics[] }> => {
	const filterSQL = buildFilterSQL(filters, params);
	const stepQueries = steps.map((s, i) =>
		buildStepQuery(s, i, filterSQL, params, true)
	);

	const rows = await chQuery<{
		step: number;
		vid: string;
		ts: number;
		ref: string;
	}>(
		`WITH events AS (${stepQueries.join("\nUNION ALL\n")})
		 SELECT DISTINCT step, vid, ts, ref FROM events ORDER BY vid, ts`,
		params
	);

	const visitors = groupByVisitor(rows);
	const totalSteps = steps.length;

	// Group visitors by referrer
	const groups = new Map<
		string,
		{ parsed: ReturnType<typeof parseReferrer>; vids: Set<string> }
	>();

	for (const [vid, stepList] of visitors) {
		if (stepList.length === 0) {
			continue;
		}

		const ref = stepList[0].referrer || "Direct";
		const parsed = parseReferrer(ref);
		const key = parsed.domain || "direct";

		let group = groups.get(key);
		if (!group) {
			group = { parsed, vids: new Set() };
			groups.set(key, group);
		}
		group.vids.add(vid);
	}

	// Calculate per-referrer conversions
	const analytics: ReferrerAnalytics[] = [];

	for (const [key, { parsed, vids }] of groups) {
		const counts = countStepCompletions(visitors, vids);
		const total = counts.get(1)?.size || 0;
		const completed = counts.get(totalSteps)?.size || 0;
		const rate = pct(completed, total);

		if (total <= 1) {
			continue;
		}

		analytics.push({
			referrer: key,
			referrer_parsed: parsed,
			total_users: total,
			completed_users: completed,
			conversion_rate: rate,
		});
	}

	return {
		referrer_analytics: analytics.sort((a, b) => b.total_users - a.total_users),
	};
};

// Get total unique visitors for a website in date range
export const getTotalWebsiteUsers = async (
	websiteId: string,
	startDate: string,
	endDate: string
): Promise<number> => {
	const [result] = await chQuery<{ count: number }>(
		`SELECT COUNT(DISTINCT anonymous_id) as count FROM analytics.events
		 WHERE client_id = {websiteId:String}
			AND time >= parseDateTimeBestEffort({startDate:String})
			AND time <= parseDateTimeBestEffort({endDate:String})
			AND event_name = 'screen_view'`,
		{ websiteId, startDate, endDate: `${endDate} 23:59:59` }
	);
	return result?.count ?? 0;
};

// Re-export for backwards compatibility
export const buildFilterConditions = (
	filters: Filter[],
	_prefix: string,
	params: Record<string, unknown>
): { conditions: string; errors: string[] } => ({
	conditions: buildFilterSQL(filters, params),
	errors: [],
});
