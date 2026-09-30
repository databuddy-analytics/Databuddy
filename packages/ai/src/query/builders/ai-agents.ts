import { AI_AGENTS } from "@databuddy/shared/bot-detection/ai-agents";
import {
	UNIDENTIFIED_AGENT_PREFIX,
	UNIDENTIFIED_AGENTS_PRODUCT,
} from "@databuddy/shared/bot-detection/types";
import { AI_APP_BROWSERS } from "@databuddy/shared/bot-detection/user-agent";
import { AI_REFERRERS } from "@databuddy/shared/utils/referrer";
import { Analytics } from "../../types/tables";
import { appendFilterClause } from "../simple-builder";
import type { CustomSqlContext, SimpleQueryConfig } from "../types";

const AGENT_PRODUCT = `if(startsWith(agent_id, '${UNIDENTIFIED_AGENT_PREFIX}'), '${UNIDENTIFIED_AGENTS_PRODUCT}', transform(agent_id, {agentIds:Array(String)}, {agentProducts:Array(String)}, agent_id))`;
const AGENT_OPERATOR = `if(startsWith(agent_id, '${UNIDENTIFIED_AGENT_PREFIX}'), '', transform(agent_id, {agentIds:Array(String)}, {agentOperators:Array(String)}, ''))`;
const AGENT_NAME = `multiIf(agent_id = '${UNIDENTIFIED_AGENT_PREFIX}mozilla', 'Unnamed browser client', startsWith(agent_id, '${UNIDENTIFIED_AGENT_PREFIX}'), substring(agent_id, ${UNIDENTIFIED_AGENT_PREFIX.length + 1}), transform(agent_id, {agentIds:Array(String)}, {agentNames:Array(String)}, agent_id))`;
export function aiVisitProduct(referrerDomain: string): string {
	return `if(has({aiApps:Array(String)}, browser_name), browser_name, transform(${referrerDomain}, {aiDomains:Array(String)}, {aiNames:Array(String)}, transform(utm_source, {aiDomains:Array(String)}, {aiNames:Array(String)}, '')))`;
}

export const AI_VISIT_PARAMS = {
	aiApps: AI_APP_BROWSERS,
	aiDomains: AI_REFERRERS.map((referrer) => referrer.domain),
	aiNames: AI_REFERRERS.map((referrer) => referrer.name),
};

const VISIT_PRODUCT = aiVisitProduct("domainWithoutWWW(referrer)");
const CONTENT_FORMAT = "if(format = '', 'html', format)";
const PURPOSE_COUNTS = `countIf(agent_purpose = 'training') AS training,
	countIf(agent_purpose = 'search_index') AS search_index,
	countIf(agent_purpose IN ('user_fetch', 'agent')) AS on_demand`;

const PAGE =
	"decodeURLComponent(if(trimRight(path(path), '/') = '', '/', trimRight(path(path), '/')))";

const SERVER_SIDE_SOURCES = "('middleware', 'vercel')";

function firstRowFrom(sources: string): string {
	return `(
		SELECT ifNull(minOrNull(timestamp), toDateTime64('2100-01-01', 3))
		FROM ${Analytics.ai_traffic_spans}
		WHERE client_id = {websiteId:String} AND source IN ${sources}
	)`;
}

const FIRST_VERCEL_ROW = firstRowFrom("('vercel')");
const FIRST_MIDDLEWARE_ROW = firstRowFrom("('middleware')");

const AGENT_REQUEST = `client_id = {websiteId:String}
	AND agent_id != ''
	AND multiIf(
		source = 'vercel', ${FIRST_MIDDLEWARE_ROW} <= ${FIRST_VERCEL_ROW} OR timestamp < ${FIRST_MIDDLEWARE_ROW},
		source = 'middleware', ${FIRST_VERCEL_ROW} <= ${FIRST_MIDDLEWARE_ROW} OR timestamp < ${FIRST_VERCEL_ROW},
		timestamp < ${firstRowFrom(SERVER_SIDE_SOURCES)}
	)`;

const AGENT_REQUEST_IN_RANGE = `${AGENT_REQUEST}
	AND timestamp >= toDateTime({startDate:String})
	AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))`;

