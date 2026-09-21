import { Analytics } from "../../types/tables";
import { Expressions } from "../expressions";
import type { SimpleQueryConfig } from "../types";

export const EngagementBuilders: Record<string, SimpleQueryConfig> = {
	frustration_by_page: {
		meta: {
			title: "Frustration by Page",
			description:
				"Rage clicks, dead clicks, and errors per page view, with the control most often involved.",
			category: "Engagement",
			tags: ["frustration", "rage clicks", "dead clicks", "engagement"],
			output_fields: [
				{ name: "name", type: "string", label: "Page" },
				{ name: "page_views", type: "number", label: "Page Views" },
				{ name: "visitors", type: "number", label: "Visitors" },
				{
					name: "rage_click_rate",
					type: "number",
					label: "Rage Click Rate",
					description: "Share of page views with at least one rage click",
					unit: "%",
				},
				{
					name: "dead_click_rate",
					type: "number",
					label: "Dead Click Rate",
					description: "Share of page views with at least one dead click",
					unit: "%",
				},
				{
					name: "error_rate",
					type: "number",
					label: "Error Rate",
					description: "Share of page views with a captured error",
					unit: "%",
				},
				{
					name: "top_dead_click_target",
					type: "string",
					label: "Most Dead-Clicked Control",
				},
				{
					name: "top_rage_click_target",
					type: "string",
					label: "Most Rage-Clicked Control",
				},
			],
			default_visualization: "table",
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			const limit = ctx.limit ?? 100;
			return {
				sql: `
					SELECT
						decodeURLComponent(${Expressions.path.normalized}) as name,
						COUNT(*) as page_views,
						uniq(anonymous_id) as visitors,
						ROUND(100 * countIf(rage_click_count > 0) / COUNT(*), 1) as rage_click_rate,
						ROUND(100 * countIf(dead_click_count > 0) / COUNT(*), 1) as dead_click_rate,
						ROUND(100 * countIf(error_count > 0) / COUNT(*), 1) as error_rate,
						topKIf(1)(dead_click_target, dead_click_target != '')[1] as top_dead_click_target,
						topKIf(1)(rage_click_target, rage_click_target != '')[1] as top_rage_click_target
					FROM ${Analytics.engagement_spans}
					WHERE
						client_id = {websiteId:String}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND path != ''
					GROUP BY path
					HAVING page_views >= 5
					ORDER BY (rage_click_rate + dead_click_rate) DESC, page_views DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
	},

	form_abandonment_by_page: {
		meta: {
			title: "Form Abandonment by Page",
			description:
				"Page views that touched a form field without submitting, and the field visitors stopped on.",
			category: "Engagement",
			tags: ["forms", "abandonment", "conversion", "engagement"],
			output_fields: [
				{ name: "name", type: "string", label: "Page" },
				{
					name: "form_starts",
					type: "number",
					label: "Form Starts",
					description: "Page views that focused at least one form field",
				},
				{ name: "form_submits", type: "number", label: "Form Submits" },
				{
					name: "abandonment_rate",
					type: "number",
					label: "Abandonment Rate",
					unit: "%",
				},
				{
					name: "top_abandoned_field",
					type: "string",
					label: "Field Most Often Left On",
				},
			],
			default_visualization: "table",
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			const limit = ctx.limit ?? 100;
			return {
				sql: `
					SELECT
						decodeURLComponent(${Expressions.path.normalized}) as name,
						countIf(form_field_count > 0) as form_starts,
						countIf(form_submit_count > 0) as form_submits,
						ROUND(100 * countIf(form_abandoned = 1) / countIf(form_field_count > 0), 1) as abandonment_rate,
						topKIf(1)(last_form_field, form_abandoned = 1 AND last_form_field != '')[1] as top_abandoned_field
					FROM ${Analytics.engagement_spans}
					WHERE
						client_id = {websiteId:String}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND path != ''
						AND form_field_count > 0
					GROUP BY path
					HAVING form_starts >= 5
					ORDER BY abandonment_rate DESC, form_starts DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
	},

	engagement_quality_by_page: {
		meta: {
			title: "Engagement Quality by Page",
			description:
				"Active time versus time on page, scroll depth, and interaction per page view.",
			category: "Engagement",
			tags: ["active time", "attention", "engagement", "page"],
			output_fields: [
				{ name: "name", type: "string", label: "Page" },
				{ name: "page_views", type: "number", label: "Page Views" },
				{
					name: "avg_time_on_page",
					type: "number",
					label: "Avg Time on Page",
					unit: "s",
				},
				{
					name: "avg_active_time",
					type: "number",
					label: "Avg Active Time",
					description: "Seconds the tab was visible and focused",
					unit: "s",
				},
				{
					name: "attention_ratio",
					type: "number",
					label: "Attention Ratio",
					description: "Active time as a share of time on page",
					unit: "%",
				},
				{
					name: "avg_scroll_depth",
					type: "number",
					label: "Avg Scroll Depth",
					unit: "%",
				},
				{
					name: "avg_interactions",
					type: "number",
					label: "Avg Interactions",
				},
				{
					name: "median_time_to_first_interaction",
					type: "number",
					label: "Median Time to First Interaction",
					unit: "ms",
				},
			],
			default_visualization: "table",
		},
		customSql: (ctx) => {
			const { websiteId, startDate, endDate } = ctx;
			const limit = ctx.limit ?? 100;
			return {
				sql: `
					SELECT
						decodeURLComponent(${Expressions.path.normalized}) as name,
						COUNT(*) as page_views,
						ROUND(AVG(time_on_page), 1) as avg_time_on_page,
						ROUND(AVG(active_time), 1) as avg_active_time,
						ROUND(100 * SUM(active_time) / greatest(SUM(time_on_page), 1), 1) as attention_ratio,
						ROUND(AVG(max_scroll_depth), 1) as avg_scroll_depth,
						ROUND(AVG(interaction_count), 1) as avg_interactions,
						quantileTDigestIf(0.5)(time_to_first_interaction, time_to_first_interaction > 0) as median_time_to_first_interaction
					FROM ${Analytics.engagement_spans}
					WHERE
						client_id = {websiteId:String}
						AND timestamp >= toDateTime({startDate:String})
						AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))
						AND path != ''
					GROUP BY path
					HAVING page_views >= 5
					ORDER BY page_views DESC
					LIMIT {limit:UInt32}
				`,
				params: { websiteId, startDate, endDate, limit },
			};
		},
	},

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
				{
					name: "visitors",
					type: "number",
					label: "Visitors",
					description: "Unique visitors with scroll data",
				},
			],
			default_visualization: "metric",
			supports_granularity: ["hour", "day"],
		},
		table: Analytics.events,
		fields: [
			"ROUND(AVG(CASE WHEN scroll_depth > 0 THEN scroll_depth ELSE NULL END), 1) as avg_scroll_depth",
			"uniq(session_id) as total_sessions",
			"uniq(anonymous_id) as visitors",
		],
		where: ["event_name = 'page_exit'", "scroll_depth > 0"],
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
		},
		table: Analytics.events,
		fields: [
			"CASE " +
				"WHEN scroll_depth < 25 THEN '0-25%' " +
				"WHEN scroll_depth < 50 THEN '25-50%' " +
				"WHEN scroll_depth < 75 THEN '50-75%' " +
				"WHEN scroll_depth < 100 THEN '75-100%' " +
				"ELSE '100%' " +
				"END as depth_range",
			"uniq(anonymous_id) as visitors",
			"uniq(session_id) as sessions",
		],
		percentageOf: { of: "sessions" },
		where: ["event_name = 'page_exit'", "scroll_depth > 0"],
		groupBy: ["depth_range"],
		orderBy:
			"CASE depth_range WHEN '0-25%' THEN 1 WHEN '25-50%' THEN 2 WHEN '50-75%' THEN 3 WHEN '75-100%' THEN 4 ELSE 5 END",
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
				{
					name: "pageviews",
					type: "number",
					label: "Pageviews",
					description: "Total pageviews on this page",
				},
			],
			default_visualization: "table",
			supports_granularity: ["hour", "day"],
		},
		table: Analytics.events,
		fields: [
			"trimRight(path(path), '/') as name",
			"ROUND(AVG(CASE WHEN scroll_depth > 0 THEN scroll_depth ELSE NULL END), 1) as avg_scroll_depth",
			"uniq(anonymous_id) as visitors",
			"uniq(session_id) as sessions",
			"COUNT(*) as pageviews",
		],
		where: ["event_name = 'page_exit'", "path != ''", "scroll_depth > 0"],
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
				{
					name: "total_sessions",
					type: "number",
					label: "Total Sessions",
					description: "Total sessions in the period",
				},
			],
			default_visualization: "metric",
			supports_granularity: ["hour", "day"],
		},
		table: Analytics.events,
		fields: [
			"ROUND(AVG(CASE WHEN interaction_count >= 0 THEN interaction_count ELSE NULL END), 1) as avg_interactions",
			"uniqIf(session_id, interaction_count > 0) as interactive_sessions",
			"ROUND((uniqIf(session_id, interaction_count > 0) / uniq(session_id)) * 100, 1) as interaction_rate",
			"uniq(session_id) as total_sessions",
		],
		where: ["event_name = 'screen_view'", "interaction_count >= 0"],
		timeField: "time",
		customizable: true,
	},
};
