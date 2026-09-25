import { AI_REFERRER_DOMAINS } from "@databuddy/shared/utils/referrer";
import { Analytics } from "../../types/tables";
import type { CustomSqlContext, SimpleQueryConfig } from "../types";

const WWW_PREFIX = /^www\./;
const AI_DOMAINS = [
	...new Set(
		AI_REFERRER_DOMAINS.map((domain) => domain.replace(WWW_PREFIX, ""))
	),
];

const VERIFIED = "verification IN ('ip_verified', 'rdns_verified')";
const SPOOFED = "verification = 'spoofed'";
const AGENT_KEY = "if(agent_id != '', agent_id, bot_name)";
const AI_REFERRED =
	"(domainWithoutWWW(referrer) IN {aiDomains:Array(String)} OR utm_source IN {aiDomains:Array(String)})";

function pageOf(column: string): string {
	return `decodeURLComponent(if(trimRight(path(${column}), '/') = '', '/', trimRight(path(${column}), '/')))`;
}

const SPAN_RANGE = `client_id = {websiteId:String}
	AND timestamp >= toDateTime({startDate:String})
	AND timestamp <= toDateTime(concat({endDate:String}, ' 23:59:59'))`;

const EVENT_RANGE = `client_id = {websiteId:String}
	AND time >= toDateTime({startDate:String})
	AND time <= toDateTime(concat({endDate:String}, ' 23:59:59'))`;

function rangeParams(ctx: CustomSqlContext) {
	return {
		websiteId: ctx.websiteId,
		startDate: ctx.startDate,
		endDate: ctx.endDate,
		aiDomains: AI_DOMAINS,
	};
}

