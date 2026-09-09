import { z } from "zod";
import { Analytics } from "../../types/tables";
import type { SimpleQueryConfig } from "../types";

const selectors = z.strictObject({
	activation_event: z.string().min(1).max(256),
	return_event: z.string().min(1).max(256),
	horizon_days: z
		.union([z.literal(7), z.literal(30), z.literal("7"), z.literal("30")])
		.transform(Number),
	observation_end: z.iso.date(),
	namespace: z.string().min(1).max(256).optional(),
});

export const RetentionBuilders: Record<string, SimpleQueryConfig> = {
	identified_profile_retention: {
		commonFilters: false,
		allowedFilters: [
			"activation_event",
			"return_event",
			"horizon_days",
			"observation_end",
			"namespace",
		],
		requiredFilters: [
			"activation_event",
			"return_event",
			"horizon_days",
			"observation_end",
		],
		allowedFilterOperators: {
			activation_event: ["eq"],
			return_event: ["eq"],
			horizon_days: ["eq"],
			observation_end: ["eq"],
			namespace: ["eq"],
		},
		noCache: true,
		meta: {
			title: "Identified profile activation retention",
			category: "Profiles",
			tags: ["retention", "activation", "cohort", "identified", "coverage"],
			description:
				"Directly identified profile retention on exact custom events. Required scalar eq filters: activation_event, return_event, horizon_days (7 or 30), observation_end (YYYY-MM-DD); optional exact namespace scopes both events. from/to are inclusive cohort calendar dates in timezone (default UTC), at most 90 days. observation_end is an inclusive observation date >= to, capped at query time. Each owner-scoped profile activates once at its earliest matching event IN this cohort window, not first-ever. Return interval is (activation, activation + horizon * 24 hours], not day-N retention. Only fully observed profiles enter retained/not_retained and the retention rate; incomplete follow-up is separate even if a return is already observed. No anonymous joins, person, customer or subscription inference. Overall row first, followed by daily cohorts; do not sum the overall row with daily rows. Identity coverage counts raw activation events (including duplicates), not profiles or population coverage. Fixed daily grouping/order; omit groupBy/orderBy. At most 91 SQL rows; limit100 includes all. get_data separately caps returnedRows at 20 and reports rowCount/truncated. No referrer attribution.",
			default_order: "row_type DESC, cohort_date ASC",
			default_visualization: "table",
			output_fields: [
				{ name: "row_type", type: "string", description: "overall or cohort" },
				{
					name: "cohort_date",
					type: "date",
					description: "Activation calendar date; null for overall",
				},
				{ name: "activated_profiles", type: "number" },
				{
					name: "eligible_profiles",
					type: "number",
					description: "Full return interval observed",
				},
				{
					name: "retained_profiles",
					type: "number",
					description: "Eligible profiles with a qualifying return",
				},
				{
					name: "not_retained_profiles",
					type: "number",
					description: "Eligible profiles without a qualifying return",
				},
				{
					name: "incomplete_profiles",
					type: "number",
					description: "Excluded from retention denominator and failures",
				},
				{
					name: "retention_rate",
					type: "number",
					unit: "%",
					description: "Null when eligible_profiles is zero",
				},
				{ name: "activation_events", type: "number" },
				{ name: "identified_activation_events", type: "number" },
				{ name: "unidentified_activation_events", type: "number" },
				{
					name: "activation_identity_coverage",
					type: "number",
					unit: "%",
					description:
						"Event-level percentage with direct profile_id; null for no activation events",
				},
				{ name: "cohort_from", type: "date" },
				{ name: "cohort_to", type: "date" },
				{
					name: "cohort_start",
					type: "datetime",
					description: "Inclusive cohort start in UTC",
				},
				{
					name: "cohort_end",
					type: "datetime",
					description: "Exclusive cohort end in UTC",
				},
				{
					name: "observation_end",
					type: "date",
					description: "Requested inclusive observation date",
				},
				{
					name: "observed_before",
					type: "datetime",
					description: "Exclusive effective observation cutoff in UTC",
				},
				{ name: "timezone", type: "string" },
				{ name: "horizon_days", type: "number" },
				{ name: "identity_basis", type: "string" },
				{ name: "activation_basis", type: "string" },
			],
		},
		customSql: (ctx) => {
			const filters = ctx.filters ?? [];
			if (
				filters.some(
					(filter) => filter.op !== "eq" || filter.target || filter.having
				) ||
				new Set(filters.map((filter) => filter.field)).size !== filters.length
			) {
				throw new Error(
					"Invalid retention selectors: supply each selector once with scalar eq."
				);
			}
			const parsed = selectors.safeParse(
				Object.fromEntries(
					filters.map((filter) => [filter.field, filter.value])
				)
			);
			if (!parsed.success) {
				throw new Error(
					"Invalid retention selectors: activation_event and return_event must be nonempty strings, horizon_days must be 7 or 30, and observation_end must be YYYY-MM-DD; namespace is optional."
				);
			}
			const dates = z
				.tuple([z.iso.date(), z.iso.date()])
				.safeParse([ctx.startDate, ctx.endDate]);
			if (
				!dates.success ||
				ctx.startDate > ctx.endDate ||
				(Date.parse(ctx.endDate) - Date.parse(ctx.startDate)) / 86_400_000 >=
					90 ||
				parsed.data.observation_end < ctx.endDate
			) {
				throw new Error(
					"Invalid retention dates: from/to must be YYYY-MM-DD spanning 1–90 inclusive cohort days, and observation_end must be on or after to."
				);
			}
			if (
				ctx.groupBy?.length ||
				(ctx.orderBy && ctx.orderBy !== "row_type DESC, cohort_date ASC") ||
				ctx.offset ||
				(ctx.granularity &&
					ctx.granularity !== "day" &&
					ctx.granularity !== "daily")
			) {
				throw new Error(
					"Invalid retention options: fixed daily cohorts with overall row first; omit groupBy, orderBy and offset."
				);
			}
			const scope = ctx.filterParams?.__orgLevel
				? "owner_id = {projectId:String}"
				: "(owner_id = {projectId:String} OR website_id = {projectId:String})";
			return {
				params: {
					projectId: ctx.websiteId,
					cohortFrom: ctx.startDate,
					cohortTo: ctx.endDate,
					timezone: ctx.timezone ?? "UTC",
					limit: Math.min(ctx.limit ?? 91, 91),
					...parsed.data,
				},
				sql: `
					WITH
						toDateTime64({cohortFrom:String}, 3, {timezone:String}) AS cohort_start_at,
						toDateTime64(addDays(toDate({cohortTo:String}), 1), 3, {timezone:String}) AS cohort_end_at,
						least(toDateTime64(addDays(toDate({observation_end:String}), 1), 3, {timezone:String}), now64(3)) AS observation_cutoff,
						scoped AS (
							SELECT owner_id, profile_id, timestamp, event_name
							FROM ${Analytics.custom_events}
							WHERE ${scope}
								AND timestamp >= cohort_start_at
								AND timestamp < least(observation_cutoff, cohort_end_at + toIntervalHour({horizon_days:UInt8} * 24))
								AND event_name IN ({activation_event:String}, {return_event:String})
								${parsed.data.namespace === undefined ? "" : "AND namespace = {namespace:String}"}
						),
						activations AS (
							SELECT owner_id, profile_id, min(timestamp) AS activated_at
							FROM scoped
							WHERE event_name = {activation_event:String} AND timestamp < cohort_end_at AND profile_id != ''
							GROUP BY owner_id, profile_id
						),
						profiles AS (
							SELECT a.owner_id, a.profile_id, a.activated_at,
								a.activated_at + toIntervalHour({horizon_days:UInt8} * 24) < observation_cutoff AS is_eligible,
								max(r.timestamp > a.activated_at AND r.timestamp <= a.activated_at + toIntervalHour({horizon_days:UInt8} * 24)) AS has_return
							FROM activations a
							LEFT ALL JOIN (SELECT owner_id, profile_id, timestamp FROM scoped WHERE event_name = {return_event:String} AND profile_id != '') r
								ON a.owner_id = r.owner_id AND a.profile_id = r.profile_id
							GROUP BY a.owner_id, a.profile_id, a.activated_at
						),
						metrics AS (
							SELECT toDate(activated_at, {timezone:String}) AS day,
								count() AS activated, countIf(is_eligible) AS eligible,
								countIf(is_eligible AND has_return) AS retained,
								toUInt64(0) AS events, toUInt64(0) AS identified_events
							FROM profiles GROUP BY day
							UNION ALL
							SELECT toDate(timestamp, {timezone:String}) AS day,
								toUInt64(0) AS activated, toUInt64(0) AS eligible, toUInt64(0) AS retained,
								count() AS events, countIf(profile_id != '') AS identified_events
							FROM scoped WHERE event_name = {activation_event:String} AND timestamp < cohort_end_at
							GROUP BY day
						)
					SELECT
						if(grouping(day) = 1, 'overall', 'cohort') AS row_type,
						if(grouping(day) = 1, NULL, day) AS cohort_date,
						sum(activated) AS activated_profiles,
						sum(eligible) AS eligible_profiles,
						sum(retained) AS retained_profiles,
						sum(eligible) - sum(retained) AS not_retained_profiles,
						sum(activated) - sum(eligible) AS incomplete_profiles,
						round(100.0 * sum(retained) / nullIf(sum(eligible), 0), 2) AS retention_rate,
						sum(events) AS activation_events,
						sum(identified_events) AS identified_activation_events,
						sum(events) - sum(identified_events) AS unidentified_activation_events,
						round(100.0 * sum(identified_events) / nullIf(sum(events), 0), 2) AS activation_identity_coverage,
						{cohortFrom:String} AS cohort_from,
						{cohortTo:String} AS cohort_to,
						concat(replaceOne(toString(cohort_start_at, 'UTC'), ' ', 'T'), 'Z') AS cohort_start,
						concat(replaceOne(toString(cohort_end_at, 'UTC'), ' ', 'T'), 'Z') AS cohort_end,
						{observation_end:String} AS observation_end,
						concat(replaceOne(toString(observation_cutoff, 'UTC'), ' ', 'T'), 'Z') AS observed_before,
						{timezone:String} AS timezone,
						{horizon_days:UInt8} AS horizon_days,
						'direct_profile_id' AS identity_basis,
						'first_in_cohort_window' AS activation_basis
					FROM metrics
					GROUP BY GROUPING SETS ((day), ())
					ORDER BY row_type DESC, cohort_date ASC
					LIMIT {limit:UInt32}
				`,
			};
		},
	},
};
