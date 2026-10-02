import { Analytics } from "../../types/tables";
import { appendFilterClause } from "../simple-builder";
import type { CustomSqlContext, SimpleQueryConfig } from "../types";

const START = "toDateTime({startDate:String})";
const END = "toDateTime(concat({endDate:String}, ' 23:59:59'))";

function scope(ctx: CustomSqlContext): string {
	return ctx.filterParams?.__orgLevel
		? "owner_id = {projectId:String}"
		: "website_id = {projectId:String}";
}

function inRange(ctx: CustomSqlContext): string {
	return `${scope(ctx)}
		AND timestamp >= ${START}
		AND timestamp <= ${END}
		${appendFilterClause(ctx.filterConditions)}`;
}

function params(ctx: CustomSqlContext) {
	return {
		projectId: ctx.websiteId,
		startDate: ctx.startDate,
		endDate: ctx.endDate,
		timezone: ctx.timezone || "UTC",
		limit: ctx.limit ?? 100,
		...ctx.filterParams,
	};
}

const common = {
	commonFilters: false,
	allowedFilters: [
		"client",
		"tool",
		"server_name",
		"environment",
		"website_id",
	],
	timeField: "timestamp",
	customizable: false,
} satisfies Partial<SimpleQueryConfig>;

const meta = (title: string, description: string) => ({
	title,
	description: `${description} Covers MCP servers tracked with @databuddy/sdk/mcp. An organization-scoped query covers all of the organization's calls; a website-scoped query only sees calls linked to that website, so calls from servers without a website ID are left out of it. Filter by client, tool, server_name, environment or website_id.`,
	category: "MCP",
	tags: ["mcp", "model context protocol", "tool calls", "agents"],
});

