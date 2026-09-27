import { expect, it } from "bun:test";
import { generateText, tool } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { agentDataInputSchema } from "./agent-query-schema";
import { buildBatchQueryRequests } from "./mcp-utils";

const explicitQuery = {
	type: "summary_metrics",
	preset: null,
	from: "2026-09-03",
	to: "2026-09-09",
	timeUnit: null,
	limit: null,
	filters: null,
	groupBy: null,
	orderBy: null,
};

it("accepts strict-provider nulls through the native SDK without changing the requested query population", async () => {
	const model = new MockLanguageModelV3({
		doGenerate: async () => ({
			content: [
				{
					type: "tool-call",
					toolCallId: "synthetic-read",
					toolName: "get_data",
					input: JSON.stringify({
						websiteId: "site-synthetic",
						queries: [explicitQuery],
						timezone: null,
					}),
				},
			],
			finishReason: { unified: "tool-calls", raw: "tool_calls" },
			usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
			warnings: [],
		}),
	});
	const result = await generateText({
		model,
		prompt: "Compare the synthetic complete periods.",
		tools: {
			get_data: tool({
				strict: true,
				inputSchema: agentDataInputSchema,
				execute: (args) =>
					buildBatchQueryRequests(args.queries, args.websiteId, args.timezone),
			}),
		},
	});
	expect(result.toolResults).toHaveLength(1);
	expect(result.toolResults[0]?.output).toMatchObject({
		invalid: [],
		requests: [
			{
				type: "summary_metrics",
				projectId: "site-synthetic",
				from: "2026-09-03",
				to: "2026-09-09",
				timezone: "UTC",
				filters: undefined,
				groupBy: undefined,
			},
		],
	});
	const definition = model.doGenerateCalls[0]?.tools?.[0];
	expect(definition?.strict).toBe(true);
	expect(JSON.stringify(definition?.inputSchema)).toContain('"type":"null"');
});

it("retains omitted-field compatibility and rejects conflicting dates and filter retargeting", () => {
	for (const query of [
		explicitQuery,
		{ type: "summary_metrics", from: explicitQuery.from, to: explicitQuery.to },
	]) {
		const args = agentDataInputSchema.parse({
			websiteId: "site-synthetic",
			queries: [query],
		});
		expect(
			buildBatchQueryRequests(args.queries, args.websiteId, args.timezone)
				.invalid
		).toEqual([]);
	}
	const preset = agentDataInputSchema.parse({
		websiteId: "site-synthetic",
		queries: [{ ...explicitQuery, from: null, to: null, preset: "last_7d" }],
	});
	expect(
		buildBatchQueryRequests(preset.queries, preset.websiteId, preset.timezone)
			.requests
	).toHaveLength(1);
	const conflicting = agentDataInputSchema.parse({
		websiteId: "site-synthetic",
		queries: [{ ...explicitQuery, preset: "last_7d" }],
	});
	expect(
		buildBatchQueryRequests(
			conflicting.queries,
			conflicting.websiteId,
			conflicting.timezone
		)
	).toMatchObject({
		requests: [],
		invalid: [{ error: "Use either a preset or explicit dates, not both." }],
	});
	for (const extra of [{ target: "event" }, { having: true }]) {
		expect(
			agentDataInputSchema.safeParse({
				websiteId: "site-synthetic",
				queries: [
					{
						...explicitQuery,
						filters: [
							{ field: "path", op: "eq", value: "/checkout", ...extra },
						],
					},
				],
			}).success
		).toBe(false);
	}
});
