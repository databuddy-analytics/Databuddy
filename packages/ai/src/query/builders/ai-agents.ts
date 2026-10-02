import { AI_AGENTS } from "@databuddy/shared/bot-detection/ai-agents";
import {
	NON_PAGE_PATH,
	UNIDENTIFIED_AGENT_PREFIX,
	UNIDENTIFIED_AGENTS_PRODUCT,
} from "@databuddy/shared/bot-detection/types";
import { AI_APP_BROWSERS } from "@databuddy/shared/bot-detection/user-agent";
import { AI_REFERRERS, AI_UTM_SOURCES } from "@databuddy/shared/utils/referrer";
import { Analytics } from "../../types/tables";
import { appendFilterClause } from "../simple-builder";
import type { CustomSqlContext, SimpleQueryConfig } from "../types";

const AGENT_PRODUCT = `if(startsWith(agent_id, '${UNIDENTIFIED_AGENT_PREFIX}'), '${UNIDENTIFIED_AGENTS_PRODUCT}', transform(agent_id, {agentIds:Array(String)}, {agentProducts:Array(String)}, agent_id))`;
const AGENT_OPERATOR = `if(startsWith(agent_id, '${UNIDENTIFIED_AGENT_PREFIX}'), '', transform(agent_id, {agentIds:Array(String)}, {agentOperators:Array(String)}, ''))`;
const AGENT_NAME = `multiIf(agent_id = '${UNIDENTIFIED_AGENT_PREFIX}mozilla', 'Unnamed browser client', startsWith(agent_id, '${UNIDENTIFIED_AGENT_PREFIX}'), substring(agent_id, ${UNIDENTIFIED_AGENT_PREFIX.length + 1}), transform(agent_id, {agentIds:Array(String)}, {agentNames:Array(String)}, agent_id))`;
const CONTENT_FORMAT = "if(format = '', 'html', format)";

const PAGE =
	"decodeURLComponent(if(trimRight(path(path), '/') = '', '/', trimRight(path(path), '/')))";
const IS_PAGE = `path != '' AND NOT match(${PAGE}, {nonPagePath:String})`;

export function aiVisitProduct(referrerDomain: string): string {
	return `if(has({aiApps:Array(String)}, browser_name), browser_name, transform(${referrerDomain}, {aiDomains:Array(String)}, {aiNames:Array(String)}, transform(lower(utm_source), {aiUtmSources:Array(String)}, {aiUtmNames:Array(String)}, '')))`;
}

export const AI_VISIT_PARAMS = {
	aiApps: AI_APP_BROWSERS,
	aiDomains: AI_REFERRERS.map((referrer) => referrer.domain),
	aiNames: AI_REFERRERS.map((referrer) => referrer.name),
	aiUtmSources: AI_UTM_SOURCES.map((utm) => utm.source),
	aiUtmNames: AI_UTM_SOURCES.map((utm) => utm.name),
};

const VISIT_PRODUCT = aiVisitProduct("domainWithoutWWW(referrer)");

const SERVER_SIDE_SOURCES = "('middleware', 'vercel')";

function firstRequestFrom(source: string): string {
	return `(
		SELECT ifNull(minOrNull(timestamp), toDateTime64('2100-01-01', 3))
		FROM ${Analytics.ai_traffic_spans}
		WHERE client_id = {websiteId:String} AND source = '${source}'
	)`;
}

const VERCEL_START = firstRequestFrom("vercel");
const MIDDLEWARE_START = firstRequestFrom("middleware");
const SERVER_SIDE_START = `least(${VERCEL_START}, ${MIDDLEWARE_START})`;
const SERVER_TRACKING_SINCE = `nullIf(${SERVER_SIDE_START}, toDateTime64('2100-01-01', 3))`;

const AGENT_ROW = `client_id = {websiteId:String}
	AND agent_id != ''
	AND multiIf(
		source = 'vercel', ${MIDDLEWARE_START} <= ${VERCEL_START} OR timestamp < ${MIDDLEWARE_START},
		source = 'middleware', ${VERCEL_START} <= ${MIDDLEWARE_START} OR timestamp < ${VERCEL_START},
		timestamp < ${SERVER_SIDE_START}
	)`;

