import { revenueLatestCte } from "@databuddy/db/clickhouse";
import { Analytics } from "../../types/tables";
import { appendFilterClause } from "../simple-builder";
import type { SimpleQueryConfig } from "../types";

export const ErrorsBuilders: Record<string, SimpleQueryConfig> = {
	recent_errors: {
		meta: {
			description:
				"Recent JS errors with full context: message, stack (capped at 1500 chars), path, error_type, browser, OS, device, country. For aggregates use error_summary / errors_by_type / errors_by_page.",
			category: "Errors",
			tags: ["errors", "recent", "debugging"],
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate, filterConditions, filterParams } =
				ctx;
			const limit = ctx.limit ?? 50;
			const filterClause = appendFilterClause(filterConditions);

			return {
				sql: `
					WITH session_context AS (
						SELECT
							session_id,
							client_id,
							any(browser_name) as browser_name,
							any(browser_version) as browser_version,
							any(os_name) as os_name,
							any(os_version) as os_version,
							any(device_type) as device_type,
							any(country) as country,
							any(region) as region
						FROM ${Analytics.events}
						WHERE client_id = {websiteId:String}
							AND time >= toDateTime({startDate:String})
							AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						GROUP BY session_id, client_id
					)
					SELECT
						es.message,
						substring(es.stack, 1, 1500) as stack,
						es.path,
						es.anonymous_id,
						es.session_id,
						es.timestamp,
						es.filename,
						es.lineno,
						es.colno,
						es.error_type,
						sc.browser_name,
						sc.browser_version,
						sc.os_name,
						sc.os_version,
						sc.device_type,
						sc.country,
						sc.region
					FROM ${Analytics.error_spans} es
					LEFT JOIN session_context sc ON es.session_id = sc.session_id AND es.client_id = sc.client_id
					WHERE
						es.client_id = {websiteId:String}
						AND es.timestamp >= toDateTime({startDate:String})
						AND es.timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND es.message != ''
						${filterClause}
					ORDER BY es.timestamp DESC
					LIMIT {limit:UInt32}
				`,
				params: {
					websiteId,
					startDate,
					endDate,
					limit,
					...filterParams,
				},
			};
		},
		timeField: "timestamp",
		allowedFilters: [
			"path",
			"browser_name",
			"os_name",
			"country",
			"message",
			"device_type",
			"error_type",
		],
		customizable: true,
		plugins: {
			normalizeGeo: true,
		},
	},

	error_types: {
		meta: {
			description:
				"Top error MESSAGES with count, affected users, and last_seen. Group key is the message string. For grouping by JS class (TypeError, ReferenceError, …) use errors_by_type.",
			category: "Errors",
			tags: ["errors", "messages", "triage"],
		},
		table: Analytics.error_spans,
		fields: [
			"message as name",
			"COUNT(*) as count",
			"uniq(anonymous_id) as users",
			"MAX(timestamp) as last_seen",
		],
		where: ["message != ''"],
		groupBy: ["message"],
		orderBy: "count DESC",
		limit: 50,
		timeField: "timestamp",
		allowedFilters: ["message", "path", "error_type"],
		customizable: true,
	},

	error_fingerprints: {
		meta: {
			description:
				"Exact error messages ranked by affected users and sessions, with one representative debugging context per message.",
			category: "Errors",
			tags: ["errors", "fingerprints", "debugging", "internal"],
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate, filterConditions, filterParams } =
				ctx;
			const requestedLimit = ctx.limit ?? 20;
			const limit = Math.min(
				Math.max(
					Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : 20,
					1
				),
				50
			);
			const filterClause = appendFilterClause(filterConditions);
			const representativeRank =
				"tuple(if(ifNull(es.stack, '') != '', 1, 0), es.timestamp, es.session_id, es.anonymous_id)";
			const normalizedPath =
				"if(es.path = '', '', if(trimRight(path(es.path), '/') = '', '/', trimRight(path(es.path), '/')))";

			return {
				sql: `
					SELECT
						name,
						count,
						users,
						sessions,
						representative_path as path,
						representative_error_type as error_type,
						representative_filename as filename,
						representative_line as line,
						representative_stack as stack,
						last_seen
					FROM (
						SELECT
							es.message as name,
							count() as count,
							uniqIf(es.anonymous_id, es.anonymous_id != '') as users,
							uniqIf(es.session_id, es.session_id != '') as sessions,
							argMax(${normalizedPath}, ${representativeRank}) as representative_path,
							argMax(es.error_type, ${representativeRank}) as representative_error_type,
							argMax(ifNull(es.filename, ''), ${representativeRank}) as representative_filename,
							nullIf(argMax(ifNull(es.lineno, 0), ${representativeRank}), 0) as representative_line,
							argMax(substring(ifNull(es.stack, ''), 1, 1000), ${representativeRank}) as representative_stack,
							max(es.timestamp) as last_seen
						FROM ${Analytics.error_spans} es
						WHERE es.client_id = {websiteId:String}
							AND es.timestamp >= toDateTime({startDate:String})
							AND es.timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
							AND es.message != ''
							${filterClause}
						GROUP BY es.message
					)
					ORDER BY users DESC, sessions DESC, count DESC, last_seen DESC
					LIMIT {limit:UInt32}
				`,
				params: {
					websiteId,
					startDate,
					endDate,
					limit,
					...filterParams,
				},
			};
		},
		timeField: "timestamp",
		allowedFilters: ["message", "path", "error_type"],
		customizable: true,
		noCache: true,
	},

	error_customer_impact: {
		meta: {
			description:
				"Privacy-safe aggregate impact for one exact error fingerprint or canonical route. Returns counts and identity/payment coverage only; never visitor, profile, session, or transaction identifiers. Payment matches prove prior attributed completed payments, not active subscription status.",
			category: "Errors",
			tags: ["errors", "impact", "identity", "revenue", "internal"],
			output_fields: [
				{ name: "error_occurrences", type: "number" },
				{ name: "affected_sessions", type: "number" },
				{ name: "affected_visitor_identifiers", type: "number" },
				{ name: "linked_visitor_identifiers", type: "number" },
				{ name: "identified_profiles", type: "number" },
				{ name: "unlinked_visitor_identifiers", type: "number" },
				{ name: "ambiguous_profile_sessions", type: "number" },
				{ name: "identity_coverage_percent", type: "number", unit: "%" },
				{
					name: "identified_profiles_with_prior_attributed_completed_payment",
					type: "number",
				},
				{
					name: "qualifying_profile_payment_history_observed",
					type: "boolean",
				},
				{ name: "payment_match_is_lower_bound", type: "boolean" },
			],
		},
		allowedFilters: ["message", "path"],
		allowedFilterOperators: { message: ["eq"], path: ["eq"] },
		customSql: (ctx) => {
			const {
				websiteId,
				startDate,
				endDate,
				filters,
				filterConditions,
				filterParams,
			} = ctx;
			const selectors = (filters ?? []).filter(
				(filter) => !(filter.having || filter.target)
			);
			if (
				selectors.length !== 1 ||
				(selectors[0]?.field !== "message" && selectors[0]?.field !== "path") ||
				selectors[0]?.op !== "eq" ||
				Array.isArray(selectors[0].value)
			) {
				throw new Error(
					"error_customer_impact requires exactly one scalar message or path equality filter"
				);
			}
			const filterClause = appendFilterClause(filterConditions);
			const latestRevenue = revenueLatestCte({
				candidateWhere:
					"created <= toDateTime(concat({endDate:String}, ' 23:59:59')) AND profile_id IN (SELECT resolved_profile_id FROM affected_profiles)",
				name: "impact_revenue_latest",
				scope: `(owner_id = {websiteId:String} OR website_id = {websiteId:String})
					AND synced_at <= toDateTime(concat({endDate:String}, ' 23:59:59'))`,
			});

			return {
				sql: `
					WITH matched_errors AS (
						SELECT anonymous_id, session_id, timestamp
						FROM ${Analytics.error_spans}
						WHERE client_id = {websiteId:String}
							AND timestamp >= toDateTime({startDate:String})
							AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
							AND message != ''
							${filterClause}
					),
					affected_anonymous_ids AS (
						SELECT DISTINCT anonymous_id
						FROM matched_errors
						WHERE anonymous_id != ''
					),
					affected_sessions AS (
						SELECT DISTINCT session_id
						FROM matched_errors
						WHERE session_id != ''
					),
					anonymous_identity AS (
						SELECT
							anonymous_id,
							uniqExactIf(profile_id, profile_id != '') AS profile_count,
							if(
								uniqExactIf(profile_id, profile_id != '') = 1,
								anyIf(profile_id, profile_id != ''),
								''
							) AS resolved_profile_id
						FROM ${Analytics.events}
						WHERE client_id = {websiteId:String}
							AND time >= toDateTime({startDate:String})
							AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
							AND anonymous_id IN (SELECT anonymous_id FROM affected_anonymous_ids)
						GROUP BY anonymous_id
					),
					session_identity AS (
						SELECT
							session_id,
							uniqExactIf(profile_id, profile_id != '') AS profile_count,
							if(
								uniqExactIf(profile_id, profile_id != '') = 1,
								anyIf(profile_id, profile_id != ''),
								''
							) AS resolved_profile_id
						FROM ${Analytics.events}
						WHERE client_id = {websiteId:String}
							AND time >= toDateTime({startDate:String})
							AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
							AND session_id IN (SELECT session_id FROM affected_sessions)
						GROUP BY session_id
					),
					identity_rows AS (
						SELECT
							matched.anonymous_id AS error_anonymous_id,
							matched.session_id AS error_session_id,
							matched.first_error_at,
							if(
								ifNull(session.profile_count, 0) = 1
									AND ifNull(anonymous.profile_count, 0) <= 1
									AND (
										ifNull(anonymous.resolved_profile_id, '') = ''
										OR anonymous.resolved_profile_id = session.resolved_profile_id
									),
								session.resolved_profile_id,
								if(
									ifNull(session.profile_count, 0) = 0
										AND ifNull(anonymous.profile_count, 0) = 1,
									anonymous.resolved_profile_id,
									''
								)
							) AS resolved_profile_id,
							toUInt8(
								ifNull(session.profile_count, 0) > 1
								OR ifNull(anonymous.profile_count, 0) > 1
								OR (
									ifNull(session.resolved_profile_id, '') != ''
									AND ifNull(anonymous.resolved_profile_id, '') != ''
									AND session.resolved_profile_id != anonymous.resolved_profile_id
								)
							) AS profile_ambiguous
						FROM (
							SELECT anonymous_id, session_id, min(timestamp) AS first_error_at
							FROM matched_errors
							GROUP BY anonymous_id, session_id
						) matched
						LEFT JOIN anonymous_identity anonymous
							ON matched.anonymous_id = anonymous.anonymous_id
						LEFT JOIN session_identity session
							ON matched.session_id = session.session_id
					),
					affected_profiles AS (
						SELECT resolved_profile_id, min(first_error_at) AS first_error_at
						FROM identity_rows
						WHERE resolved_profile_id != ''
						GROUP BY resolved_profile_id
					),
					${latestRevenue},
					paying_profiles AS (
						SELECT profile_id, min(created) AS first_completed_payment_at
						FROM impact_revenue_latest
						WHERE profile_id != ''
							AND created <= toDateTime(concat({endDate:String}, ' 23:59:59'))
							AND status = 'completed'
							AND amount > 0
							AND type IN ('sale', 'subscription')
						GROUP BY profile_id
					),
					affected_paying_profiles AS (
						SELECT affected.resolved_profile_id
						FROM affected_profiles affected
						INNER JOIN paying_profiles payment
							ON affected.resolved_profile_id = payment.profile_id
						WHERE payment.first_completed_payment_at <= affected.first_error_at
					)
					SELECT
						toUInt64((SELECT count() FROM matched_errors)) AS error_occurrences,
						toUInt64((SELECT count() FROM affected_sessions)) AS affected_sessions,
						toUInt64((SELECT count() FROM affected_anonymous_ids)) AS affected_visitor_identifiers,
						uniqExactIf(error_anonymous_id, error_anonymous_id != '' AND resolved_profile_id != '') AS linked_visitor_identifiers,
						uniqExactIf(resolved_profile_id, resolved_profile_id != '') AS identified_profiles,
						toUInt64((SELECT count() FROM affected_anonymous_ids))
							- uniqExactIf(error_anonymous_id, error_anonymous_id != '' AND resolved_profile_id != '') AS unlinked_visitor_identifiers,
						uniqExactIf(error_session_id, error_session_id != '' AND profile_ambiguous = 1) AS ambiguous_profile_sessions,
						if(
							(SELECT count() FROM affected_anonymous_ids) = 0,
							0,
							round(
								100 * uniqExactIf(error_anonymous_id, error_anonymous_id != '' AND resolved_profile_id != '')
									/ (SELECT count() FROM affected_anonymous_ids),
								1
							)
						) AS identity_coverage_percent,
						toUInt64((SELECT count() FROM affected_paying_profiles)) AS identified_profiles_with_prior_attributed_completed_payment,
						toUInt8((SELECT count() FROM paying_profiles) > 0) AS qualifying_profile_payment_history_observed,
						toUInt8(1) AS payment_match_is_lower_bound
					FROM identity_rows
				`,
				params: {
					websiteId,
					startDate,
					endDate,
					...filterParams,
				},
			};
		},
		customizable: false,
		noCache: true,
		requiredAnyFilter: ["message", "path"],
		timeField: "timestamp",
	},

	error_route_continuation_comparison: {
		meta: {
			description:
				"Privacy-safe aggregate continuation comparison for one exact error fingerprint or canonical route. It matches error-exposed sessions to same-route, day, device, and browser sessions without that exact error, then measures a different screen view within ten minutes. It is association evidence, never proof of causation.",
			category: "Errors",
			tags: ["errors", "behavior", "continuation", "internal"],
			output_fields: [
				{ name: "candidate_exposed_sessions", type: "number" },
				{ name: "candidate_control_sessions", type: "number" },
				{ name: "matched_exposed_sessions", type: "number" },
				{ name: "matched_control_sessions", type: "number" },
				{ name: "unmatched_exposed_sessions", type: "number" },
				{ name: "unmatched_control_sessions", type: "number" },
				{ name: "exposed_continued_sessions", type: "number" },
				{ name: "control_continued_sessions", type: "number" },
				{
					name: "exposed_continuation_percent",
					type: "number",
					unit: "%",
				},
				{
					name: "control_continuation_percent",
					type: "number",
					unit: "%",
				},
			],
		},
		allowedFilters: ["message", "path"],
		allowedFilterOperators: { message: ["eq"], path: ["eq"] },
		customSql: (ctx) => {
			const {
				websiteId,
				startDate,
				endDate,
				filters,
				filterConditions,
				filterParams,
			} = ctx;
			const selectors = (filters ?? []).filter(
				(filter) => !(filter.having || filter.target)
			);
			if (
				selectors.length !== 1 ||
				(selectors[0]?.field !== "message" && selectors[0]?.field !== "path") ||
				selectors[0]?.op !== "eq" ||
				Array.isArray(selectors[0].value)
			) {
				throw new Error(
					"error_route_continuation_comparison requires one scalar message or path equality filter"
				);
			}
			const filterClause = appendFilterClause(filterConditions);
			const normalizedPath =
				"if(trimRight(path(path), '/') = '', '/', trimRight(path(path), '/'))";

			return {
				sql: `
					WITH
						toDateTime({startDate:String}) AS period_start,
						toDateTime(concat({endDate:String}, ' 23:59:59')) AS period_end,
						period_end - INTERVAL 10 MINUTE AS latest_entry_at,
						matched_route_errors AS (
							SELECT
								session_id,
								timestamp,
								${normalizedPath} AS route
							FROM ${Analytics.error_spans}
							WHERE client_id = {websiteId:String}
								AND session_id != ''
								AND path != ''
								AND timestamp >= period_start
								AND timestamp <= period_end
								${filterClause}
						),
						route_screen_views AS (
							SELECT
								session_id,
								time AS route_view_at,
								${normalizedPath} AS route,
								toDate(time) AS route_day,
								lower(ifNull(device_type, 'unknown')) AS device_type,
								lower(ifNull(browser_name, 'unknown')) AS browser_name
							FROM ${Analytics.events}
							WHERE client_id = {websiteId:String}
								AND event_name = 'screen_view'
								AND session_id != ''
								AND time >= period_start
								AND time <= latest_entry_at
								AND ${normalizedPath} IN (
									SELECT DISTINCT route FROM matched_route_errors
								)
						),
						qualified_exposures AS (
							SELECT
								view.session_id,
								view.route,
								view.route_day,
								view.device_type,
								view.browser_name,
								min(error.timestamp) AS error_at
							FROM route_screen_views view
							INNER JOIN matched_route_errors error
								ON view.session_id = error.session_id
								AND view.route = error.route
							WHERE error.timestamp >= view.route_view_at
								AND error.timestamp <= view.route_view_at + INTERVAL 30 SECOND
								AND error.timestamp <= period_end - INTERVAL 10 MINUTE
							GROUP BY
								view.session_id,
								view.route,
								view.route_day,
								view.device_type,
								view.browser_name
						),
						exposed_sessions AS (
							SELECT
								session_id,
								argMin(route, error_at) AS route,
								argMin(route_day, error_at) AS route_day,
								argMin(device_type, error_at) AS device_type,
								argMin(browser_name, error_at) AS browser_name,
								min(error_at) AS outcome_at
							FROM qualified_exposures
							GROUP BY session_id
						),
						control_sessions AS (
							SELECT
								session_id,
								argMin(route, route_view_at) AS route,
								argMin(route_day, route_view_at) AS route_day,
								argMin(device_type, route_view_at) AS device_type,
								argMin(browser_name, route_view_at) AS browser_name,
								min(route_view_at) AS outcome_at
							FROM route_screen_views view
							WHERE view.session_id NOT IN (
								SELECT session_id
								FROM matched_route_errors
							)
							GROUP BY session_id
						),
						exposed_by_stratum AS (
							SELECT route, route_day, device_type, browser_name, count() AS sessions
							FROM exposed_sessions
							GROUP BY route, route_day, device_type, browser_name
						),
						controls_by_stratum AS (
							SELECT route, route_day, device_type, browser_name, count() AS sessions
							FROM control_sessions
							GROUP BY route, route_day, device_type, browser_name
						),
						ranked_exposed_sessions AS (
							SELECT
								exposed.*,
								row_number() OVER (
									PARTITION BY route, route_day, device_type, browser_name
									ORDER BY cityHash64(session_id)
								) AS rank_in_stratum
							FROM exposed_sessions exposed
						),
						ranked_control_sessions AS (
							SELECT
								control.*,
								row_number() OVER (
									PARTITION BY route, route_day, device_type, browser_name
									ORDER BY cityHash64(session_id)
								) AS rank_in_stratum
							FROM control_sessions control
						),
						matched_exposed_sessions AS (
							SELECT exposed.*
							FROM ranked_exposed_sessions exposed
							INNER JOIN controls_by_stratum control
								ON exposed.route = control.route
								AND exposed.route_day = control.route_day
								AND exposed.device_type = control.device_type
								AND exposed.browser_name = control.browser_name
							WHERE exposed.rank_in_stratum <= control.sessions
						),
						matched_control_sessions AS (
							SELECT control.*
							FROM ranked_control_sessions control
							INNER JOIN exposed_by_stratum exposed
								ON control.route = exposed.route
								AND control.route_day = exposed.route_day
								AND control.device_type = exposed.device_type
								AND control.browser_name = exposed.browser_name
							WHERE control.rank_in_stratum <= exposed.sessions
						),
						continued_exposed_sessions AS (
							SELECT DISTINCT exposed.session_id
							FROM ${Analytics.events} event
							INNER JOIN matched_exposed_sessions exposed
								ON event.session_id = exposed.session_id
							WHERE event.client_id = {websiteId:String}
								AND event.event_name = 'screen_view'
								AND event.time >= period_start
								AND event.time <= period_end
								AND event.time > exposed.outcome_at
								AND event.time <= exposed.outcome_at + INTERVAL 10 MINUTE
								AND ${normalizedPath} != exposed.route
						),
						continued_control_sessions AS (
							SELECT DISTINCT control.session_id
							FROM ${Analytics.events} event
							INNER JOIN matched_control_sessions control
								ON event.session_id = control.session_id
							WHERE event.client_id = {websiteId:String}
								AND event.event_name = 'screen_view'
								AND event.time >= period_start
								AND event.time <= period_end
								AND event.time > control.outcome_at
								AND event.time <= control.outcome_at + INTERVAL 10 MINUTE
								AND ${normalizedPath} != control.route
						)
					SELECT
						toUInt64((SELECT count() FROM exposed_sessions)) AS candidate_exposed_sessions,
						toUInt64((SELECT count() FROM control_sessions)) AS candidate_control_sessions,
						toUInt64((SELECT count() FROM matched_exposed_sessions)) AS matched_exposed_sessions,
						toUInt64((SELECT count() FROM matched_control_sessions)) AS matched_control_sessions,
						toUInt64((SELECT count() FROM exposed_sessions))
							- toUInt64((SELECT count() FROM matched_exposed_sessions)) AS unmatched_exposed_sessions,
						toUInt64((SELECT count() FROM control_sessions))
							- toUInt64((SELECT count() FROM matched_control_sessions)) AS unmatched_control_sessions,
						toUInt64((SELECT count() FROM continued_exposed_sessions)) AS exposed_continued_sessions,
						toUInt64((SELECT count() FROM continued_control_sessions)) AS control_continued_sessions,
						if(
							(SELECT count() FROM matched_exposed_sessions) = 0,
							0,
							round(
								100 * (SELECT count() FROM continued_exposed_sessions)
									/ (SELECT count() FROM matched_exposed_sessions),
								1
							)
						) AS exposed_continuation_percent,
						if(
							(SELECT count() FROM matched_control_sessions) = 0,
							0,
							round(
								100 * (SELECT count() FROM continued_control_sessions)
									/ (SELECT count() FROM matched_control_sessions),
								1
							)
						) AS control_continuation_percent
				`,
				params: {
					websiteId,
					startDate,
					endDate,
					...filterParams,
				},
			};
		},
		customizable: false,
		noCache: true,
		requiredAnyFilter: ["message", "path"],
		timeField: "timestamp",
	},

	error_trends: {
		meta: {
			description: "Error counts over time to identify spikes and trends.",
			category: "Errors",
			tags: ["errors", "trends", "time-series"],
		},
		table: Analytics.error_spans,
		fields: [
			"toDate(timestamp) as date",
			"COUNT(*) as errors",
			"uniq(anonymous_id) as users",
		],
		where: ["message != ''"],
		groupBy: ["toDate(timestamp)"],
		orderBy: "date ASC",
		timeField: "timestamp",
		allowedFilters: ["message", "path", "error_type"],
	},

	errors_by_page: {
		meta: {
			description: "Error counts grouped by the page where they occurred.",
			category: "Errors",
			tags: ["errors", "pages"],
		},
		table: Analytics.error_spans,
		fields: [
			"CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END as name",
			"COUNT(*) as errors",
			"uniq(anonymous_id) as users",
		],
		where: ["message != ''", "path != ''"],
		groupBy: [
			"CASE WHEN trimRight(path(path), '/') = '' THEN '/' ELSE trimRight(path(path), '/') END",
		],
		orderBy: "errors DESC",
		limit: 20,
		timeField: "timestamp",
		allowedFilters: ["path", "message", "error_type"],
		customizable: true,
	},

	error_frequency: {
		meta: {
			description: "Error frequency and recurrence patterns.",
			category: "Errors",
			tags: ["errors", "frequency"],
		},
		table: Analytics.error_spans,
		fields: ["toDate(timestamp) as date", "COUNT(*) as count"],
		where: ["message != ''"],
		groupBy: ["toDate(timestamp)"],
		orderBy: "date ASC",
		timeField: "timestamp",
		allowedFilters: ["message", "path", "error_type"],
	},

	error_summary: {
		meta: {
			title: "Error Summary",
			description: "Overview of errors with calculated error rate",
			category: "Errors",
			tags: ["errors", "summary", "overview"],
			version: "1.0",
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate, filterConditions, filterParams } =
				ctx;
			const filterClause = appendFilterClause(filterConditions);

			return {
				sql: `
					WITH total_sessions AS (
						SELECT uniq(session_id) as total
						FROM ${Analytics.events}
						WHERE client_id = {websiteId:String}
						AND time >= toDateTime({startDate:String})
						AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))
					),
					error_stats AS (
						SELECT
							count() as totalErrors,
							uniq(message) as uniqueErrorTypes,
							uniq(anonymous_id) as affectedUsers,
							uniq(session_id) as affectedSessions
						FROM ${Analytics.error_spans}
						WHERE client_id = {websiteId:String}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND message != ''
						${filterClause}
					)
					SELECT
						es.totalErrors,
						es.uniqueErrorTypes,
						es.affectedUsers,
						es.affectedSessions,
						ROUND((es.affectedSessions / ts.total) * 100, 2) as errorRate
					FROM error_stats es
					CROSS JOIN total_sessions ts
				`,
				params: {
					websiteId,
					startDate,
					endDate,
					...filterParams,
				},
			};
		},
		timeField: "timestamp",
		allowedFilters: ["message", "path", "error_type"],
		customizable: true,
	},

	error_chart_data: {
		meta: {
			description: "Error counts formatted for time-series chart display.",
			category: "Errors",
			tags: ["errors", "chart", "time-series"],
		},
		table: Analytics.error_spans,
		fields: [
			"toDate(timestamp) as date",
			"COUNT(*) as totalErrors",
			"uniq(anonymous_id) as affectedUsers",
		],
		where: ["message != ''"],
		groupBy: ["toDate(timestamp)"],
		orderBy: "date ASC",
		timeField: "timestamp",
		allowedFilters: ["message", "path", "error_type"],
	},

	errors_by_type: {
		meta: {
			description:
				"Errors grouped by JS error class (TypeError, ReferenceError, …) with count, affected users, and sessions. For grouping by error message use error_types.",
			category: "Errors",
			tags: ["errors", "class", "triage"],
		},
		table: Analytics.error_spans,
		fields: [
			"error_type as name",
			"COUNT(*) as count",
			"uniq(anonymous_id) as users",
			"uniq(session_id) as sessions",
		],
		where: ["message != ''", "error_type != ''"],
		groupBy: ["error_type"],
		orderBy: "count DESC",
		limit: 20,
		timeField: "timestamp",
		allowedFilters: ["path", "message", "error_type"],
		customizable: true,
	},
};
