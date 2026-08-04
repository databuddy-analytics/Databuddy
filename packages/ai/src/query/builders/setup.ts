import { Analytics } from "../../types/tables";
import type { SimpleQueryConfig } from "../types";

/**
 * Private aggregate coverage used by Insights to understand which Databuddy
 * measurement surfaces are available. The final row intentionally contains no
 * identifiers, event names, properties, or profile data.
 */
export const SetupBuilders: Record<string, SimpleQueryConfig> = {
	/**
	 * Private, aggregate-only continuation comparison after a slow LCP or INP
	 * sample on one canonical route. The cohort members and route stay inside
	 * the query; Insights receives only a non-causal aggregate comparison.
	 */
	insights_vital_cohort_behavior: {
		meta: {
			description:
				"Private aggregate same-route/day comparison of sessions with a slow LCP or INP sample against healthy peers. Returns continuation rates only; a lower rate is observational and never proves cause, bounce, retention, abandonment, or task failure.",
			category: "Insights",
			tags: ["insights", "performance", "behavior", "internal"],
			output_fields: [
				{ name: "eligible_slow_sessions", type: "number" },
				{ name: "matched_slow_sessions", type: "number" },
				{ name: "matched_peer_session_observations", type: "number" },
				{ name: "matched_strata", type: "number" },
				{ name: "matched_coverage_percent", type: "number", unit: "%" },
				{ name: "slow_next_page_percent", type: "number", unit: "%" },
				{
					name: "comparison_next_page_percent",
					type: "number",
					unit: "%",
				},
			],
		},
		allowedFilters: ["path", "vital_metric", "vital_threshold"],
		allowedFilterOperators: {
			path: ["eq"],
			vital_metric: ["eq"],
			vital_threshold: ["eq"],
		},
		customSql: (ctx) => {
			const { endDate, filters, startDate, timezone = "UTC", websiteId } = ctx;
			const allFilters = filters ?? [];
			const selectors = allFilters.filter(
				(filter) => !(filter.having || filter.target)
			);
			const pathSelector = selectors.find(
				(filter) =>
					filter.field === "path" &&
					filter.op === "eq" &&
					!Array.isArray(filter.value)
			);
			const vitalMetric = selectors.find(
				(filter) =>
					filter.field === "vital_metric" &&
					filter.op === "eq" &&
					!Array.isArray(filter.value)
			);
			const vitalThreshold = selectors.find(
				(filter) =>
					filter.field === "vital_threshold" &&
					filter.op === "eq" &&
					!Array.isArray(filter.value)
			);
			const routePath = pathSelector?.value;
			const metric = vitalMetric?.value;
			const threshold = vitalThreshold?.value;
			const isCanonicalRoute =
				typeof routePath === "string" &&
				routePath.length > 0 &&
				routePath.trim() === routePath &&
				routePath.startsWith("/") &&
				!routePath.includes("?") &&
				!routePath.includes("#") &&
				(routePath === "/" || !routePath.endsWith("/"));
			if (
				allFilters.length !== 3 ||
				selectors.length !== 3 ||
				!pathSelector ||
				!vitalMetric ||
				!vitalThreshold ||
				!isCanonicalRoute ||
				(metric !== "LCP" && metric !== "INP") ||
				typeof threshold !== "number" ||
				!Number.isFinite(threshold) ||
				threshold <= 0
			) {
				throw new Error(
					"insights_vital_cohort_behavior requires exactly one canonical path, LCP or INP metric, and positive numeric threshold selector"
				);
			}

			const normalizedVitalPath =
				"if(vital.path = '', '', if(trimRight(path(vital.path), '/') = '', '/', trimRight(path(vital.path), '/')))";
			const normalizedEventPath =
				"if(event.path = '', '', if(trimRight(path(event.path), '/') = '', '/', trimRight(path(event.path), '/')))";

			return {
				sql: `
					WITH
						toDateTime(concat({endDate:String}, ' 23:59:59')) AS range_end,
						route_vital_samples AS (
							SELECT
								vital.session_id AS session_id,
								toDate(toTimeZone(vital.timestamp, {timezone:String})) AS local_day,
								minIf(
									vital.timestamp,
									vital.metric_value >= {vitalThreshold:Float64}
								) AS slow_vital_at,
								minIf(
									vital.timestamp,
									vital.metric_value < {vitalThreshold:Float64}
								) AS healthy_vital_at,
								max(vital.metric_value >= {vitalThreshold:Float64}) AS has_slow_vital
							FROM ${Analytics.web_vitals_spans} vital
							WHERE vital.client_id = {websiteId:String}
								AND vital.timestamp >= toDateTime({startDate:String})
								AND vital.timestamp <= range_end
								AND vital.session_id != ''
								AND vital.metric_name = {vitalMetric:String}
								AND vital.metric_value > 0
								AND ${normalizedVitalPath} = {routePath:String}
							GROUP BY vital.session_id, local_day
						),
						slow_metric_session_days AS (
							SELECT
								vital.session_id AS session_id,
								toDate(toTimeZone(vital.timestamp, {timezone:String})) AS local_day
							FROM ${Analytics.web_vitals_spans} vital
							WHERE vital.client_id = {websiteId:String}
								AND vital.timestamp >= toDateTime({startDate:String})
								AND vital.timestamp <= range_end
								AND vital.session_id != ''
								AND vital.metric_name = {vitalMetric:String}
								AND vital.metric_value > 0
								AND vital.metric_value >= {vitalThreshold:Float64}
							GROUP BY vital.session_id, local_day
						),
						slow_anchors AS (
							SELECT session_id, local_day, slow_vital_at AS vital_at
							FROM route_vital_samples
							WHERE has_slow_vital
								AND slow_vital_at <= range_end - INTERVAL 30 MINUTE
						),
						trackable_slow_anchors AS (
							SELECT
								slow.session_id AS session_id,
								slow.local_day AS local_day,
								max(event.time) AS anchor_at
							FROM slow_anchors slow
							INNER JOIN ${Analytics.events} event
								ON event.client_id = {websiteId:String}
								AND event.session_id = slow.session_id
								AND event.event_name = 'screen_view'
								AND event.time >= toDateTime({startDate:String})
								AND event.time >= slow.vital_at - INTERVAL 5 MINUTE
								AND event.time <= slow.vital_at
								AND toDate(toTimeZone(event.time, {timezone:String})) = slow.local_day
								AND ${normalizedEventPath} = {routePath:String}
							GROUP BY slow.session_id, slow.local_day
						),
						healthy_anchors AS (
							SELECT
								healthy.session_id AS session_id,
								healthy.local_day AS local_day,
								healthy.healthy_vital_at AS vital_at
							FROM route_vital_samples healthy
							INNER JOIN (
								SELECT DISTINCT slow.local_day
								FROM trackable_slow_anchors slow
							) strata ON healthy.local_day = strata.local_day
							WHERE healthy.healthy_vital_at <= range_end - INTERVAL 30 MINUTE
								AND (healthy.session_id, healthy.local_day) NOT IN (
									SELECT session_id, local_day
									FROM slow_metric_session_days
								)
						),
						trackable_healthy_anchors AS (
							SELECT
								healthy.session_id AS session_id,
								healthy.local_day AS local_day,
								max(event.time) AS anchor_at
							FROM healthy_anchors healthy
							INNER JOIN ${Analytics.events} event
								ON event.client_id = {websiteId:String}
								AND event.session_id = healthy.session_id
								AND event.event_name = 'screen_view'
								AND event.time >= toDateTime({startDate:String})
								AND event.time >= healthy.vital_at - INTERVAL 5 MINUTE
								AND event.time <= healthy.vital_at
								AND toDate(toTimeZone(event.time, {timezone:String})) = healthy.local_day
								AND ${normalizedEventPath} = {routePath:String}
							GROUP BY healthy.session_id, healthy.local_day
						),
						slow_behavior AS (
							SELECT
								slow.session_id AS session_id,
								slow.local_day AS local_day,
								countIf(
									event.event_name = 'screen_view'
									AND event.time > slow.anchor_at
									AND event.time <= slow.anchor_at + INTERVAL 30 MINUTE
								) > 0 AS reached_next_page
							FROM trackable_slow_anchors slow
							LEFT JOIN ${Analytics.events} event
								ON event.client_id = {websiteId:String}
								AND event.session_id = slow.session_id
								AND event.time > slow.anchor_at
								AND event.time <= slow.anchor_at + INTERVAL 30 MINUTE
								AND ${normalizedEventPath} != ''
								AND ${normalizedEventPath} != {routePath:String}
							GROUP BY slow.session_id, slow.local_day
						),
						healthy_behavior AS (
							SELECT
								healthy.session_id AS session_id,
								healthy.local_day AS local_day,
								countIf(
									event.event_name = 'screen_view'
									AND event.time > healthy.anchor_at
									AND event.time <= healthy.anchor_at + INTERVAL 30 MINUTE
								) > 0 AS reached_next_page
							FROM trackable_healthy_anchors healthy
							LEFT JOIN ${Analytics.events} event
								ON event.client_id = {websiteId:String}
								AND event.session_id = healthy.session_id
								AND event.time > healthy.anchor_at
								AND event.time <= healthy.anchor_at + INTERVAL 30 MINUTE
								AND ${normalizedEventPath} != ''
								AND ${normalizedEventPath} != {routePath:String}
							GROUP BY healthy.session_id, healthy.local_day
						),
						slow_strata AS (
							SELECT
								local_day,
								count() AS slow_sessions,
								countIf(reached_next_page) AS slow_next_page_sessions
							FROM slow_behavior
							GROUP BY local_day
						),
						healthy_strata AS (
							SELECT
								local_day,
								count() AS peer_session_observations,
								countIf(reached_next_page) AS peer_next_page_sessions
							FROM healthy_behavior
							GROUP BY local_day
						),
						matched_strata AS (
							SELECT
								slow.slow_sessions,
								slow.slow_next_page_sessions,
								healthy.peer_session_observations,
								healthy.peer_next_page_sessions
							FROM slow_strata slow
							INNER JOIN healthy_strata healthy
								ON slow.local_day = healthy.local_day
							WHERE healthy.peer_session_observations >= 10
						)
					SELECT
						toUInt64((SELECT count() FROM slow_anchors)) AS eligible_slow_sessions,
						toUInt64(ifNull(sum(slow_sessions), 0)) AS matched_slow_sessions,
						toUInt64(ifNull(sum(peer_session_observations), 0)) AS matched_peer_session_observations,
						toUInt64(count()) AS matched_strata,
						if(
							(SELECT count() FROM slow_anchors) = 0,
							0,
							round(
								100 * ifNull(sum(slow_sessions), 0)
									/ (SELECT count() FROM slow_anchors),
								1
							)
						) AS matched_coverage_percent,
						if(
							ifNull(sum(slow_sessions), 0) = 0,
							0,
							round(
								100 * ifNull(sum(slow_next_page_sessions), 0) / sum(slow_sessions),
								1
							)
						) AS slow_next_page_percent,
						if(
							ifNull(sum(slow_sessions), 0) = 0,
							0,
							round(
								100
									* sum(
										slow_sessions
										* peer_next_page_sessions
										/ peer_session_observations
									)
									/ sum(slow_sessions),
								1
							)
						) AS comparison_next_page_percent
					FROM matched_strata
				`,
				params: {
					endDate,
					routePath,
					startDate,
					timezone,
					vitalMetric: metric,
					vitalThreshold: threshold,
					websiteId,
				},
			};
		},
		customizable: false,
		noCache: true,
		requiredFilters: ["path", "vital_metric", "vital_threshold"],
		timeField: "timestamp",
	},

	/**
	 * Private, aggregate-only post-error outcome comparison for one configured
	 * goal target. It is deliberately unavailable to the agent's read tools:
	 * the target and every cohort member stay inside the query, while Insights
	 * receives only the aggregate fact it can safely bind to an investigation.
	 */
	insights_error_cohort_goal_completion: {
		meta: {
			description:
				"Private aggregate route/day-matched same-session configured goal-target comparison after one exact error. Returns no goal names, targets, event names, profiles, visitors, or session identifiers.",
			category: "Insights",
			tags: ["insights", "errors", "conversion", "internal"],
			output_fields: [
				{ name: "eligible_error_sessions", type: "number" },
				{ name: "matched_error_sessions", type: "number" },
				{ name: "matched_peer_session_observations", type: "number" },
				{ name: "matched_strata", type: "number" },
				{ name: "matched_coverage_percent", type: "number", unit: "%" },
				{ name: "affected_completion_sessions", type: "number" },
				{ name: "affected_completion_percent", type: "number", unit: "%" },
				{ name: "comparison_completion_percent", type: "number", unit: "%" },
			],
		},
		allowedFilters: ["message", "path", "goal_target", "goal_type"],
		allowedFilterOperators: {
			goal_target: ["eq"],
			goal_type: ["eq"],
			message: ["eq"],
			path: ["eq"],
		},
		customSql: (ctx) => {
			const { endDate, filters, startDate, timezone = "UTC", websiteId } = ctx;
			const selectors = (filters ?? []).filter(
				(filter) => !(filter.having || filter.target)
			);
			const errorSelector = selectors.find(
				(filter) =>
					(filter.field === "message" || filter.field === "path") &&
					filter.op === "eq" &&
					!Array.isArray(filter.value)
			);
			const goalTarget = selectors.find(
				(filter) =>
					filter.field === "goal_target" &&
					filter.op === "eq" &&
					!Array.isArray(filter.value)
			);
			const goalType = selectors.find(
				(filter) =>
					filter.field === "goal_type" &&
					filter.op === "eq" &&
					!Array.isArray(filter.value)
			);
			if (
				selectors.length !== 3 ||
				!errorSelector ||
				!goalTarget ||
				!goalType ||
				typeof errorSelector.value !== "string" ||
				typeof goalTarget.value !== "string" ||
				!goalTarget.value.trim() ||
				typeof goalType.value !== "string" ||
				(errorSelector.field !== "message" && errorSelector.field !== "path") ||
				(goalType.value !== "PAGE_VIEW" &&
					goalType.value !== "EVENT" &&
					goalType.value !== "CUSTOM")
			) {
				throw new Error(
					"insights_error_cohort_goal_completion requires one scalar message or path selector and one scalar configured goal target and type"
				);
			}

			const normalizedErrorPath =
				"if(es.path = '', '', if(trimRight(path(es.path), '/') = '', '/', trimRight(path(es.path), '/')))";
			const normalizedAnchorPath =
				"if(event.path = '', '', if(trimRight(path(event.path), '/') = '', '/', trimRight(path(event.path), '/')))";
			const selectedErrorCondition =
				errorSelector.field === "message"
					? "es.message = {errorSelector:String}"
					: `${normalizedErrorPath} = {errorSelector:String}`;
			const pageTargetEvents = `
				SELECT goal_event.session_id AS session_id, goal_event.time AS outcome_at
				FROM ${Analytics.events} goal_event
				WHERE goal_event.client_id = {websiteId:String}
					AND goal_event.time >= toDateTime({startDate:String})
					AND goal_event.time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
					AND goal_event.session_id != ''
					AND goal_event.event_name = 'screen_view'
					AND if(goal_event.path = '', '', if(trimRight(path(goal_event.path), '/') = '', '/', trimRight(path(goal_event.path), '/'))) = {goalTarget:String}`;
			const eventTargetEvents = `
				SELECT goal_event.session_id AS session_id, goal_event.time AS outcome_at
				FROM ${Analytics.events} goal_event
				WHERE goal_event.client_id = {websiteId:String}
					AND goal_event.time >= toDateTime({startDate:String})
					AND goal_event.time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
					AND goal_event.session_id != ''
					AND goal_event.event_name = {goalTarget:String}
				UNION ALL
				SELECT goal_event.session_id AS session_id, goal_event.timestamp AS outcome_at
				FROM ${Analytics.custom_events} goal_event
				WHERE (goal_event.owner_id = {websiteId:String}
						OR (goal_event.website_id = {websiteId:String}
							AND goal_event.owner_id != {websiteId:String}))
					AND goal_event.timestamp >= toDateTime({startDate:String})
					AND goal_event.timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
					AND goal_event.session_id != ''
					AND goal_event.event_name = {goalTarget:String}`;
			const targetEvents =
				goalType.value === "PAGE_VIEW" ? pageTargetEvents : eventTargetEvents;
			const excludeSamePageTarget =
				goalType.value === "PAGE_VIEW"
					? "AND exposed.error_path != {goalTarget:String}"
					: "";

			return {
				sql: `
					WITH
						toDateTime(concat({endDate:String}, ' 23:59:59')) AS range_end,
						matched_errors AS (
							SELECT
								session_id,
								min(timestamp) AS first_error_at,
								argMin(${normalizedErrorPath}, timestamp) AS error_path
							FROM ${Analytics.error_spans} es
							WHERE es.client_id = {websiteId:String}
								AND es.timestamp >= toDateTime({startDate:String})
								AND es.timestamp <= range_end
								AND es.session_id != ''
								AND es.message != ''
								AND ${selectedErrorCondition}
							GROUP BY es.session_id
						),
						exposed_anchors AS (
							SELECT
								session_id,
								toDate(toTimeZone(first_error_at, {timezone:String})) AS local_day,
								error_path,
								first_error_at AS anchor_at
							FROM matched_errors
							WHERE first_error_at <= range_end - INTERVAL 30 MINUTE
						),
						trackable_exposed_anchors AS (
							SELECT DISTINCT
								exposed.session_id AS session_id,
								exposed.local_day AS local_day,
								exposed.error_path AS error_path,
								exposed.anchor_at AS anchor_at
							FROM exposed_anchors exposed
							INNER JOIN ${Analytics.events} event
								ON event.client_id = {websiteId:String}
								AND event.session_id = exposed.session_id
								AND event.event_name = 'screen_view'
								AND event.time >= toDateTime({startDate:String})
								AND event.time <= exposed.anchor_at
								AND ${normalizedAnchorPath} = exposed.error_path
							WHERE exposed.error_path != ''
								${excludeSamePageTarget}
						),
						control_anchors AS (
							SELECT
								event.session_id,
								toDate(toTimeZone(event.time, {timezone:String})) AS local_day,
								${normalizedAnchorPath} AS error_path,
								min(event.time) AS anchor_at
							FROM ${Analytics.events} event
							INNER JOIN (
								SELECT DISTINCT trackable.local_day, trackable.error_path
								FROM trackable_exposed_anchors trackable
							) strata
								ON toDate(toTimeZone(event.time, {timezone:String})) = strata.local_day
								AND ${normalizedAnchorPath} = strata.error_path
							WHERE event.client_id = {websiteId:String}
								AND event.time >= toDateTime({startDate:String})
								AND event.time <= range_end
								AND event.event_name = 'screen_view'
								AND event.session_id != ''
								AND ${normalizedAnchorPath} != ''
								AND event.session_id NOT IN (SELECT session_id FROM matched_errors)
							GROUP BY
								event.session_id,
								toDate(toTimeZone(event.time, {timezone:String})),
								${normalizedAnchorPath}
							HAVING anchor_at <= range_end - INTERVAL 30 MINUTE
						),
						target_events AS (
							SELECT DISTINCT session_id, outcome_at
							FROM (${targetEvents}) AS goal_target_events
						),
						exposed_completion AS (
							SELECT
								exposed.session_id AS session_id,
								exposed.local_day AS local_day,
								exposed.error_path AS error_path,
								countIf(
									target.outcome_at > exposed.anchor_at
									AND target.outcome_at <= exposed.anchor_at + INTERVAL 30 MINUTE
								) > 0 AS reached_goal_target
							FROM trackable_exposed_anchors exposed
							LEFT JOIN target_events target
								ON target.session_id = exposed.session_id
							GROUP BY exposed.session_id, exposed.local_day, exposed.error_path
						),
						control_completion AS (
							SELECT
								control.session_id AS session_id,
								control.local_day AS local_day,
								control.error_path AS error_path,
								countIf(
									target.outcome_at > control.anchor_at
									AND target.outcome_at <= control.anchor_at + INTERVAL 30 MINUTE
								) > 0 AS reached_goal_target
							FROM control_anchors control
							LEFT JOIN target_events target
								ON target.session_id = control.session_id
							GROUP BY control.session_id, control.local_day, control.error_path
						),
						exposed_strata AS (
							SELECT
								local_day,
								error_path,
								count() AS affected_sessions,
								countIf(reached_goal_target) AS affected_goal_target_sessions
							FROM exposed_completion
							GROUP BY local_day, error_path
						),
						control_strata AS (
							SELECT
								local_day,
								error_path,
								count() AS peer_session_observations,
								countIf(reached_goal_target) AS peer_completion_sessions
							FROM control_completion
							GROUP BY local_day, error_path
						),
						matched_strata AS (
							SELECT
								exposed.affected_sessions,
								exposed.affected_goal_target_sessions,
								control.peer_session_observations,
								control.peer_completion_sessions
							FROM exposed_strata exposed
							INNER JOIN control_strata control
								ON exposed.local_day = control.local_day
								AND exposed.error_path = control.error_path
							WHERE control.peer_session_observations >= 10
						)
					SELECT
						toUInt64((SELECT count() FROM exposed_anchors)) AS eligible_error_sessions,
						toUInt64(ifNull(sum(affected_sessions), 0)) AS matched_error_sessions,
						toUInt64(ifNull(sum(peer_session_observations), 0)) AS matched_peer_session_observations,
						toUInt64(count()) AS matched_strata,
						if(
							(SELECT count() FROM exposed_anchors) = 0,
							0,
							round(100 * ifNull(sum(affected_sessions), 0) / (SELECT count() FROM exposed_anchors), 1)
						) AS matched_coverage_percent,
						toUInt64(ifNull(sum(affected_goal_target_sessions), 0)) AS affected_completion_sessions,
						if(
							ifNull(sum(affected_sessions), 0) = 0,
							0,
							round(100 * ifNull(sum(affected_goal_target_sessions), 0) / sum(affected_sessions), 1)
						) AS affected_completion_percent,
						if(
							ifNull(sum(affected_sessions), 0) = 0,
							0,
							round(
								100 * sum(affected_sessions * peer_completion_sessions / peer_session_observations)
								/ sum(affected_sessions),
								1
							)
						) AS comparison_completion_percent
					FROM matched_strata
				`,
				params: {
					endDate,
					errorSelector: errorSelector.value,
					goalTarget: goalTarget.value,
					startDate,
					timezone,
					websiteId,
				},
			};
		},
		customizable: false,
		noCache: true,
		requiredFilters: ["goal_target", "goal_type"],
		requiredAnyFilter: ["message", "path"],
		timeField: "timestamp",
	},
	insights_setup_coverage: {
		meta: {
			description:
				"Private aggregate Databuddy setup coverage for Insights. Returns activity, same-window identity, and custom-event coverage without identifiers, event names, or properties.",
			category: "Insights",
			tags: ["insights", "setup", "identity", "custom-events", "internal"],
			output_fields: [
				{ name: "pageviews", type: "number" },
				{ name: "tracked_sessions", type: "number" },
				{ name: "identified_sessions", type: "number" },
				{ name: "identified_profiles", type: "number" },
				{ name: "custom_event_types", type: "number" },
				{ name: "sessions_with_custom_events", type: "number" },
			],
		},
		customSql: (ctx) => {
			const { endDate, startDate, websiteId } = ctx;
			return {
				sql: `
					WITH session_identity AS (
						SELECT
							session_id,
							max(event_name = 'screen_view') AS has_pageview,
							max(profile_id != '') AS has_profile,
							anyIf(profile_id, profile_id != '') AS resolved_profile_id
						FROM ${Analytics.events}
						WHERE client_id = {websiteId:String}
							AND time >= toDateTime({startDate:String})
							AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
							AND session_id != ''
						GROUP BY session_id
					),
					page_coverage AS (
						SELECT countIf(event_name = 'screen_view') AS pageviews
						FROM ${Analytics.events}
						WHERE client_id = {websiteId:String}
							AND time >= toDateTime({startDate:String})
							AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
					),
					custom_event_coverage AS (
						SELECT
							uniqExact(event_name) AS custom_event_types,
							uniqExactIf(session_id, session_id != '') AS sessions_with_custom_events
						FROM ${Analytics.custom_events}
						WHERE (owner_id = {websiteId:String} OR website_id = {websiteId:String})
							AND timestamp >= toDateTime({startDate:String})
							AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
							AND event_name != ''
					)
					SELECT
						any(page_coverage.pageviews) AS pageviews,
						countIf(session_identity.has_pageview) AS tracked_sessions,
						countIf(session_identity.has_pageview AND session_identity.has_profile) AS identified_sessions,
						uniqExactIf(
							session_identity.resolved_profile_id,
							session_identity.has_pageview
								AND session_identity.has_profile
								AND session_identity.resolved_profile_id != ''
						) AS identified_profiles,
						any(custom_event_coverage.custom_event_types) AS custom_event_types,
						any(custom_event_coverage.sessions_with_custom_events) AS sessions_with_custom_events
					FROM session_identity
					CROSS JOIN page_coverage
					CROSS JOIN custom_event_coverage
				`,
				params: { endDate, startDate, websiteId },
			};
		},
		customizable: false,
		noCache: true,
		timeField: "time",
	},
};
