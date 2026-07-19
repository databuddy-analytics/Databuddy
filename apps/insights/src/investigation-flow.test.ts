import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type {
	InvestigationEvidence,
	InvestigationOutcome,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import { tool } from "ai";
import { MockLanguageModelV3, mockValues } from "ai/test";
import { z } from "zod";
import { type InsightAgentStepTrace, runInsightAgent } from "./agent";

const signal: InvestigationSignal = {
	signalKey: "visitors",
	websiteId: "site-1",
	insightType: "traffic_drop",
	entity: { type: "website", id: "website", label: "Visitors" },
	metric: {
		key: "visitors",
		label: "Visitors",
		current: 300,
		previous: 1000,
		format: "number",
	},
	changePercent: -70,
	direction: "down",
	severity: "critical",
	sentiment: "negative",
	priority: 9,
	period: {
		current: { from: "2026-07-05", to: "2026-07-11" },
		previous: { from: "2026-06-28", to: "2026-07-04" },
	},
	detectedAt: "2026-07-11",
	detection: {
		method: "period_comparison",
		reason: "Visitors changed -70% from the previous period.",
		boundary: { comparison: "at_or_below", value: 400 },
	},
};

const evidence: InvestigationEvidence[] = [
	{
		source: "web",
		summary: "Current visitors were 300, down from 1,000.",
	},
	{
		source: "business",
		summary:
			"Campaign cmp_search_1 is paused and owned by the Acquisition team.",
	},
];

const outcome: InvestigationOutcome = {
	title: "Paid search campaign is paused",
	summary: "Most of the visitor loss followed campaign cmp_search_1 pausing.",
	impact: "The site lost 700 visitors in the comparison window.",
	rootCause: "Campaign cmp_search_1 was paused before the comparison window.",
	rootCauseConfidence: 0.82,
	impactConfidence: 0.95,
	evidence: [
		"Visitors fell from 1,000 to 300.",
		"The campaign record shows cmp_search_1 is paused.",
	],
	sources: ["web", "business"],
	next: {
		type: "act",
		action: "Resume campaign cmp_search_1.",
		kind: "campaign",
		owner: "Acquisition team",
		target: "campaign cmp_search_1",
		verification: "Paid visits exceed 80 per day for three days.",
	},
};

const usage = {
	inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 1, text: 1, reasoning: 0 },
};

function appContext() {
	return {
		chatId: "insights:org-1:site-1",
		currentDateTime: "2026-07-12T00:00:00.000Z",
		defaultWebsiteId: "site-1",
		mutationMode: "dry-run" as const,
		organizationId: "org-1",
		timezone: "UTC",
		userId: "system",
		websiteDomain: "example.com",
		websiteId: "site-1",
	};
}

function outputResponse(value: unknown) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(value) }],
		finishReason: { unified: "stop" as const, raw: undefined },
		usage,
		warnings: [],
	};
}

function outputModel(value: unknown = outcome) {
	return new MockLanguageModelV3({
		doGenerate: mockValues(outputResponse(value)),
	});
}