export const AiAgentsBuilders: Record<string, SimpleQueryConfig> = {
	ai_agent_summary: {
		meta: {
			title: "AI Agent Summary",
			description:
				"AI agent and crawler hits with verified and spoofed counts, distinct agents and pages, plus sessions referred by AI assistants.",
			category: "AI Agents",
			tags: ["ai", "agents", "crawlers", "bots", "summary"],
			output_fields: [
				{ name: "hits", type: "number", label: "Agent hits" },
				{ name: "verified_hits", type: "number", label: "Verified hits" },
				{ name: "spoofed_hits", type: "number", label: "Spoofed hits" },
				{ name: "agents", type: "number", label: "Agents" },
				{ name: "pages", type: "number", label: "Pages" },
				{ name: "ai_sessions", type: "number", label: "AI-referred sessions" },
				{ name: "sessions", type: "number", label: "Sessions" },
			],
		},
		customSql: (ctx) => ({
			sql: `
				SELECT
					s.hits, s.verified_hits, s.spoofed_hits, s.agents, s.pages,
					v.ai_sessions, v.sessions
				FROM (
					SELECT
						count() AS hits,
						countIf(${VERIFIED}) AS verified_hits,
						countIf(${SPOOFED}) AS spoofed_hits,
						uniq(${AGENT_KEY}) AS agents,
						uniq(${pageOf("path")}) AS pages
					FROM ${Analytics.ai_traffic_spans}
					WHERE ${SPAN_RANGE}
				) AS s
				CROSS JOIN (
					SELECT
						uniqIf(session_id, ${AI_REFERRED}) AS ai_sessions,
						uniq(session_id) AS sessions
					FROM ${Analytics.events}
					WHERE ${EVENT_RANGE}
				) AS v
			`,
			params: rangeParams(ctx),
		}),
		timeField: "timestamp",
		customizable: false,
	},

	ai_agent_time_series: {
		meta: {
			title: "AI Agent Hits Over Time",
			description:
				"AI agent and crawler hits per day (or hour), split into verified and spoofed.",
			category: "AI Agents",
			tags: ["ai", "agents", "crawlers", "time-series"],
			output_fields: [
				{ name: "date", type: "string", label: "Date" },
				{ name: "hits", type: "number", label: "Agent hits" },
				{ name: "verified_hits", type: "number", label: "Verified hits" },
				{ name: "spoofed_hits", type: "number", label: "Spoofed hits" },
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
					SELECT
						${bucket} AS date,
						count() AS hits,
						countIf(${VERIFIED}) AS verified_hits,
						countIf(${SPOOFED}) AS spoofed_hits
					FROM ${Analytics.ai_traffic_spans}
					WHERE ${SPAN_RANGE}
					GROUP BY date
					ORDER BY date ASC
				`,
				params: rangeParams(ctx),
			};
		},
		timeField: "timestamp",
		customizable: false,
	},

	ai_agent_pages: {
		meta: {
			title: "Pages Read by AI Agents",
			description:
				"Pages ranked by AI agent hits, split by purpose (training, search index, on-demand fetches and agents), next to human pageviews and AI-referred sessions for the same page.",
			category: "AI Agents",
			tags: ["ai", "agents", "crawlers", "pages"],
			output_fields: [
				{ name: "page", type: "string", label: "Page" },
				{ name: "hits", type: "number", label: "Agent hits" },
				{ name: "training", type: "number", label: "Training" },
				{ name: "search_index", type: "number", label: "Search index" },
				{ name: "on_demand", type: "number", label: "On demand" },
				{ name: "verified_hits", type: "number", label: "Verified hits" },
				{ name: "agents", type: "number", label: "Agents" },
				{ name: "pageviews", type: "number", label: "Human pageviews" },
				{ name: "ai_sessions", type: "number", label: "AI-referred sessions" },
			],
			default_visualization: "table",
		},
		customSql: (ctx) => ({
			sql: `
				SELECT
					a.page AS page, a.hits, a.training, a.search_index, a.on_demand,
					a.verified_hits, a.agents,
					h.pageviews, h.ai_sessions
				FROM (
					SELECT
						${pageOf("path")} AS page,
						count() AS hits,
						countIf(agent_purpose = 'training') AS training,
						countIf(agent_purpose = 'search_index') AS search_index,
						countIf(agent_purpose IN ('user_fetch', 'agent')) AS on_demand,
						countIf(${VERIFIED}) AS verified_hits,
						uniq(${AGENT_KEY}) AS agents
					FROM ${Analytics.ai_traffic_spans}
					WHERE ${SPAN_RANGE} AND path != ''
					GROUP BY page
					ORDER BY hits DESC
					LIMIT {limit:UInt32}
				) AS a
				LEFT JOIN (
					SELECT
						${pageOf("path")} AS page,
						countIf(event_name = 'screen_view') AS pageviews,
						uniqIf(session_id, ${AI_REFERRED}) AS ai_sessions
					FROM ${Analytics.events}
					WHERE ${EVENT_RANGE} AND path != ''
					GROUP BY page
				) AS h ON a.page = h.page
				ORDER BY a.hits DESC
			`,
			params: { ...rangeParams(ctx), limit: ctx.limit ?? 100 },
		}),
		timeField: "timestamp",
		customizable: false,
	},

	ai_agents: {
		meta: {
			title: "AI Agents",
			description:
				"AI agents and crawlers that visited, with purpose, hits, verified and spoofed counts, distinct pages and last seen time.",
			category: "AI Agents",
			tags: ["ai", "agents", "crawlers", "bots", "verification"],
			output_fields: [
				{ name: "agent", type: "string", label: "Agent id" },
				{ name: "name", type: "string", label: "Agent" },
				{ name: "purpose", type: "string", label: "Purpose" },
				{ name: "hits", type: "number", label: "Hits" },
				{ name: "verified_hits", type: "number", label: "Verified hits" },
				{ name: "spoofed_hits", type: "number", label: "Spoofed hits" },
				{ name: "pages", type: "number", label: "Pages" },
				{ name: "last_seen", type: "datetime", label: "Last seen" },
			],
			default_visualization: "table",
		},
		customSql: (ctx) => ({
			sql: `
				SELECT
					${AGENT_KEY} AS agent,
					any(bot_name) AS name,
					anyIf(agent_purpose, agent_purpose != '') AS purpose,
					count() AS hits,
					countIf(${VERIFIED}) AS verified_hits,
					countIf(${SPOOFED}) AS spoofed_hits,
					uniq(${pageOf("path")}) AS pages,
					max(timestamp) AS last_seen
				FROM ${Analytics.ai_traffic_spans}
				WHERE ${SPAN_RANGE}
				GROUP BY agent
				ORDER BY hits DESC
				LIMIT {limit:UInt32}
			`,
			params: { ...rangeParams(ctx), limit: ctx.limit ?? 100 },
		}),
		timeField: "timestamp",
		customizable: false,
	},
};
