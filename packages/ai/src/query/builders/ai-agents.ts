import { AI_AGENTS } from "@databuddy/shared/bot-detection/ai-agents";
import { AI_APP_BROWSERS } from "@databuddy/shared/bot-detection/user-agent";
import { AI_REFERRERS } from "@databuddy/shared/utils/referrer";
import { Analytics } from "../../types/tables";
import type { CustomSqlContext, SimpleQueryConfig } from "../types";

const AGENT_PRODUCT =
	"transform(agent_id, {agentIds:Array(String)}, {agentProducts:Array(String)}, bot_name)";
export function aiVisitProduct(referrerDomain: string): string {
	return `if(has({aiApps:Array(String)}, browser_name), browser_name, transform(${referrerDomain}, {aiDomains:Array(String)}, {aiNames:Array(String)}, transform(utm_source, {aiDomains:Array(String)}, {aiNames:Array(String)}, '')))`;
}

export const AI_VISIT_PARAMS = {
	aiApps: AI_APP_BROWSERS,
	aiDomains: AI_REFERRERS.map((referrer) => referrer.domain),
	aiNames: AI_REFERRERS.map((referrer) => referrer.name),
};

const VISIT_PRODUCT = aiVisitProduct("domainWithoutWWW(referrer)");
const CONTENT_FORMAT = `if(format != '', format, multiIf(
	endsWith(lower(path(path)), 'llms.txt') OR endsWith(lower(path(path)), 'llms-full.txt'), 'llms',
	endsWith(lower(path(path)), '.md') OR endsWith(lower(path(path)), '.mdx'), 'markdown',
	'html'))`;
const PURPOSE_COUNTS = `countIf(agent_purpose = 'training') AS training,
	countIf(agent_purpose = 'search_index') AS search_index,
	countIf(agent_purpose IN ('user_fetch', 'agent')) AS on_demand`;

function pageOf(column: string): string {
	return `decodeURLComponent(if(trimRight(path(${column}), '/') = '', '/', trimRight(path(${column}), '/')))`;
}

const SPAN_RANGE = `client_id = {websiteId:String}
	AND agent_id != ''
	AND timestamp >= toDateTime({startDate:String})
	AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))`;

const EVENT_RANGE = `client_id = {websiteId:String}
	AND time >= toDateTime({startDate:String})
	AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))`;

function productParams(ctx: CustomSqlContext) {
	return {
		websiteId: ctx.websiteId,
		startDate: ctx.startDate,
		endDate: ctx.endDate,
		agentIds: AI_AGENTS.map((agent) => agent.id),
		agentProducts: AI_AGENTS.map((agent) => agent.product),
		agentNames: AI_AGENTS.map((agent) => agent.name),
		...AI_VISIT_PARAMS,
	};
}