describe("investigation agent", () => {
	it("returns the model's structured outcome directly", async () => {
		const model = outputModel();
		const trace: InsightAgentStepTrace[] = [];
		const availableRead = tool({
			description: "Test read",
			inputSchema: z.object({}),
			execute: () => ({ ok: true }),
		});

		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				signal,
			},
			{
				model,
				onStepFinish: (step) => {
					trace.push(step);
				},
				tools: {
					describe_schema: availableRead,
					execute_sql_query: availableRead,
					get_data: availableRead,
					list_websites: availableRead,
				},
			}
		);

		expect(result).toMatchObject({ outcome, toolCallCount: 0 });
		expect(result).not.toHaveProperty("decision");
		expect(result).not.toHaveProperty("insight");
		expect(trace).toHaveLength(1);
		expect(trace[0]?.tools).toEqual([]);

		const call = model.doGenerateCalls[0];
		expect(call?.responseFormat?.type).toBe("json");
		expect(call?.toolChoice).toEqual({ type: "auto" });
		expect(call?.tools?.map((item) => item.name)).toEqual(["get_data"]);

		const prompt = JSON.stringify(call?.prompt);
		expect(prompt).toContain('\\\"asOf\\\"');
		expect(prompt).toContain('\\\"evidence\\\"');
		expect(prompt).toContain('\\\"relatedSignals\\\"');
		expect(prompt).toContain('\\\"signal\\\"');
		expect(prompt).toContain("Correlation is not cause");
		expect(prompt).toContain("makes a named goal or business metric unusable");
		expect(prompt).toContain("missing optional attribution alone is not impact");
		expect(prompt).toContain("first use tools for any metric or event comparison");
		expect(prompt).toContain("never ask whether something changed merely");
		expect(prompt).toContain("When impact is null, next must be watch or resolve");
		expect(prompt).toContain("Use related signals to test cross-signal explanations");
		expect(prompt).toContain("under 130 words");
		expect(prompt).toContain("closed comparison windows");
		expect(prompt).not.toContain("codeRepositoryConnected");
		expect(prompt).not.toContain("signalPeriodsAreComplete");
	});

	it("can inspect evidence before returning structured output", async () => {
		const model = new MockLanguageModelV3({
			doGenerate: mockValues(
				{
					content: [
						{
							input: "{}",
							toolCallId: "inspect-1",
							toolName: "inspect",
							type: "tool-call" as const,
						},
					],
					finishReason: { unified: "tool-calls" as const, raw: undefined },
					usage,
					warnings: [],
				},
				outputResponse(outcome)
			),
		});
		const trace: InsightAgentStepTrace[] = [];

		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				signal,
			},
			{
				model,
				onStepFinish: (step) => {
					trace.push(step);
				},
				tools: {
					inspect: tool({
						description: "Inspect another relevant fact.",
						inputSchema: z.object({}).strict(),
						execute: () => ({ inspected: true }),
					}),
				},
			}
		);

		expect(result.outcome).toEqual(outcome);
		expect(result.toolCallCount).toBe(1);
		expect(model.doGenerateCalls).toHaveLength(2);
		expect(trace.map((step) => step.tools)).toEqual([
			[
				{
					errorType: null,
					name: "inspect",
					outcome: "returned",
				},
			],
			[],
		]);
		expect(model.doGenerateCalls[1]?.toolChoice).toEqual({ type: "auto" });
	});

	it("fails when the structured output does not match the contract", async () => {
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					signal,
				},
				{ model: outputModel({ title: "Incomplete" }), tools: {} }
			)
		).rejects.toThrow("response did not match schema");
	});

	it("replays prior outcomes and new human context", async () => {
		const model = outputModel();
		const previousOutcome: InvestigationOutcome = {
			...outcome,
			title: "Historical outcome title",
			next: {
				type: "ask",
				question: "Was the campaign intentionally paused?",
				who: "Acquisition team",
				why: "This determines whether to restore spend.",
			},
		};

		await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [
					{
						asOf: "2026-07-12T00:00:00.000Z",
						evidence,
						kind: "investigation",
						outcome: previousOutcome,
						signal,
					},
					{
						author: "Ari",
						body: "The campaign was paused intentionally.",
						createdAt: "2026-07-12T01:00:00.000Z",
						kind: "reply",
					},
				],
				request: {
					body: "It was restarted this morning.",
					createdAt: "2026-07-12T02:00:00.000Z",
				},
				signal,
			},
			{ model, tools: {} }
		);

		const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
		expect(prompt).toContain("Historical outcome title");
		expect(prompt).toContain('\\"outcome\\"');
		expect(prompt).toContain("The campaign was paused intentionally.");
		expect(prompt).toContain("It was restarted this morning.");
		expect(prompt).toContain("Treat it as a claim to verify");
		expect(prompt.match(/It was restarted this morning\./g)).toHaveLength(1);
	});

	it("requires an organization before exposing investigation tools", async () => {
		await expect(
			runInsightAgent(
				{
					appContext: { ...appContext(), organizationId: null },
					evidence,
					githubRepository: null,
					history: [],
					signal,
				},
				{ model: new MockLanguageModelV3(), tools: {} }
			)
		).rejects.toThrow("organization");
	});
});
