import { beforeEach, expect, mock, test } from "bun:test";
import type { ApiKeyRow } from "@databuddy/api-keys/resolve";
import type { RunMcpAgentOptions } from "../ai/mcp/run-agent";
import { createRedisModuleMock } from "../ai/test-redis-mock";
import type { DatabuddyAgentOptions } from "./index";

const stored = new Map<string, string>();
const runs: RunMcpAgentOptions[] = [];
mock.module("@databuddy/redis", () =>
	createRedisModuleMock({
		getRedisCache: () => ({
			get: async (key: string) => stored.get(key) ?? null,
			setex: async (key: string, _ttl: number, value: string) => {
				stored.set(key, value);
			},
		}),
	})
);
mock.module("@databuddy/api-keys/resolve", () => ({
	resolveApiKey: () => {
		throw new Error("Synthetic API keys do not need external resolution");
	},
}));
mock.module("./slack-relevance", () => ({
	classifySlackThreadReplyRelevance: async () => ({}),
}));

function answer(options: RunMcpAgentOptions): string {
	runs.push(options);
	return `Answer: ${options.question}`;
}
mock.module("../ai/mcp/run-agent", () => ({
	runMcpAgent: async (options: RunMcpAgentOptions) => answer(options),
	async *streamMcpAgentText(options: RunMcpAgentOptions) {
		yield answer(options);
	},
	runMcpAgentWithTrace: async (options: RunMcpAgentOptions) => ({
		answer: answer(options),
		steps: 0,
		toolCalls: [],
		usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
	}),
}));

const { askDatabuddyAgent, streamDatabuddyAgent, traceDatabuddyAgent } =
	await import("./index");
const key: ApiKeyRow = {
	id: "slack:integration-synthetic",
	name: "Synthetic Slack integration",
	prefix: "slack",
	start: "synthetic",
	keyHash: "inert",
	userId: "installer-synthetic",
	organizationId: "organization-synthetic",
	type: "user",
	scopes: ["read:data"],
	enabled: true,
	revokedAt: null,
	rateLimitEnabled: false,
	rateLimitTimeWindow: null,
	rateLimitMax: null,
	expiresAt: null,
	lastUsedAt: null,
	metadata: {},
	createdAt: new Date("2026-09-17"),
	updatedAt: new Date("2026-09-17"),
};
const options: DatabuddyAgentOptions = {
	actor: { type: "api_key", apiKey: key },
	conversationId: "slack-T_TEST-C_TEST-111_000",
	input: "First question",
	memoryUserId: "slack-T_TEST-U_A",
	source: "slack",
};

beforeEach(() => {
	stored.clear();
	runs.length = 0;
});

test.each([
	["ask", askDatabuddyAgent],
	["trace", traceDatabuddyAgent],
	[
		"stream",
		async (input: DatabuddyAgentOptions) => {
			let result = "";
			for await (const chunk of streamDatabuddyAgent(input)) {
				result += chunk;
			}
			return result;
		},
	],
] as const)("%s shares Slack thread history while keeping speaker memory separate", async (_name, invoke) => {
	await invoke(options);
	await invoke({
		...options,
		input: "Second question",
		memoryUserId: "slack-T_TEST-U_B",
	});
	await invoke({ ...options, input: "Third question" });

	expect(runs.map((run) => run.priorMessages?.length ?? 0)).toEqual([0, 2, 4]);
	expect(runs[1].priorMessages).toEqual([
		{ role: "user", content: "First question" },
		{ role: "assistant", content: "Answer: First question" },
	]);
	expect(runs.map((run) => run.memoryUserId)).toEqual([
		"slack-T_TEST-U_A",
		"slack-T_TEST-U_B",
		"slack-T_TEST-U_A",
	]);
});

test("isolates Slack history by integration, channel and thread", async () => {
	await askDatabuddyAgent(options);
	for (const isolated of [
		{
			actor: {
				type: "api_key" as const,
				apiKey: {
					...key,
					id: "slack:other-integration",
				},
			},
		},
		{ conversationId: "slack-T_TEST-C_OTHER-111_000" },
		{ conversationId: "slack-T_TEST-C_TEST-222_000" },
	]) {
		await askDatabuddyAgent({ ...options, ...isolated });
		expect(runs.at(-1)?.priorMessages).toBeUndefined();
	}
});

test.each([
	"dashboard",
	"mcp",
	"slack-session",
] as const)("keeps %s history scoped to the speaker", async (source) => {
	const input: DatabuddyAgentOptions =
		source === "slack-session"
			? {
					...options,
					actor: {
						type: "session",
						userId: "user-synthetic",
						requestHeaders: new Headers(),
					},
				}
			: { ...options, source };
	await askDatabuddyAgent(input);
	await askDatabuddyAgent({ ...input, memoryUserId: "slack-T_TEST-U_B" });
	await askDatabuddyAgent(input);
	expect(runs.map((run) => run.priorMessages?.length ?? 0)).toEqual([0, 0, 2]);
});