export const McpBuilders = {
	mcp_summary: {
		meta: {
			...meta(
				"MCP Overview",
				"Tool call totals with error rate (percent) and median and p95 duration (ms). servers, environments and websites list the values present, for filtering. tracked is 1 once a call in this scope was ever recorded, so 0 for a website does not mean the SDK is missing."
			),
			output_fields: [
				{ name: "calls", type: "number" },
				{ name: "errors", type: "number" },
				{ name: "error_rate", type: "number" },
				{ name: "p50_ms", type: "number" },
				{ name: "p95_ms", type: "number" },
				{ name: "tools", type: "number" },
				{ name: "clients", type: "number" },
				{ name: "sessions", type: "number" },
				{ name: "servers", type: "json" },
				{ name: "environments", type: "json" },
				{ name: "websites", type: "json" },
				{ name: "last_call", type: "datetime" },
				{ name: "tracked", type: "number" },
			],
			default_visualization: "metric",
		},
		customSql: (ctx) => ({
			sql: `
				SELECT
					count() AS calls,
					countIf(is_error) AS errors,
					round(if(calls > 0, errors / calls * 100, 0), 1) AS error_rate,
					round(quantile(0.5)(duration_ms)) AS p50_ms,
					round(quantile(0.95)(duration_ms)) AS p95_ms,
					uniq(tool) AS tools,
					uniqIf(client, client != '') AS clients,
					uniqIf(session_id, session_id != '') AS sessions,
					groupUniqArrayIf(20)(server_name, server_name != '') AS servers,
					groupUniqArrayIf(10)(environment, environment != '') AS environments,
					groupUniqArrayIf(50)(website_id, website_id != '') AS websites,
					if(calls > 0, max(timestamp), NULL) AS last_call,
					(SELECT count() FROM (SELECT 1 FROM ${Analytics.mcp_spans} WHERE ${scope(ctx)} LIMIT 1)) AS tracked
				FROM ${Analytics.mcp_spans}
				WHERE ${inRange(ctx)}
			`,
			params: params(ctx),
		}),
		...common,
	},

	mcp_calls_series: {
		meta: {
			...meta(
				"MCP Calls Over Time",
				"Tool calls and failed calls per day (or hour), with empty buckets filled."
			),
			output_fields: [
				{ name: "date", type: "string" },
				{ name: "calls", type: "number" },
				{ name: "errors", type: "number" },
			],
			default_visualization: "timeseries",
			supports_granularity: ["hour", "day"],
		},
		customSql: (ctx) => {
			const bucket = ctx.granularity === "hour" ? "toStartOfHour" : "toDate";
			const step = ctx.granularity === "hour" ? "toIntervalHour(1)" : "1";
			const firstBucket = `${bucket}(toTimeZone(${START}, {timezone:String}))`;
			return {
				sql: `
					SELECT
						${bucket}(toTimeZone(timestamp, {timezone:String})) AS date,
						count() AS calls,
						countIf(is_error) AS errors
					FROM ${Analytics.mcp_spans}
					WHERE ${inRange(ctx)}
					GROUP BY date
					ORDER BY date ASC WITH FILL
						FROM ${firstBucket}
						TO greatest(${bucket}(toTimeZone(least(${END}, now()), {timezone:String})) + ${step}, ${firstBucket})
						STEP ${step}
				`,
				params: params(ctx),
			};
		},
		...common,
	},

	mcp_tools: {
		meta: {
			...meta(
				"MCP Tools",
				"One row per tool, most called first. avg_output_chars is the average number of text characters the tool returned, about 4 per token."
			),
			output_fields: [
				{ name: "tool", type: "string" },
				{ name: "calls", type: "number" },
				{ name: "errors", type: "number" },
				{ name: "error_rate", type: "number" },
				{ name: "p50_ms", type: "number" },
				{ name: "p95_ms", type: "number" },
				{ name: "avg_output_chars", type: "number" },
				{ name: "sessions", type: "number" },
				{ name: "clients", type: "json" },
				{ name: "last_called", type: "datetime" },
			],
			default_visualization: "table",
		},
		customSql: (ctx) => ({
			sql: `
				SELECT
					tool,
					count() AS calls,
					countIf(is_error) AS errors,
					round(errors / calls * 100, 1) AS error_rate,
					round(quantile(0.5)(duration_ms)) AS p50_ms,
					round(quantile(0.95)(duration_ms)) AS p95_ms,
					round(avg(output_chars)) AS avg_output_chars,
					uniqIf(session_id, session_id != '') AS sessions,
					topKIf(3)(client, client != '') AS clients,
					max(timestamp) AS last_called
				FROM ${Analytics.mcp_spans}
				WHERE ${inRange(ctx)}
				GROUP BY tool
				ORDER BY calls DESC
				LIMIT {limit:UInt32}
			`,
			params: params(ctx),
		}),
		...common,
	},

	mcp_clients: {
		meta: {
			...meta(
				"MCP Clients",
				"One row per AI client product (Claude Code, Cursor, ChatGPT, Codex...; '' when unidentified), most calls first."
			),
			output_fields: [
				{ name: "client", type: "string" },
				{ name: "calls", type: "number" },
				{ name: "error_rate", type: "number" },
				{ name: "p95_ms", type: "number" },
				{ name: "tools", type: "number" },
				{ name: "sessions", type: "number" },
				{ name: "versions", type: "json" },
				{ name: "user_agent", type: "string" },
				{ name: "last_seen", type: "datetime" },
			],
			default_visualization: "table",
		},
		customSql: (ctx) => ({
			sql: `
				SELECT
					client,
					count() AS calls,
					round(countIf(is_error) / calls * 100, 1) AS error_rate,
					round(quantile(0.95)(duration_ms)) AS p95_ms,
					uniq(tool) AS tools,
					uniqIf(session_id, session_id != '') AS sessions,
					topKIf(3)(client_version, client_version != '') AS versions,
					anyIf(user_agent, user_agent != '') AS user_agent,
					max(timestamp) AS last_seen
				FROM ${Analytics.mcp_spans}
				WHERE ${inRange(ctx)}
				GROUP BY client
				ORDER BY calls DESC
				LIMIT {limit:UInt32}
			`,
			params: params(ctx),
		}),
		...common,
	},

	mcp_errors: {
		meta: {
			...meta(
				"MCP Errors",
				"Failed tool calls grouped by tool and error message, most frequent first."
			),
			output_fields: [
				{ name: "tool", type: "string" },
				{ name: "error", type: "string" },
				{ name: "occurrences", type: "number" },
				{ name: "sessions", type: "number" },
				{ name: "clients", type: "json" },
				{ name: "last_seen", type: "datetime" },
			],
			default_visualization: "table",
		},
		customSql: (ctx) => ({
			sql: `
				SELECT
					tool,
					error,
					count() AS occurrences,
					uniqIf(session_id, session_id != '') AS sessions,
					topKIf(3)(client, client != '') AS clients,
					max(timestamp) AS last_seen
				FROM ${Analytics.mcp_spans}
				WHERE ${inRange(ctx)} AND is_error
				GROUP BY tool, error
				ORDER BY occurrences DESC
				LIMIT {limit:UInt32}
			`,
			params: params(ctx),
		}),
		...common,
	},
} satisfies Record<string, SimpleQueryConfig>;