const IN_RANGE = `timestamp >= toDateTime({startDate:String})
	AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))`;

const AGENT_REQUEST = `${AGENT_ROW}
	AND (status_code = 0 OR status_code BETWEEN 200 AND 299)`;

const AGENT_REQUEST_IN_RANGE = `${AGENT_REQUEST} AND ${IN_RANGE}`;

const AGENT_PURPOSE = `if(startsWith(agent_id, '${UNIDENTIFIED_AGENT_PREFIX}'), agent_purpose, transform(agent_id, {agentIds:Array(String)}, {agentPurposes:Array(String)}, agent_purpose))`;

const EVENT_IN_RANGE = `client_id = {websiteId:String}
	AND time >= toDateTime({startDate:String})
	AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))`;

function timeBucket(ctx: CustomSqlContext, column: string): string {
	const bucket = ctx.granularity === "hour" ? "toStartOfHour" : "toDate";
	return `${bucket}(toTimeZone(${column}, {timezone:String}))`;
}

function queryParams(ctx: CustomSqlContext) {
	return {
		websiteId: ctx.websiteId,
		startDate: ctx.startDate,
		endDate: ctx.endDate,
		timezone: ctx.timezone || "UTC",
		nonPagePath: `(?i)${NON_PAGE_PATH.source}`,
		agentIds: AI_AGENTS.map((agent) => agent.id),
		agentProducts: AI_AGENTS.map((agent) => agent.product),
		agentNames: AI_AGENTS.map((agent) => agent.name),
		agentOperators: AI_AGENTS.map((agent) => agent.operator),
		agentPurposes: AI_AGENTS.map((agent) => agent.purpose),
		inferredPurposeAgentIds: AI_AGENTS.filter(
			(agent) => agent.purposeInferred
		).map((agent) => agent.id),
		...AI_VISIT_PARAMS,
	};
}

export function aiActiveWebsitesQuery(fromDay: string, untilDay: string) {
	return {
		sql: `
			SELECT client_id FROM ${Analytics.ai_traffic_spans}
			WHERE timestamp >= toDate({fromDay:String}) AND timestamp < toDate({untilDay:String}) AND agent_id != ''
			GROUP BY client_id
			UNION DISTINCT
			SELECT client_id FROM ${Analytics.events}
			WHERE time >= toDate({fromDay:String}) AND time < toDate({untilDay:String}) AND ${VISIT_PRODUCT} != ''
			GROUP BY client_id
		`,
		params: { fromDay, untilDay, ...AI_VISIT_PARAMS },
	};
}

