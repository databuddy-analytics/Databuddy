import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type {
	InvestigationOutcome,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import { tool } from "ai";
import { MockLanguageModelV3, mockValues } from "ai/test";
import { z } from "zod";
import { runInsightAgent } from "./agent";

const signal: InvestigationSignal = {
	signalKey: "visitors",
	entity: { type: "website", id: "website", label: "Visitors" },
	metric: {
		label: "Visitors",
		current: 300,
		previous: 1000,
		format: "number",
	},
	changePercent: -70,
	severity: "critical",
	sentiment: "negative",
	period: {
		current: { from: "2026-07-05", to: "2026-07-11" },
		previous: { from: "2026-06-28", to: "2026-07-04" },
	},
};

const evidence = [
	"Current visitors were 300, down from 1,000.",
	"Campaign cmp_search_1 is paused and owned by the Acquisition team.",
];

const outcome: InvestigationOutcome = {
	title: "Paid search campaign is paused",
	summary: "Most of the visitor loss followed campaign cmp_search_1 pausing.",
	impact: "The site lost 700 visitors in the comparison window.",
	rootCause: "Campaign cmp_search_1 was paused before the comparison window.",
	evidence: [
		"Visitors fell from 1,000 to 300.",
		"The campaign record shows cmp_search_1 is paused.",
	],
	publish: true,
	recommendation: null,
	next: {
		type: "act",
		action: "Resume campaign cmp_search_1.",
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
		websiteName: "Example Store",
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

describe("intelligence agent", () => {
	it("returns the model's structured outcome directly", async () => {
		const model = outputModel();
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
				otherOpenWork: [],
				signal,
			},
			{
				model,
				tools: {
					describe_schema: availableRead,
					execute_sql_query: availableRead,
					get_data: availableRead,
					get_goal_analytics: availableRead,
					list_websites: availableRead,
				},
			}
		);

		expect(result).toMatchObject({ outcome, toolCallCount: 0 });
		const call = model.doGenerateCalls[0];
		expect(call?.tools?.map((item) => item.name)).toEqual(["get_data"]);

		const prompt = JSON.stringify(call?.prompt);
		expect(prompt).toContain("Example Store");
		expect(JSON.stringify(call)).toContain(
			"Treat the Insights feed as scarce teammate attention"
		);
		expect(JSON.stringify(call)).toContain(
			"test the existing verification condition against current data"
		);
		expect(JSON.stringify(call)).toContain(
			"Do not add generic audience fillers"
		);
		expect(JSON.stringify(call)).toContain(
			"Round percentages to at most one decimal place in prose"
		);
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
		const result = await runInsightAgent(
			{
				appContext: appContext(),
				evidence,
				githubRepository: null,
				history: [],
				otherOpenWork: [],
				signal,
			},
			{
				model,
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
	});

	it("fails when the structured output does not match the contract", async () => {
		await expect(
			runInsightAgent(
				{
					appContext: appContext(),
					evidence,
					githubRepository: null,
					history: [],
					otherOpenWork: [],
					signal,
				},
				{ model: outputModel({ title: "Incomplete" }), tools: {} }
			)
		).rejects.toThrow();
	});

	it("replays prior outcomes and new human context", async () => {
		const model = outputModel();
		const priorEvidence = [
			'The goal previously tracked the event "checkout_started".',
		];
		const previousOutcome: InvestigationOutcome = {
			...outcome,
			title: "Historical outcome title",
			next: {
				type: "ask",
				question: "Was the campaign intentionally paused?",
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
						evidence: priorEvidence,
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
				otherOpenWork: [
					{
						asOf: "2026-07-12T00:30:00.000Z",
						next: {
							question:
								"Connect the repository that owns the checkout flow.",
							type: "ask",
						},
						title: "Checkout repository access",
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
		expect(prompt).toContain("checkout_started");
		expect(prompt).toContain("The campaign was paused intentionally.");
		expect(prompt).toContain("It was restarted this morning.");
		expect(prompt).toContain("Checkout repository access");
		expect(prompt).toContain(
			"Connect the repository that owns the checkout flow."
		);
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
					otherOpenWork: [],
					signal,
				},
				{ model: new MockLanguageModelV3(), tools: {} }
			)
		).rejects.toThrow();
	});
});
