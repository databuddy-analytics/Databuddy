import { AI_AGENTS } from "@databuddy/shared/bot-detection/ai-agents";
import { AI_REFERRERS } from "@databuddy/shared/utils/referrer";
import { Analytics } from "../../types/tables";
import type { CustomSqlContext, SimpleQueryConfig } from "../types";

const AGENT_PRODUCT =
	"transform(agent_id, {agentIds:Array(String)}, {agentProducts:Array(String)}, bot_name)";
const VISIT_PRODUCT =
	"if(browser_name IN ('Claude', 'Cursor'), browser_name, transform(domainWithoutWWW(referrer), {aiDomains:Array(String)}, {aiNames:Array(String)}, transform(utm_source, {aiDomains:Array(String)}, {aiNames:Array(String)}, '')))";
const PURPOSE_COUNTS = `countIf(agent_purpose = 'training') AS training,
	countIf(agent_purpose = 'search_index') AS search_index,
	countIf(agent_purpose IN ('user_fetch', 'agent')) AS on_demand`;

function pageOf(column: string): string {
	return `decodeURLComponent(if(trimRight(path(${column}), '/') = '', '/', trimRight(path(${column}), '/')))`;
}

const SPAN_RANGE = `client_id = {websiteId:String}
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
		aiDomains: AI_REFERRERS.map((referrer) => referrer.domain),
		aiNames: AI_REFERRERS.map((referrer) => referrer.name),
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
				{ name: "pageviews", type: "number", label: "Human pageviews" },
			],
			default_visualization: "table",
		},
		customSql: (ctx) => ({
			sql: `
				SELECT
					if(a.page != '', a.page, h.page) AS page,
					h.visitors, a.products, a.requests, h.pageviews
				FROM (
					SELECT
						${pageOf("path")} AS page,
						count() AS requests,
						topK(3)(${AGENT_PRODUCT}) AS products
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
};
