import { Analytics } from "../../types/tables";
import type { Filter, SimpleQueryConfig, TimeUnit } from "../types";

export const EngagementBuilders: Record<string, SimpleQueryConfig> = {
	scroll_depth_summary: {
		meta: {
			title: "Scroll Depth Summary",
			description:
				"Average scroll depth metrics showing how far users scroll on pages.",
			category: "Engagement",
			tags: ["scroll", "engagement", "user behavior"],
			output_fields: [
				{
					name: "avg_scroll_depth",
					type: "number",
					label: "Average Scroll Depth",
					description: "Average percentage of page scrolled",
					unit: "%",
				},
				{
					name: "total_sessions",
					type: "number",
					label: "Total Sessions",
					description: "Total sessions with scroll data",
				},
			],
			default_visualization: "metric",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
		table: Analytics.events,
		fields: [
			"ROUND(AVG(CASE WHEN scroll_depth > 0 THEN scroll_depth * 100 ELSE NULL END), 1) as avg_scroll_depth",
			"COUNT(DISTINCT session_id) as total_sessions",
			"COUNT(DISTINCT anonymous_id) as visitors",
		],
		where: ["event_name = 'screen_view'", "scroll_depth > 0"],
		timeField: "time",
		customizable: true,
	},

	scroll_depth_distribution: {
		meta: {
			title: "Scroll Depth Distribution",
			description:
				"Breakdown of users by how far they scroll on pages, grouped into ranges.",
			category: "Engagement",
			tags: ["scroll", "distribution", "engagement"],
			output_fields: [
				{
					name: "depth_range",
					type: "string",
					label: "Scroll Range",
					description: "Percentage range of page scrolled",
				},
				{
					name: "visitors",
					type: "number",
					label: "Visitors",
					description: "Unique visitors in this range",
				},
				{
					name: "sessions",
					type: "number",
					label: "Sessions",
					description: "Sessions in this range",
				},
				{
					name: "percentage",
					type: "number",
					label: "Share",
					description: "Percentage of total sessions",
					unit: "%",
				},
			],
			default_visualization: "bar",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
		table: Analytics.events,
		fields: [
			"CASE " +
			'WHEN scroll_depth < 0.25 THEN "0-25%" ' +
			'WHEN scroll_depth < 0.5 THEN "25-50%" ' +
			'WHEN scroll_depth < 0.75 THEN "50-75%" ' +
			'WHEN scroll_depth < 1.0 THEN "75-100%" ' +
			'ELSE "100%" ' +
			"END as depth_range",
			"COUNT(DISTINCT anonymous_id) as visitors",
			"COUNT(DISTINCT session_id) as sessions",
			"ROUND((COUNT(DISTINCT session_id) / SUM(COUNT(DISTINCT session_id)) OVER()) * 100, 2) as percentage",
		],
		where: ["event_name = 'screen_view'", "scroll_depth > 0"],
		groupBy: ["depth_range"],
		orderBy:
			'CASE depth_range WHEN "0-25%" THEN 1 WHEN "25-50%" THEN 2 WHEN "50-75%" THEN 3 WHEN "75-100%" THEN 4 ELSE 5 END',
		timeField: "time",
		customizable: true,
	},

	page_scroll_performance: {
		meta: {
			title: "Page Scroll Performance",
			description:
				"Average scroll depth by page, showing which pages engage users most effectively.",
			category: "Engagement",
			tags: ["pages", "scroll", "performance"],
			output_fields: [
				{
					name: "name",
					type: "string",
					label: "Page Path",
					description: "The page URL path",
				},
				{
					name: "avg_scroll_depth",
					type: "number",
					label: "Avg Scroll Depth",
					description: "Average scroll depth percentage",
					unit: "%",
				},
				{
					name: "visitors",
					type: "number",
					label: "Visitors",
					description: "Unique visitors to this page",
				},
				{
					name: "sessions",
					type: "number",
					label: "Sessions",
					description: "Sessions on this page",
				},
			],
			default_visualization: "table",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
		table: Analytics.events,
		fields: [
			"trimRight(path(path), '/') as name",
			"ROUND(AVG(CASE WHEN scroll_depth > 0 THEN scroll_depth * 100 ELSE NULL END), 1) as avg_scroll_depth",
			"COUNT(DISTINCT anonymous_id) as visitors",
			"COUNT(DISTINCT session_id) as sessions",
			"COUNT(*) as pageviews",
		],
		where: ["event_name = 'screen_view'", "path != ''", "scroll_depth > 0"],
		groupBy: ["trimRight(path(path), '/')"],
		orderBy: "avg_scroll_depth DESC",
		limit: 100,
		timeField: "time",
		allowedFilters: [
			"path",
			"country",
			"device_type",
			"browser_name",
			"os_name",
			"referrer",
		],
		customizable: true,
	},

	interaction_summary: {
		meta: {
			title: "Interaction Summary",
			description:
				"Summary of user interactions including click, scroll, and keyboard events.",
			category: "Engagement",
			tags: ["interactions", "engagement", "user behavior"],
			output_fields: [
				{
					name: "avg_interactions",
					type: "number",
					label: "Average Interactions",
					description: "Average number of interactions per session",
				},
				{
					name: "interactive_sessions",
					type: "number",
					label: "Interactive Sessions",
					description: "Sessions with at least one interaction",
				},
				{
					name: "interaction_rate",
					type: "number",
					label: "Interaction Rate",
					description: "Percentage of sessions with interactions",
					unit: "%",
				},
			],
			default_visualization: "metric",
			supports_granularity: ["hour", "day"],
			version: "1.0",
		},
		table: Analytics.events,
		fields: [
			"ROUND(AVG(CASE WHEN interaction_count >= 0 THEN interaction_count ELSE NULL END), 1) as avg_interactions",
			"COUNT(DISTINCT CASE WHEN interaction_count > 0 THEN session_id ELSE NULL END) as interactive_sessions",
			"ROUND((COUNT(DISTINCT CASE WHEN interaction_count > 0 THEN session_id ELSE NULL END) / COUNT(DISTINCT session_id)) * 100, 1) as interaction_rate",
			"COUNT(DISTINCT session_id) as total_sessions",
		],
		where: ["event_name = 'screen_view'", "interaction_count >= 0"],
		timeField: "time",
		customizable: true,
	},

	retention_cohorts: {
		meta: {
			title: "Retention Cohorts",
			description:
				"User retention analysis by cohort, showing what percentage of users return over time based on their first visit date.",
			category: "Engagement",
			tags: ["retention", "cohorts", "user behavior"],
			output_fields: [
				{
					name: "cohort",
					type: "string",
					label: "Cohort",
					description: "First visit date cohort",
				},
				{
					name: "users",
					type: "number",
					label: "Users",
					description: "Number of users in this cohort",
				},
				{
					name: "week_0_retention",
					type: "number",
					label: "Week 0 Retention",
					description: "Percentage of users in the initial week (always 100%)",
					unit: "%",
				},
				{
					name: "week_1_retention",
					type: "number",
					label: "Week 1 Retention",
					description: "Percentage of users who returned in week 1",
					unit: "%",
				},
				{
					name: "week_2_retention",
					type: "number",
					label: "Week 2 Retention",
					description: "Percentage of users who returned in week 2",
					unit: "%",
				},
				{
					name: "week_3_retention",
					type: "number",
					label: "Week 3 Retention",
					description: "Percentage of users who returned in week 3",
					unit: "%",
				},
				{
					name: "week_4_retention",
					type: "number",
					label: "Week 4 Retention",
					description: "Percentage of users who returned in week 4",
					unit: "%",
				},
				{
					name: "week_5_retention",
					type: "number",
					label: "Week 5 Retention",
					description: "Percentage of users who returned in week 5",
					unit: "%",
				},
			],
			default_visualization: "table",
			supports_granularity: ["day", "week", "month"],
			version: "1.0",
		},
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter["value"]>
		) => {
			const combinedWhereClause = filterConditions?.length
				? `AND ${filterConditions.join(" AND ")}`
				: "";

			return {
				sql: `
                WITH first_visits AS (
                  SELECT
                    anonymous_id,
                    toStartOfWeek(toDate(MIN(time))) as first_visit_week
                  FROM analytics.events
                  WHERE
                    client_id = {websiteId:String}
                    AND time >= parseDateTimeBestEffort({startDate:String})
                    AND time <= parseDateTimeBestEffort({endDate:String})
                    AND anonymous_id != ''
                    AND event_name = 'screen_view'
                    ${combinedWhereClause}
                  GROUP BY anonymous_id
                ),
                cohorts AS (
                  SELECT
                    fv.first_visit_week as cohort_week,
                    count(DISTINCT fv.anonymous_id) as total_users
                  FROM first_visits fv
                  GROUP BY fv.first_visit_week
                ),
                user_visits AS (
                  SELECT
                    e.anonymous_id,
                    toDate(e.time) as visit_date
                  FROM analytics.events e
                  WHERE
                    e.client_id = {websiteId:String}
                    AND e.time >= parseDateTimeBestEffort({startDate:String})
                    AND e.time <= parseDateTimeBestEffort({endDate:String})
                    AND e.anonymous_id != ''
                    AND e.event_name = 'screen_view'
                    ${combinedWhereClause}
                  GROUP BY e.anonymous_id, toDate(e.time)
                ),
                retention_calc AS (
                  SELECT
                    fv.first_visit_week as cohort,
                    count(DISTINCT CASE 
                      WHEN uv.visit_date >= fv.first_visit_week 
                        AND uv.visit_date < fv.first_visit_week + INTERVAL 7 DAY
                      THEN fv.anonymous_id 
                      ELSE NULL 
                    END) as week_0_returned,
                    count(DISTINCT CASE 
                      WHEN uv.visit_date >= fv.first_visit_week + INTERVAL 7 DAY 
                        AND uv.visit_date < fv.first_visit_week + INTERVAL 14 DAY
                      THEN fv.anonymous_id 
                      ELSE NULL 
                    END) as week_1_returned,
                    count(DISTINCT CASE 
                      WHEN uv.visit_date >= fv.first_visit_week + INTERVAL 14 DAY 
                        AND uv.visit_date < fv.first_visit_week + INTERVAL 21 DAY
                      THEN fv.anonymous_id 
                      ELSE NULL 
                    END) as week_2_returned,
                    count(DISTINCT CASE 
                      WHEN uv.visit_date >= fv.first_visit_week + INTERVAL 21 DAY 
                        AND uv.visit_date < fv.first_visit_week + INTERVAL 28 DAY
                      THEN fv.anonymous_id 
                      ELSE NULL 
                    END) as week_3_returned,
                    count(DISTINCT CASE 
                      WHEN uv.visit_date >= fv.first_visit_week + INTERVAL 28 DAY 
                        AND uv.visit_date < fv.first_visit_week + INTERVAL 35 DAY
                      THEN fv.anonymous_id 
                      ELSE NULL 
                    END) as week_4_returned,
                    count(DISTINCT CASE 
                      WHEN uv.visit_date >= fv.first_visit_week + INTERVAL 35 DAY 
                        AND uv.visit_date < fv.first_visit_week + INTERVAL 42 DAY
                      THEN fv.anonymous_id 
                      ELSE NULL 
                    END) as week_5_returned,
                    c.total_users
                  FROM first_visits fv
                  LEFT JOIN user_visits uv ON fv.anonymous_id = uv.anonymous_id
                  INNER JOIN cohorts c ON fv.first_visit_week = c.cohort_week
                  GROUP BY fv.first_visit_week, c.total_users
                )
                SELECT
                  formatDateTime(cohort, '%Y-%m-%d') as cohort,
                  total_users as users,
                  100.0 as week_0_retention,
                  ROUND(CASE 
                    WHEN total_users > 0 
                    THEN (week_1_returned / total_users) * 100 
                    ELSE 0 
                  END, 2) as week_1_retention,
                  ROUND(CASE 
                    WHEN total_users > 0 
                    THEN (week_2_returned / total_users) * 100 
                    ELSE 0 
                  END, 2) as week_2_retention,
                  ROUND(CASE 
                    WHEN total_users > 0 
                    THEN (week_3_returned / total_users) * 100 
                    ELSE 0 
                  END, 2) as week_3_retention,
                  ROUND(CASE 
                    WHEN total_users > 0 
                    THEN (week_4_returned / total_users) * 100 
                    ELSE 0 
                  END, 2) as week_4_retention,
                  ROUND(CASE 
                    WHEN total_users > 0 
                    THEN (week_5_returned / total_users) * 100 
                    ELSE 0 
                  END, 2) as week_5_retention
                FROM retention_calc
                GROUP BY cohort, total_users, week_1_returned, week_2_returned, week_3_returned, week_4_returned, week_5_returned
                ORDER BY cohort DESC
            `,
				params: {
					websiteId,
					startDate,
					endDate: `${endDate} 23:59:59`,
					...filterParams,
				},
			};
		},
		plugins: {
			normalizeGeo: true,
		},
	},

	retention_rate: {
		meta: {
			title: "Retention Rate",
			description:
				"Overall user retention metrics showing return visitor rates over time.",
			category: "Engagement",
			tags: ["retention", "user behavior", "engagement"],
			output_fields: [
				{
					name: "date",
					type: "string",
					label: "Date",
					description: "Date of the retention calculation",
				},
				{
					name: "new_users",
					type: "number",
					label: "New Users",
					description: "Number of new users (first visit)",
				},
				{
					name: "returning_users",
					type: "number",
					label: "Returning Users",
					description: "Number of returning users",
				},
				{
					name: "retention_rate",
					type: "number",
					label: "Retention Rate",
					description: "Percentage of returning users",
					unit: "%",
				},
			],
			default_visualization: "line",
			supports_granularity: ["day", "week", "month"],
			version: "1.0",
		},
		customSql: (
			websiteId: string,
			startDate: string,
			endDate: string,
			_filters?: Filter[],
			_granularity?: TimeUnit,
			_limit?: number,
			_offset?: number,
			_timezone?: string,
			filterConditions?: string[],
			filterParams?: Record<string, Filter["value"]>
		) => {
			const combinedWhereClause = filterConditions?.length
				? `AND ${filterConditions.join(" AND ")}`
				: "";

			return {
				sql: `
                WITH all_first_visits AS (
                  SELECT
                    anonymous_id,
                    toDate(MIN(time)) as first_visit_date
                  FROM analytics.events
                  WHERE
                    client_id = {websiteId:String}
                    AND anonymous_id != ''
                    AND event_name = 'screen_view'
                  GROUP BY anonymous_id
                ),
                daily_visits AS (
                  SELECT
                    e.anonymous_id,
                    toDate(e.time) as visit_date
                  FROM analytics.events e
                  WHERE
                    e.client_id = {websiteId:String}
                    AND e.time >= parseDateTimeBestEffort({startDate:String})
                    AND e.time <= parseDateTimeBestEffort({endDate:String})
                    AND e.anonymous_id != ''
                    AND e.event_name = 'screen_view'
                    ${combinedWhereClause}
                  GROUP BY e.anonymous_id, toDate(e.time)
                ),
                daily_stats AS (
                  SELECT
                    dv.visit_date as date,
                    count(DISTINCT CASE 
                      WHEN afv.first_visit_date = dv.visit_date 
                      THEN dv.anonymous_id 
                      ELSE NULL 
                    END) as new_users,
                    count(DISTINCT CASE 
                      WHEN afv.first_visit_date < dv.visit_date 
                      THEN dv.anonymous_id 
                      ELSE NULL 
                    END) as returning_users,
                    count(DISTINCT dv.anonymous_id) as total_users
                  FROM daily_visits dv
                  LEFT JOIN all_first_visits afv ON dv.anonymous_id = afv.anonymous_id
                  GROUP BY dv.visit_date
                )
                SELECT
                  formatDateTime(date, '%Y-%m-%d') as date,
                  new_users,
                  returning_users,
                  ROUND(CASE 
                    WHEN total_users > 0 
                    THEN (returning_users / total_users) * 100 
                    ELSE 0 
                  END, 2) as retention_rate
                FROM daily_stats
                ORDER BY date ASC
            `,
				params: {
					websiteId,
					startDate,
					endDate: `${endDate} 23:59:59`,
					...filterParams,
				},
			};
		},
		plugins: {
			normalizeGeo: true,
		},
	},
};