const EVENT_IN_RANGE = `client_id = {websiteId:String}
	AND time >= toDateTime({startDate:String})
	AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))`;

function queryParams(ctx: CustomSqlContext) {
	return {
		websiteId: ctx.websiteId,
		startDate: ctx.startDate,
		endDate: ctx.endDate,
		timezone: ctx.timezone || "UTC",
		agentIds: AI_AGENTS.map((agent) => agent.id),
		agentProducts: AI_AGENTS.map((agent) => agent.product),
		agentNames: AI_AGENTS.map((agent) => agent.name),
		agentOperators: AI_AGENTS.map((agent) => agent.operator),
		...AI_VISIT_PARAMS,
	};
}

export function aiActiveWebsitesQuery(from: string, to: string) {
	return {
		sql: `
			SELECT client_id FROM ${Analytics.ai_traffic_spans}
			WHERE timestamp >= toDateTime({from:String}) AND timestamp < toDateTime({to:String}) AND agent_id != ''
			GROUP BY client_id
			UNION DISTINCT
			SELECT client_id FROM ${Analytics.events}
			WHERE time >= toDateTime({from:String}) AND time < toDateTime({to:String}) AND ${VISIT_PRODUCT} != ''
			GROUP BY client_id
		`,
		params: { from, to, ...AI_VISIT_PARAMS },
	};
}