export const AiAgentsBuilders: Record<string, SimpleQueryConfig> = {
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
			],
			default_visualization: "table",
		},
		customSql: (ctx) => ({
			sql: `
				SELECT
					if(c.product != '', c.product, v.product) AS product,
					c.requests, c.pages, c.training, c.search_index, c.on_demand,
					v.visitors, c.last_seen
				FROM (
					SELECT
						${AGENT_PRODUCT} AS product,
						count() AS requests,
						uniq(${pageOf("path")}) AS pages,
						${PURPOSE_COUNTS},
						max(timestamp) AS last_seen
					FROM ${Analytics.ai_traffic_spans}
					WHERE ${SPAN_RANGE}
					GROUP BY product
				) AS c
				FULL OUTER JOIN (
					SELECT ${VISIT_PRODUCT} AS product, uniq(session_id) AS visitors
					FROM ${Analytics.events}
					WHERE ${EVENT_RANGE}
					GROUP BY product
					HAVING product != ''
				) AS v ON c.product = v.product
				ORDER BY c.requests + v.visitors DESC
				LIMIT {limit:UInt32}
			`,
			params: { ...productParams(ctx), limit: ctx.limit ?? 50 },
		}),
		timeField: "timestamp",
		customizable: false,
	},

	ai_content_formats: {
		meta: {
			title: "How AI Reads Your Content",
			description:
				"AI requests split by the content format served: markdown (.md pages or markdown requested through the Accept header), llms.txt files, and HTML pages, with pages and the AI products fetching each format.",
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
					uniq(${pageOf("path")}) AS pages,
					topK(4)(${AGENT_PRODUCT}) AS products
				FROM ${Analytics.ai_traffic_spans}
				WHERE ${SPAN_RANGE}
				GROUP BY format
				ORDER BY requests DESC
			`,
			params: productParams(ctx),
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
				ctx.granularity === "hour" ? "toStartOfHour(time)" : "toDate(time)";
			return {
				sql: `
					SELECT ${bucket} AS date, ${VISIT_PRODUCT} AS product, uniq(session_id) AS visitors
					FROM ${Analytics.events}
					WHERE ${EVENT_RANGE}
					GROUP BY date, product
					HAVING product != ''
					ORDER BY date ASC
				`,
				params: productParams(ctx),
			};
		},
		timeField: "time",
		customizable: false,
	},

	ai_agent_pages: {
		meta: {
			title: "Pages Read by or Visited from AI",
			description:
				"Pages AI products send visitors to or read, ranked by AI-referred visitors then AI requests, with the products reading each page and its human pageviews.",
			category: "AI Agents",
			tags: ["ai", "agents", "crawlers", "pages", "referrals"],
			output_fields: [
				{ name: "page", type: "string", label: "Page" },
				{ name: "visitors", type: "number", label: "AI-referred visitors" },
				{ name: "products", type: "json", label: "Read by" },
				{ name: "requests", type: "number", label: "AI requests" },
				{ name: "format", type: "string", label: "Format" },
				{ name: "pageviews", type: "number", label: "Human pageviews" },
			],
			default_visualization: "table",
		},
		customSql: (ctx) => ({
			sql: `
				SELECT
					if(a.page != '', a.page, h.page) AS page,
					h.visitors, a.products, a.requests, a.format, h.pageviews
				FROM (
					SELECT
						${pageOf("path")} AS page,
						count() AS requests,
						topK(3)(${AGENT_PRODUCT}) AS products,
						topK(1)(${CONTENT_FORMAT})[1] AS format
					FROM ${Analytics.ai_traffic_spans}
					WHERE ${SPAN_RANGE} AND path != ''
					GROUP BY page
				) AS a
				FULL OUTER JOIN (
					SELECT
						${pageOf("path")} AS page,
						countIf(event_name = 'screen_view') AS pageviews,
						uniqIf(session_id, ${VISIT_PRODUCT} != '') AS visitors
					FROM ${Analytics.events}
					WHERE ${EVENT_RANGE} AND path != ''
					GROUP BY page
				) AS h ON a.page = h.page
				WHERE a.requests > 0 OR h.visitors > 0
				ORDER BY h.visitors DESC, a.requests DESC
				LIMIT {limit:UInt32}
			`,
			params: { ...productParams(ctx), limit: ctx.limit ?? 100 },
		}),
		timeField: "timestamp",
		customizable: false,
	},

	ai_visitor_outcomes: {
		meta: {
			title: "What AI Visitors Do",
			description:
				"Visitors each AI product sent, how many pages they viewed per visit, and the share that viewed two or more pages, next to the same numbers for all visitors.",
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
					if(grouping(ai_product) = 1, 'All visitors', ai_product) AS product,
					count() AS visitors,
					round(avg(pageviews), 2) AS pages_per_visit,
					round(countIf(pageviews > 1) / count() * 100, 1) AS engaged_rate
				FROM (
					SELECT
						session_id,
						anyIf(visit_product, visit_product != '') AS ai_product,
						countIf(event_name = 'screen_view') AS pageviews
					FROM (
						SELECT session_id, event_name, ${VISIT_PRODUCT} AS visit_product
						FROM ${Analytics.events}
						WHERE ${EVENT_RANGE}
					)
					GROUP BY session_id
				)
				GROUP BY GROUPING SETS ((ai_product), ())
				HAVING ai_product != '' OR grouping(ai_product) = 1
				ORDER BY grouping(ai_product) DESC, visitors DESC
				LIMIT {limit:UInt32}
			`,
			params: { ...productParams(ctx), limit: ctx.limit ?? 20 },
		}),
		timeField: "time",
		customizable: false,
	},

	ai_crawlers: {
		meta: {
			title: "AI Crawlers",
			description:
				"Each AI crawler or agent that requested your pages, with its product, purpose, request count, last request, and a sample user agent for checking robots.txt rules.",
			category: "AI Agents",
			tags: ["ai", "crawlers", "robots.txt", "bots"],
			output_fields: [
				{ name: "agent_id", type: "string", label: "Agent" },
				{ name: "name", type: "string", label: "Crawler" },
				{ name: "product", type: "string", label: "Product" },
				{ name: "purpose", type: "string", label: "Purpose" },
				{ name: "requests", type: "number", label: "Requests" },
				{ name: "last_seen", type: "datetime", label: "Last request" },
				{ name: "user_agent", type: "string", label: "User agent" },
			],
			default_visualization: "table",
		},
		customSql: (ctx) => ({
			sql: `
				SELECT
					agent_id,
					transform(agent_id, {agentIds:Array(String)}, {agentNames:Array(String)}, agent_id) AS name,
					any(${AGENT_PRODUCT}) AS product,
					any(agent_purpose) AS purpose,
					count() AS requests,
					max(timestamp) AS last_seen,
					any(user_agent) AS user_agent
				FROM ${Analytics.ai_traffic_spans}
				WHERE ${SPAN_RANGE}
				GROUP BY agent_id
				ORDER BY requests DESC
				LIMIT {limit:UInt32}
			`,
			params: { ...productParams(ctx), limit: ctx.limit ?? 50 },
		}),
		timeField: "timestamp",
		customizable: false,
	},
};