export function aiServerTrackingStoppedQuery(
	fromDay: string,
	untilDay: string
) {
	return {
		sql: `
			SELECT client_id FROM ${Analytics.ai_traffic_spans}
			WHERE source IN ${SERVER_SIDE_SOURCES} AND timestamp >= toDate({fromDay:String})
			GROUP BY client_id
			HAVING max(timestamp) < toDate({untilDay:String})
		`,
		params: { fromDay, untilDay },
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
				{
					name: "answer_fetches",
					type: "number",
					label: "Fetched live to answer a user",
				},
				{ name: "visitors", type: "number", label: "Visitors referred" },
				{ name: "last_seen", type: "datetime", label: "Last request" },
				{
					name: "server_tracking_since",
					type: "datetime",
					label: "First server-side request (null when none)",
				},
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
					c.requests, c.pages, c.training, c.search_index, c.on_demand, c.answer_fetches,
					v.visitors, if(c.requests > 0, c.last_seen, NULL) AS last_seen,
					${SERVER_TRACKING_SINCE} AS server_tracking_since,
					(
						SELECT count() > 0
						FROM ${Analytics.ai_traffic_spans}
						WHERE client_id = {websiteId:String} AND source IN ${SERVER_SIDE_SOURCES}
					) AS has_proxy
				FROM (
					SELECT
						${AGENT_PRODUCT} AS product,
						count() AS requests,
						uniqIf(${PAGE}, ${IS_PAGE}) AS pages,
						countIf(${AGENT_PURPOSE} = 'training') AS training,
						countIf(${AGENT_PURPOSE} = 'search_index') AS search_index,
						countIf(${AGENT_PURPOSE} IN ('user_fetch', 'agent')) AS on_demand,
						countIf(${AGENT_PURPOSE} = 'user_fetch') AS answer_fetches,
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
					uniqIf(${PAGE}, ${IS_PAGE}) AS pages,
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
		customSql: (ctx) => ({
			sql: `
				SELECT ${timeBucket(ctx, "time")} AS date, ${VISIT_PRODUCT} AS product, uniq(anonymous_id) AS visitors
				FROM ${Analytics.events}
				WHERE ${EVENT_IN_RANGE}
				GROUP BY date, product
				HAVING product != ''
				ORDER BY date ASC
			`,
			params: queryParams(ctx),
		}),
		timeField: "time",
		customizable: false,
	},

	ai_agent_pages: {
		meta: {
			title: "Pages Read by AI",
			description:
				"What AI crawlers and agents read: one row per page and content format (markdown, llms.txt or HTML, as the agent asked for it), with the request count, last request, and every agent that read it (id, name, product, requests), most requested first. Up to `limit` pages per format (1000 by default). robots.txt, sitemaps, data files and dotfile probes are not pages. Filter by agent_id to list one agent's pages.",
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
		commonFilters: false,
		allowedFilters: ["agent_id", "path"],
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
					WHERE ${AGENT_REQUEST_IN_RANGE} AND ${IS_PAGE} ${appendFilterClause(ctx.filterConditions)}
					GROUP BY page, format, agent_id
				)
				GROUP BY page, format
				ORDER BY requests DESC, page ASC
				LIMIT {limit:UInt32} BY format
			`,
			params: {
				...queryParams(ctx),
				...ctx.filterParams,
				limit: ctx.limit ?? 1000,
			},
		}),
		timeField: "timestamp",
		customizable: false,
	},

	ai_failed_requests: {
		meta: {
			title: "Requests AI Couldn't Read",
			description:
				"AI crawler and agent requests that got an HTTP error (status 400 or above), one row per page and status, with the request count, last request, and the agents that hit it. Only Vercel log drain rows carry a status, so other setups return no rows. llms.txt and markdown pages come first. Filter by agent_id for one agent.",
			category: "AI Agents",
			tags: ["ai", "agents", "crawlers", "errors", "404", "status"],
			output_fields: [
				{ name: "page", type: "string", label: "Page" },
				{ name: "format", type: "string", label: "Format" },
				{ name: "status_code", type: "number", label: "Status" },
				{ name: "requests", type: "number", label: "Requests" },
				{ name: "last_seen", type: "datetime", label: "Last request" },
				{ name: "agents", type: "json", label: "Requested by" },
			],
			default_visualization: "table",
		},
		commonFilters: false,
		allowedFilters: ["agent_id"],
		customSql: (ctx) => ({
			sql: `
				SELECT
					page,
					format,
					status_code,
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
						status_code,
						agent_id,
						${AGENT_NAME} AS name,
						${AGENT_PRODUCT} AS product,
						count() AS agent_requests,
						max(timestamp) AS agent_last_seen
					FROM ${Analytics.ai_traffic_spans}
					WHERE ${AGENT_ROW} AND ${IN_RANGE} AND status_code >= 400 AND path != '' ${appendFilterClause(ctx.filterConditions)}
					GROUP BY page, format, status_code, agent_id
				)
				GROUP BY page, format, status_code
				ORDER BY format = 'html', requests DESC, page ASC
				LIMIT {limit:UInt32}
			`,
			params: {
				...queryParams(ctx),
				...ctx.filterParams,
				limit: ctx.limit ?? 100,
			},
		}),
		timeField: "timestamp",
		customizable: false,
	},

	ai_recent_requests: {
		meta: {
			title: "Latest AI Requests",
			description:
				"The most recent individual requests from AI crawlers and agents, newest first: time, agent (id, name, product), page, content format, HTTP status (Vercel log drain rows only, 0 elsewhere) and source. Filter by agent_id for one agent.",
			category: "AI Agents",
			tags: ["ai", "agents", "crawlers", "log", "recent", "requests"],
			output_fields: [
				{ name: "time", type: "datetime", label: "Time" },
				{ name: "agent_id", type: "string", label: "Agent ID" },
				{ name: "name", type: "string", label: "Agent" },
				{ name: "product", type: "string", label: "Product" },
				{ name: "page", type: "string", label: "Page" },
				{ name: "format", type: "string", label: "Format" },
				{ name: "status_code", type: "number", label: "Status" },
				{ name: "source", type: "string", label: "Source" },
			],
			default_visualization: "table",
		},
		commonFilters: false,
		allowedFilters: ["agent_id"],
		customSql: (ctx) => ({
			sql: `
				SELECT
					timestamp AS time,
					agent_id,
					${AGENT_NAME} AS name,
					${AGENT_PRODUCT} AS product,
					${PAGE} AS page,
					${CONTENT_FORMAT} AS format,
					status_code,
					source
				FROM ${Analytics.ai_traffic_spans}
				WHERE ${AGENT_ROW} AND ${IN_RANGE} AND path != '' ${appendFilterClause(ctx.filterConditions)}
				ORDER BY timestamp DESC
				LIMIT {limit:UInt32}
			`,
			params: {
				...queryParams(ctx),
				...ctx.filterParams,
				limit: ctx.limit ?? 50,
			},
		}),
		timeField: "timestamp",
		customizable: false,
	},

	ai_landing_pages: {
		meta: {
			title: "Pages AI Sends Visitors To",
			description:
				"The page each AI-referred visit started on: every visit from an AI product (referrals and AI app browsers such as Claude or Cursor) is credited once, to the first page it viewed with an AI referrer. Each page carries its pageviews from all visitors and, per AI product that sent visitors, its visitors and how many times its crawlers and agents read that page in the same period.",
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
		commonFilters: false,
		allowedFilters: ["path"],
		customSql: (ctx) => ({
			sql: `
				SELECT
					l.page AS page,
					uniqMerge(l.visitor_state) AS visitors,
					any(v.views) AS pageviews,
					arrayReverseSort(
						sender -> sender.visitors,
						groupArray(CAST(
							(l.product, finalizeAggregation(l.visitor_state), r.reads),
							'Tuple(product String, visitors UInt64, reads UInt64)'
						))
					) AS senders
				FROM (
					SELECT page, product, uniqState(anonymous_id) AS visitor_state
					FROM (
						SELECT landing.1 AS page, landing.2 AS product, landing.3 AS anonymous_id, landing.4 AS path
						FROM (
							SELECT argMin((page, visit_product, anonymous_id, path), time) AS landing
							FROM (
								SELECT session_id, time, anonymous_id, path, ${PAGE} AS page, ${VISIT_PRODUCT} AS visit_product
								FROM ${Analytics.events}
								WHERE ${EVENT_IN_RANGE} AND path != '' AND event_name = 'screen_view'
							)
							WHERE visit_product != ''
							GROUP BY session_id
						)
					)
					WHERE page != '' ${appendFilterClause(ctx.filterConditions)}
					GROUP BY page, product
				) AS l
				LEFT JOIN (
					SELECT ${PAGE} AS page, count() AS views
					FROM ${Analytics.events}
					WHERE ${EVENT_IN_RANGE} AND path != '' AND event_name = 'screen_view'
					GROUP BY page
				) AS v ON l.page = v.page
				LEFT JOIN (
					SELECT ${PAGE} AS page, ${AGENT_PRODUCT} AS product, count() AS reads
					FROM ${Analytics.ai_traffic_spans}
					WHERE ${AGENT_REQUEST_IN_RANGE} AND path != ''
					GROUP BY page, product
				) AS r ON l.page = r.page AND l.product = r.product
				GROUP BY page
				ORDER BY visitors DESC, pageviews DESC
				LIMIT {limit:UInt32}
			`,
			params: {
				...queryParams(ctx),
				...ctx.filterParams,
				limit: ctx.limit ?? 100,
			},
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
					if(
						grouping(ai_product) = 1 AND grouping(is_ai) = 1,
						uniqArray(session_visitors),
						uniqArray(ai_visitors)
					) AS visitors,
					round(avg(pageviews), 2) AS pages_per_visit,
					round(countIf(pageviews > 1) / count() * 100, 1) AS engaged_rate
				FROM (
					SELECT
						session_id,
						groupUniqArray(anonymous_id) AS session_visitors,
						groupUniqArrayIf(anonymous_id, visit_product != '') AS ai_visitors,
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
				HAVING multiIf(grouping(ai_product) = 0, ai_product != '', grouping(is_ai) = 0, is_ai, 1)
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
				"Each AI crawler or agent that requested your pages, with its product, the company operating it (empty for unidentified agents), purpose, request count, distinct pages read (in total and per content format), how many of those requests asked for markdown or llms.txt, last request, and a sample user agent for checking robots.txt rules.",
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
				{
					name: "purpose_inferred",
					type: "boolean",
					label: "Purpose inferred, not stated by the operator",
				},
				{ name: "requests", type: "number", label: "Requests" },
				{ name: "pages", type: "number", label: "Pages read" },
				{ name: "html_pages", type: "number", label: "HTML pages read" },
				{
					name: "markdown_pages",
					type: "number",
					label: "Markdown pages read",
				},
				{ name: "llms_pages", type: "number", label: "llms.txt pages read" },
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
					${AGENT_PRODUCT} AS product,
					${AGENT_OPERATOR} AS operator,
					any(${AGENT_PURPOSE}) AS purpose,
					has({inferredPurposeAgentIds:Array(String)}, agent_id) AS purpose_inferred,
					count() AS requests,
					uniqIf(${PAGE}, ${IS_PAGE}) AS pages,
					uniqIf(${PAGE}, ${IS_PAGE} AND ${CONTENT_FORMAT} = 'html') AS html_pages,
					uniqIf(${PAGE}, ${IS_PAGE} AND ${CONTENT_FORMAT} = 'markdown') AS markdown_pages,
					uniqIf(${PAGE}, ${IS_PAGE} AND ${CONTENT_FORMAT} = 'llms') AS llms_pages,
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
		customSql: (ctx) => ({
			sql: `
				SELECT
					${timeBucket(ctx, "timestamp")} AS date,
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
		}),
		timeField: "timestamp",
		customizable: false,
	},

	ai_weekly_digest: {
		meta: {
			title: "AI Activity Digest",
			description:
				"Per AI product, visitors sent and requests made in the selected period and the equally long period before it, plus the pages it read in the selected period that it had not read in the 90 days before. new_pages and site_new_pages are NULL when the site has less than 90 days of comparable history before the period, counted from its first server-side request, or from its first event when the period ends before any server-side request. Every row also carries site-wide totals that count each visitor and page once (site_visitors, site_previous_visitors, site_new_pages); use those for whole-site numbers instead of summing the per-product columns. site_has_server_tracking says whether the site sent server-side requests (@databuddy/sdk/agents or a Vercel log drain) in the selected period; without them, crawlers that don't run JavaScript are missing from that period's request counts.",
			category: "AI Agents",
			tags: ["ai", "digest", "summary", "week-over-week"],
			output_fields: [
				{ name: "product", type: "string", label: "Product" },
				{
					name: "purpose",
					type: "string",
					label: "Main crawler purpose (empty when it only sent visitors)",
				},
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
					label:
						"Pages not read in the previous 90 days (null with less than 90 days of history)",
				},
				{ name: "site_visitors", type: "number", label: "Site AI visitors" },
				{
					name: "site_previous_visitors",
					type: "number",
					label: "Site AI visitors, previous period",
				},
				{
					name: "site_new_pages",
					type: "number",
					label:
						"Site pages not read in the previous 90 days (null with less than 90 days of history)",
				},
				{
					name: "site_has_server_tracking",
					type: "boolean",
					label: "Site sent server-side requests in the period",
				},
				{
					name: "site_server_tracking_since",
					type: "datetime",
					label: "First server-side request (null when none)",
				},
			],
			default_visualization: "table",
		},
		customSql: (ctx) => ({
			sql: `
				WITH
					toDateTime({startDate:String}) AS current_start,
					toDateTime(concat({endDate:String}, ' 23:59:59')) + 1 AS period_end,
					current_start - toIntervalDay(dateDiff('day', current_start, period_end)) AS previous_start,
					current_start - INTERVAL 90 DAY AS history_start,
					${SERVER_SIDE_START} AS server_side_start,
					if(
						server_side_start < period_end,
						server_side_start > history_start,
						(
							SELECT count() = 0
							FROM (
								SELECT 1
								FROM ${Analytics.events}
								WHERE client_id = {websiteId:String} AND time <= history_start
								LIMIT 1
								SETTINGS max_threads = 1
							)
						)
					) AS has_short_history,
					(
						SELECT (uniqIf(anonymous_id, time >= current_start), uniqIf(anonymous_id, time < current_start))
						FROM ${Analytics.events}
						WHERE client_id = {websiteId:String}
							AND time >= previous_start AND time < period_end
							AND ${VISIT_PRODUCT} != ''
					) AS site_visitor_counts,
					if(
						has_short_history,
						NULL,
						(
							SELECT countIf(first_read >= current_start)
							FROM (
								SELECT ${PAGE} AS page, min(timestamp) AS first_read
								FROM ${Analytics.ai_traffic_spans}
								WHERE ${AGENT_REQUEST} AND ${IS_PAGE}
									AND timestamp >= history_start AND timestamp < period_end
								GROUP BY page
							)
						)
					) AS site_new_pages,
					(
						SELECT count() > 0
						FROM ${Analytics.ai_traffic_spans}
						WHERE client_id = {websiteId:String} AND source IN ${SERVER_SIDE_SOURCES}
							AND timestamp >= current_start AND timestamp < period_end
					) AS site_has_server_tracking
				SELECT
					product,
					max(main_purpose) AS purpose,
					sum(visitors_now) AS visitors,
					sum(visitors_before) AS previous_visitors,
					sum(requests_now) AS requests,
					sum(requests_before) AS previous_requests,
					if(has_short_history, NULL, sum(pages_new)) AS new_pages,
					site_visitor_counts.1 AS site_visitors,
					site_visitor_counts.2 AS site_previous_visitors,
					site_new_pages,
					site_has_server_tracking,
					${SERVER_TRACKING_SINCE} AS site_server_tracking_since
				FROM (
					SELECT
						${AGENT_PRODUCT} AS product,
						toString(topKIf(4)(${AGENT_PURPOSE}, timestamp >= current_start AND agent_purpose != '')[1]) AS main_purpose,
						0 AS visitors_now,
						0 AS visitors_before,
						countIf(timestamp >= current_start) AS requests_now,
						countIf(timestamp < current_start) AS requests_before,
						0 AS pages_new
					FROM ${Analytics.ai_traffic_spans}
					WHERE ${AGENT_REQUEST}
						AND timestamp >= previous_start AND timestamp < period_end
					GROUP BY product
					UNION ALL
					SELECT ${VISIT_PRODUCT} AS product, '', uniqIf(anonymous_id, time >= current_start), uniqIf(anonymous_id, time < current_start), 0, 0, 0
					FROM ${Analytics.events}
					WHERE client_id = {websiteId:String}
						AND time >= previous_start AND time < period_end
					GROUP BY product
					HAVING product != ''
					UNION ALL
					SELECT product, '', 0, 0, 0, 0, countIf(first_read >= current_start)
					FROM (
						SELECT ${AGENT_PRODUCT} AS product, ${PAGE} AS page, min(timestamp) AS first_read
						FROM ${Analytics.ai_traffic_spans}
						WHERE ${AGENT_REQUEST} AND ${IS_PAGE}
							AND timestamp >= history_start AND timestamp < period_end
						GROUP BY product, page
					)
					GROUP BY product
				)
				GROUP BY product
				HAVING visitors + previous_visitors + requests + previous_requests + ifNull(new_pages, 0) > 0
				ORDER BY visitors + requests DESC
				LIMIT {limit:UInt32}
			`,
			params: { ...queryParams(ctx), limit: ctx.limit ?? 20 },
		}),
		timeField: "timestamp",
		customizable: false,
	},
} satisfies Record<string, SimpleQueryConfig>;