export const AiAgentsBuilders = {
	ai_products: {
		meta: {
			title: "AI Products",
			description:
				"AI products (ChatGPT, Claude, Perplexity, Gemini, Meta AI and others) with the requests their crawlers and agents made, pages they read, purpose split, and visitors they sent through referrals or their desktop app browser.",
			category: "AI Agents",
			tags: ["ai", "agents", "crawlers", "chatgpt", "claude", "referrals"],
			output_fields: [
				{ name: "product", type: "string", label: "Product" },
				{ name: "requests", type: "number", label: "Requests" },
				{ name: "pages", type: "number", label: "Pages read" },
				{ name: "training", type: "number", label: "Training" },
				{ name: "search_index", type: "number", label: "Search index" },
				{ name: "on_demand", type: "number", label: "On demand" },
				{ name: "visitors", type: "number", label: "Visitors referred" },
				{ name: "last_seen", type: "datetime", label: "Last request" },
				{
					name: "has_proxy",
					type: "boolean",
					label:
						"Site has ever sent server-side requests (@databuddy/sdk/agents or a Vercel log drain)",
				},
			],
			default_visualization: "table",
		},
		customSql: (ctx) => ({
			sql: `
				SELECT
					if(c.product != '', c.product, v.product) AS product,
					c.requests, c.pages, c.training, c.search_index, c.on_demand,
					v.visitors, c.last_seen,
					(
						SELECT count() > 0
						FROM ${Analytics.ai_traffic_spans}
						WHERE client_id = {websiteId:String} AND source IN ${SERVER_SIDE_SOURCES}
					) AS has_proxy
				FROM (
					SELECT
						${AGENT_PRODUCT} AS product,
						count() AS requests,
						uniq(${PAGE}) AS pages,
						${PURPOSE_COUNTS},
						max(timestamp) AS last_seen
					FROM ${Analytics.ai_traffic_spans}
					WHERE ${AGENT_REQUEST_IN_RANGE}
					GROUP BY product
				) AS c
				FULL OUTER JOIN (
					SELECT ${VISIT_PRODUCT} AS product, uniq(anonymous_id) AS visitors
					FROM ${Analytics.events}
					WHERE ${EVENT_IN_RANGE}
					GROUP BY product
					HAVING product != ''
				) AS v ON c.product = v.product
				ORDER BY c.requests + v.visitors DESC
				LIMIT {limit:UInt32}
			`,
			params: { ...queryParams(ctx), limit: ctx.limit ?? 50 },
		}),
		timeField: "timestamp",
		customizable: false,
	},

	ai_content_formats: {
		meta: {
			title: "How AI Reads Your Content",
			description:
				"AI requests split by content format (markdown, llms.txt, or HTML, as the agent asked for it through the path or the Accept header; page loads recorded by the browser tracker count as HTML), with the pages and the AI products fetching each format.",
			category: "AI Agents",
			tags: ["ai", "agents", "markdown", "llms.txt", "docs"],
			output_fields: [
				{ name: "format", type: "string", label: "Format" },
				{ name: "requests", type: "number", label: "Requests" },
				{ name: "pages", type: "number", label: "Pages" },
				{ name: "products", type: "json", label: "Read by" },
			],
			default_visualization: "table",
		},
		customSql: (ctx) => ({
			sql: `
				SELECT
					${CONTENT_FORMAT} AS format,
					count() AS requests,
					uniq(${PAGE}) AS pages,
					topK(4)(${AGENT_PRODUCT}) AS products
				FROM ${Analytics.ai_traffic_spans}
				WHERE ${AGENT_REQUEST_IN_RANGE}
				GROUP BY format
				ORDER BY requests DESC
			`,
			params: queryParams(ctx),
		}),
		timeField: "timestamp",
		customizable: false,
	},

	ai_product_visitors: {
		meta: {
			title: "AI Visitors Over Time",
			description:
				"Visitors per day (or hour) sent by each AI product, from its referrals and from its desktop app browser (Claude, Cursor).",
			category: "AI Agents",
			tags: ["ai", "referrals", "visitors", "time-series"],
			output_fields: [
				{ name: "date", type: "string", label: "Date" },
				{ name: "product", type: "string", label: "Product" },
				{ name: "visitors", type: "number", label: "Visitors" },
			],
			default_visualization: "timeseries",
			supports_granularity: ["hour", "day"],
		},
		customSql: (ctx) => {
			const bucket =
				ctx.granularity === "hour"
					? "toStartOfHour(toTimeZone(time, {timezone:String}))"
					: "toDate(toTimeZone(time, {timezone:String}))";
			return {
				sql: `
					SELECT ${bucket} AS date, ${VISIT_PRODUCT} AS product, uniq(anonymous_id) AS visitors
					FROM ${Analytics.events}
					WHERE ${EVENT_IN_RANGE}
					GROUP BY date, product
					HAVING product != ''
					ORDER BY date ASC
				`,
				params: queryParams(ctx),
			};
		},
		timeField: "time",
		customizable: false,
	},

	ai_agent_pages: {
		meta: {
			title: "Pages Read by AI",
			description:
				"What AI crawlers and agents read: one row per page and content format (markdown, llms.txt or HTML, as the agent asked for it), with the request count, last request, and every agent that read it (id, name, product, requests), most requested first. Up to `limit` pages per format (1000 by default).",
			category: "AI Agents",
			tags: [
				"ai",
				"agents",
				"crawlers",
				"pages",
				"markdown",
				"llms.txt",
				"llms-full.txt",
				"docs",
			],
			output_fields: [
				{ name: "page", type: "string", label: "Page" },
				{ name: "format", type: "string", label: "Format" },
				{ name: "requests", type: "number", label: "Requests" },
				{ name: "last_seen", type: "datetime", label: "Last request" },
				{ name: "agents", type: "json", label: "Read by" },
			],
			default_visualization: "table",
		},
		customSql: (ctx) => ({
			sql: `
				SELECT
					page,
					format,
					sum(agent_requests) AS requests,
					max(agent_last_seen) AS last_seen,
					arrayReverseSort(
						agent -> agent.requests,
						groupArray(CAST(
							(agent_id, name, product, agent_requests),
							'Tuple(agent_id String, name String, product String, requests UInt64)'
						))
					) AS agents
				FROM (
					SELECT
						${PAGE} AS page,
						${CONTENT_FORMAT} AS format,
						agent_id,
						${AGENT_NAME} AS name,
						${AGENT_PRODUCT} AS product,
						count() AS agent_requests,
						max(timestamp) AS agent_last_seen
					FROM ${Analytics.ai_traffic_spans}
					WHERE ${AGENT_REQUEST_IN_RANGE} AND path != ''
					GROUP BY page, format, agent_id
				)
				GROUP BY page, format
				ORDER BY requests DESC, page ASC
				LIMIT {limit:UInt32} BY format
			`,
			params: { ...queryParams(ctx), limit: ctx.limit ?? 1000 },
		}),
		timeField: "timestamp",
		customizable: false,
	},

	ai_landing_pages: {
		meta: {
			title: "Pages AI Sends Visitors To",
			description:
				"Pages that visitors from AI products (referrals and AI app browsers such as Claude or Cursor) viewed, counting page views only, with each page's pageviews from all visitors and, per AI product that sent visitors, its visitors and how many times its crawlers and agents read that page in the same period.",
			category: "AI Agents",
			tags: ["ai", "referrals", "pages", "visitors", "reads", "citations"],
			output_fields: [
				{ name: "page", type: "string", label: "Page" },
				{ name: "visitors", type: "number", label: "AI visitors" },
				{ name: "pageviews", type: "number", label: "Pageviews" },
				{
					name: "senders",
					type: "json",
					label: "Sent by (product, visitors, reads)",
				},
			],
			default_visualization: "table",
		},
		customSql: (ctx) => ({
			sql: `
				SELECT
					page,
					uniqMergeIf(visitor_state, product != '') AS visitors,
					sum(views) AS pageviews,
					arrayReverseSort(
						sender -> sender.visitors,
						groupArrayIf(
							CAST(
								(product, finalizeAggregation(visitor_state), reads),
								'Tuple(product String, visitors UInt64, reads UInt64)'
							),
							product != ''
						)
					) AS senders
				FROM (
					SELECT
						e.page AS page,
						e.product AS product,
						e.visitor_state AS visitor_state,
						e.views AS views,
						ifNull(r.reads, 0) AS reads
					FROM (
						SELECT
							${PAGE} AS page,
							visit_product AS product,
							uniqState(anonymous_id) AS visitor_state,
							count() AS views
						FROM (
							SELECT path, anonymous_id, ${VISIT_PRODUCT} AS visit_product
							FROM ${Analytics.events}
							WHERE ${EVENT_IN_RANGE} AND path != '' AND event_name = 'screen_view'
						)
						GROUP BY page, product
					) AS e
					LEFT JOIN (
						SELECT ${PAGE} AS page, ${AGENT_PRODUCT} AS product, count() AS reads
						FROM ${Analytics.ai_traffic_spans}
						WHERE ${AGENT_REQUEST_IN_RANGE} AND path != ''
						GROUP BY page, product
					) AS r ON e.page = r.page AND e.product = r.product
				)
				GROUP BY page
				HAVING visitors > 0
				ORDER BY visitors DESC, pageviews DESC
				LIMIT {limit:UInt32}
			`,
			params: { ...queryParams(ctx), limit: ctx.limit ?? 100 },
		}),
		timeField: "time",
		customizable: false,
	},

	ai_visitor_outcomes: {
		meta: {
			title: "What AI Visitors Do",
			description:
				"Visitors each AI product sent, how many pages they viewed per visit, and the share that viewed two or more pages, plus the same numbers for all AI visitors combined ('All AI visitors', each visit counted once) and for all visitors ('All visitors').",
			category: "AI Agents",
			tags: ["ai", "referrals", "engagement", "outcomes"],
			output_fields: [
				{ name: "product", type: "string", label: "Product" },
				{ name: "visitors", type: "number", label: "Visitors" },
				{ name: "pages_per_visit", type: "number", label: "Pages per visit" },
				{
					name: "engaged_rate",
					type: "number",
					label: "Viewed 2+ pages",
					unit: "%",
				},
			],
			default_visualization: "table",
		},
		customSql: (ctx) => ({
			sql: `
				SELECT
					multiIf(
						grouping(ai_product) = 0, ai_product,
						grouping(is_ai) = 0, 'All AI visitors',
						'All visitors'
					) AS product,
					uniqArray(session_visitors) AS visitors,
					round(avg(pageviews), 2) AS pages_per_visit,
					round(countIf(pageviews > 1) / count() * 100, 1) AS engaged_rate
				FROM (
					SELECT
						session_id,
						groupUniqArray(anonymous_id) AS session_visitors,
						anyIf(visit_product, visit_product != '') AS ai_product,
						ai_product != '' AS is_ai,
						countIf(event_name = 'screen_view') AS pageviews
					FROM (
						SELECT session_id, anonymous_id, event_name, ${VISIT_PRODUCT} AS visit_product
						FROM ${Analytics.events}
						WHERE ${EVENT_IN_RANGE}
					)
					GROUP BY session_id
				)
				GROUP BY GROUPING SETS ((ai_product), (is_ai), ())
				HAVING (grouping(ai_product) = 0 AND ai_product != '')
					OR (grouping(ai_product) = 1 AND grouping(is_ai) = 0 AND is_ai)
					OR (grouping(ai_product) = 1 AND grouping(is_ai) = 1)
				ORDER BY grouping(ai_product) DESC, grouping(is_ai) DESC, visitors DESC
				LIMIT {limit:UInt32}
			`,
			params: { ...queryParams(ctx), limit: ctx.limit ?? 20 },
		}),
		timeField: "time",
		customizable: false,
	},

	ai_crawlers: {
		meta: {
			title: "AI Crawlers",
			description:
				"Each AI crawler or agent that requested your pages, with its product, the company operating it (empty for unidentified agents), purpose, request count, distinct pages read, how many of those requests asked for markdown or llms.txt, last request, and a sample user agent for checking robots.txt rules.",
			category: "AI Agents",
			tags: [
				"ai",
				"crawlers",
				"agents",
				"bots",
				"robots.txt",
				"gptbot",
				"claudebot",
				"perplexitybot",
				"chatgpt-user",
				"claude code",
			],
			output_fields: [
				{ name: "agent_id", type: "string", label: "Agent" },
				{ name: "name", type: "string", label: "Crawler" },
				{ name: "product", type: "string", label: "Product" },
				{ name: "operator", type: "string", label: "Operator" },
				{ name: "purpose", type: "string", label: "Purpose" },
				{ name: "requests", type: "number", label: "Requests" },
				{ name: "pages", type: "number", label: "Pages read" },
				{ name: "markdown", type: "number", label: "Markdown requests" },
				{ name: "llms", type: "number", label: "llms.txt requests" },
				{ name: "last_seen", type: "datetime", label: "Last request" },
				{ name: "user_agent", type: "string", label: "User agent" },
			],
			default_visualization: "table",
		},
		customSql: (ctx) => ({
			sql: `
				SELECT
					agent_id,
					${AGENT_NAME} AS name,
					any(${AGENT_PRODUCT}) AS product,
					${AGENT_OPERATOR} AS operator,
					any(agent_purpose) AS purpose,
					count() AS requests,
					uniq(${PAGE}) AS pages,
					countIf(${CONTENT_FORMAT} = 'markdown') AS markdown,
					countIf(${CONTENT_FORMAT} = 'llms') AS llms,
					max(timestamp) AS last_seen,
					any(user_agent) AS user_agent
				FROM ${Analytics.ai_traffic_spans}
				WHERE ${AGENT_REQUEST_IN_RANGE}
				GROUP BY agent_id
				ORDER BY requests DESC
				LIMIT {limit:UInt32}
			`,
			params: { ...queryParams(ctx), limit: ctx.limit ?? 50 },
		}),
		timeField: "timestamp",
		customizable: false,
	},

	ai_crawler_activity: {
		meta: {
			title: "AI Requests Over Time",
			description:
				"AI crawler and agent requests per day (or hour), split into markdown, llms.txt and HTML requests. Filter by agent_id to follow one agent.",
			category: "AI Agents",
			tags: ["ai", "crawlers", "agents", "time-series", "trend"],
			output_fields: [
				{ name: "date", type: "string", label: "Date" },
				{ name: "requests", type: "number", label: "Requests" },
				{ name: "markdown", type: "number", label: "Markdown requests" },
				{ name: "llms", type: "number", label: "llms.txt requests" },
				{ name: "html", type: "number", label: "HTML requests" },
			],
			default_visualization: "timeseries",
			supports_granularity: ["hour", "day"],
		},
		commonFilters: false,
		allowedFilters: ["agent_id"],
		customSql: (ctx) => {
			const bucket =
				ctx.granularity === "hour"
					? "toStartOfHour(toTimeZone(timestamp, {timezone:String}))"
					: "toDate(toTimeZone(timestamp, {timezone:String}))";
			return {
				sql: `
					SELECT
						${bucket} AS date,
						count() AS requests,
						countIf(${CONTENT_FORMAT} = 'markdown') AS markdown,
						countIf(${CONTENT_FORMAT} = 'llms') AS llms,
						countIf(${CONTENT_FORMAT} = 'html') AS html
					FROM ${Analytics.ai_traffic_spans}
					WHERE ${AGENT_REQUEST_IN_RANGE} ${appendFilterClause(ctx.filterConditions)}
					GROUP BY date
					ORDER BY date ASC
				`,
				params: { ...queryParams(ctx), ...ctx.filterParams },
			};
		},
		timeField: "timestamp",
		customizable: false,
	},

	ai_weekly_digest: {
		meta: {
			title: "AI Activity Digest",
			description:
				"Per AI product, visitors sent and requests made in the selected period and the equally long period before it, plus the pages it read in the selected period that it had not read in the 90 days before.",
			category: "AI Agents",
			tags: ["ai", "digest", "summary", "week-over-week"],
			output_fields: [
				{ name: "product", type: "string", label: "Product" },
				{ name: "visitors", type: "number", label: "Visitors" },
				{
					name: "previous_visitors",
					type: "number",
					label: "Previous visitors",
				},
				{ name: "requests", type: "number", label: "Requests" },
				{
					name: "previous_requests",
					type: "number",
					label: "Previous requests",
				},
				{
					name: "new_pages",
					type: "number",
					label: "Pages read for the first time",
				},
			],
			default_visualization: "table",
		},
		customSql: (ctx) => ({
			sql: `
				WITH
					toDate({startDate:String}) AS current_start,
					toDate({endDate:String}) + 1 AS period_end,
					current_start - (period_end - current_start) AS previous_start
				SELECT
					product,
					sum(visitors_now) AS visitors,
					sum(visitors_before) AS previous_visitors,
					sum(requests_now) AS requests,
					sum(requests_before) AS previous_requests,
					sum(pages_new) AS new_pages
				FROM (
					SELECT
						${AGENT_PRODUCT} AS product,
						toUInt64(0) AS visitors_now,
						toUInt64(0) AS visitors_before,
						toUInt64(countIf(timestamp >= current_start)) AS requests_now,
						toUInt64(countIf(timestamp < current_start)) AS requests_before,
						toUInt64(0) AS pages_new
					FROM ${Analytics.ai_traffic_spans}
					WHERE ${AGENT_REQUEST}
						AND timestamp >= previous_start AND timestamp < period_end
					GROUP BY product
					UNION ALL
					SELECT
						${VISIT_PRODUCT} AS product,
						toUInt64(uniqIf(anonymous_id, time >= current_start)),
						toUInt64(uniqIf(anonymous_id, time < current_start)),
						toUInt64(0),
						toUInt64(0),
						toUInt64(0)
					FROM ${Analytics.events}
					WHERE client_id = {websiteId:String}
						AND time >= previous_start AND time < period_end
					GROUP BY product
					HAVING product != ''
					UNION ALL
					SELECT
						product,
						toUInt64(0),
						toUInt64(0),
						toUInt64(0),
						toUInt64(0),
						toUInt64(countIf(first_read >= current_start))
					FROM (
						SELECT ${AGENT_PRODUCT} AS product, ${PAGE} AS page, min(timestamp) AS first_read
						FROM ${Analytics.ai_traffic_spans}
						WHERE ${AGENT_REQUEST} AND path != ''
							AND timestamp >= current_start - INTERVAL 90 DAY AND timestamp < period_end
						GROUP BY product, page
					)
					GROUP BY product
				)
				GROUP BY product
				HAVING visitors + previous_visitors + requests + previous_requests + new_pages > 0
				ORDER BY visitors + requests DESC
				LIMIT {limit:UInt32}
			`,
			params: { ...queryParams(ctx), limit: ctx.limit ?? 20 },
		}),
		timeField: "timestamp",
		customizable: false,
	},
} satisfies Record<string, SimpleQueryConfig>;
