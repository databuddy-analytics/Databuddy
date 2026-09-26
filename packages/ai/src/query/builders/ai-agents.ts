import { AI_AGENTS } from "@databuddy/shared/bot-detection/ai-agents";
import { AI_REFERRERS } from "@databuddy/shared/utils/referrer";
import { Analytics } from "../../types/tables";
import type { CustomSqlContext, SimpleQueryConfig } from "../types";

const AGENT_PRODUCT =
	"transform(agent_id, {agentIds:Array(String)}, {agentProducts:Array(String)}, bot_name)";
const REFERRER_PRODUCT =
	"transform(domainWithoutWWW(referrer), {aiDomains:Array(String)}, {aiNames:Array(String)}, transform(utm_source, {aiDomains:Array(String)}, {aiNames:Array(String)}, ''))";
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
				"AI products (ChatGPT, Claude, Perplexity, Gemini, Meta AI and others) with the requests their crawlers and agents made, pages they read, purpose split, and visitors they referred.",
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
					SELECT ${REFERRER_PRODUCT} AS product, uniq(session_id) AS visitors
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

	ai_agent_time_series: {
		meta: {
			title: "AI Agent Requests Over Time",
			description:
				"Requests from AI crawlers and agents per day (or hour), per AI product.",
			category: "AI Agents",
			tags: ["ai", "agents", "crawlers", "time-series"],
			output_fields: [
				{ name: "date", type: "string", label: "Date" },
				{ name: "product", type: "string", label: "Product" },
				{ name: "requests", type: "number", label: "Requests" },
			],
			default_visualization: "timeseries",
			supports_granularity: ["hour", "day"],
		},
		customSql: (ctx) => {
			const bucket =
				ctx.granularity === "hour"
					? "toStartOfHour(timestamp)"
					: "toDate(timestamp)";
			return {
				sql: `
					SELECT ${bucket} AS date, ${AGENT_PRODUCT} AS product, count() AS requests
					FROM ${Analytics.ai_traffic_spans}
					WHERE ${SPAN_RANGE}
					GROUP BY date, product
					ORDER BY date ASC
				`,
				params: productParams(ctx),
			};
		},
		timeField: "timestamp",
		customizable: false,
	},

	ai_agent_pages: {
		meta: {
			title: "Pages Read by AI Agents",
			description:
				"Pages ranked by AI agent requests, with the AI products reading each page, next to human pageviews and AI-referred visitors for the same page.",
			category: "AI Agents",
			tags: ["ai", "agents", "crawlers", "pages"],
			output_fields: [
				{ name: "page", type: "string", label: "Page" },
				{ name: "requests", type: "number", label: "AI requests" },
				{ name: "products", type: "json", label: "Read by" },
				{ name: "pageviews", type: "number", label: "Human pageviews" },
				{ name: "visitors", type: "number", label: "AI-referred visitors" },
			],
			default_visualization: "table",
		},
		customSql: (ctx) => ({
			sql: `
				SELECT a.page AS page, a.requests, a.products, h.pageviews, h.visitors
				FROM (
					SELECT
						${pageOf("path")} AS page,
						count() AS requests,
						topK(3)(${AGENT_PRODUCT}) AS products
					FROM ${Analytics.ai_traffic_spans}
					WHERE ${SPAN_RANGE} AND path != ''
					GROUP BY page
					ORDER BY requests DESC
					LIMIT {limit:UInt32}
				) AS a
				LEFT JOIN (
					SELECT
						${pageOf("path")} AS page,
						countIf(event_name = 'screen_view') AS pageviews,
						uniqIf(session_id, ${REFERRER_PRODUCT} != '') AS visitors
					FROM ${Analytics.events}
					WHERE ${EVENT_RANGE} AND path != ''
					GROUP BY page
				) AS h ON a.page = h.page
				ORDER BY a.requests DESC
			`,
			params: { ...productParams(ctx), limit: ctx.limit ?? 100 },
		}),
		timeField: "timestamp",
		customizable: false,
	},
};
