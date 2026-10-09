import { describe, expect, it } from "bun:test";
import { createConfig } from "../agents/analytics";
import { createMcpAgentConfig } from "../agents/mcp";
import type { AgentConfig } from "../agents/types";
import { QueryBuilders } from "../../query/builders";

const TOOL_VERB =
	/^(?:add|configure|create|delete|describe|discover|execute|forget|get|list|save|slack|submit|update)_/;

const slackContext = {
	readCurrentThread: async () => ({
		channelId: "C123",
		messages: [],
		threadTs: "1.0",
	}),
	readRecentChannelMessages: async () => ({ channelId: "C123", messages: [] }),
};

const configs: [string, AgentConfig][] = [
	[
		"dashboard",
		createConfig({
			chatId: "chat-synthetic",
			integrations: { github: true, scrape: true, searchConsole: true },
			organizationId: "org-synthetic",
			timezone: "UTC",
			userId: "user-synthetic",
		}),
	],
	...(["allow", "dry-run"] as const).flatMap((mutationMode) =>
		(["mcp", "slack", "api"] as const).map((source): [string, AgentConfig] => [
			`${source} ${mutationMode}`,
			createMcpAgentConfig({
				apiKey: null,
				mutationMode,
				organizationId: "org-synthetic",
				requestHeaders: new Headers(),
				slackContext: source === "slack" ? slackContext : null,
				source,
				userId: null,
			}),
		])
	),
];

const knownTools = new Set(
	configs.flatMap(([, config]) => Object.keys(config.tools))
);

describe("agent instructions name only tools the agent gets", () => {
	it.each(configs)("%s", (_name, config) => {
		const mentioned = new Set(
			String(config.system.content).match(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g)
		);
		const missing = [...mentioned].filter(
			(token) =>
				(knownTools.has(token) || TOOL_VERB.test(token)) &&
				!(token in QueryBuilders) &&
				!(token in config.tools)
		);
		expect(missing).toEqual([]);
	});
});
