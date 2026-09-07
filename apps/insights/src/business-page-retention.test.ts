import "@databuddy/test/env";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { WebsitePageResult } from "@databuddy/ai/tools/scrape-page";
import type { BusinessScope } from "@databuddy/services/business-memory";
import { tool } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { z } from "zod";
import type { InsightAgentInput } from "./agent";

// Keep factory/tool mocks out of the other investigation tests in this process.
if (process.env.INSIGHTS_RETENTION_TEST_CHILD !== "true") {
	it("native investigation page retention in an isolated process", async () => {
		const child = Bun.spawn([process.execPath, "test", import.meta.path], {
			env: { ...process.env, INSIGHTS_RETENTION_TEST_CHILD: "true" },
			stdout: "pipe",
			stderr: "pipe",
		});
		const [stdout, stderr, exitCode] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		expect({ exitCode, output: exitCode ? stdout + stderr : "" }).toEqual({
			exitCode: 0,
			output: "",
		});
	}, 20_000);
} else {
	const scope = {
		organizationId: "fixture-org",
		websiteId: "fixture-site",
		domain: "example.com",
		startedAt: "2026-07-01T00:00:00.000Z",
	};
	const page: Extract<WebsitePageResult, { success: true }> = {
		success: true,
		url: "https://example.com/docs/reports",
		requestedUrl: "https://example.com/docs/reports",
		finalUrl: "https://example.com/docs/reports",
		fetchedAt: "2026-07-11T00:00:00.000Z",
		title: "Report preparation",
		description: null,
		statusCode: 200,
		content: "A prepared report must still be exported by its recipient.",
		internalLinks: ["/docs/exports"],
	};
	const input: InsightAgentInput = {
		appContext: {
			chatId: "fixture-chat",
			currentDateTime: "2026-07-12T00:00:00.000Z",
			organizationId: scope.organizationId,
			websiteId: scope.websiteId,
			websiteDomain: scope.domain,
			timezone: "UTC",
			userId: "system",
			mutationMode: "allow",
		},
		evidence: [
			"Current visitors were 300, down from 1,000.",
			"Campaign cmp_search_1 is paused and owned by the Acquisition team.",
		],
		githubRepository: null,
		history: [],
		otherOpenWork: [],
		signal: {
			signalKey: "visitors",
			entity: {
				type: "channel",
				id: "paid-search",
				label: "Paid search visits",
			},
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
		},
	};
	const outcome = {
		title: "Paid search campaign is paused",
		summary: "Most of the visitor loss followed campaign cmp_search_1 pausing.",
		impact: null,
		rootCause: "Campaign cmp_search_1 was paused before the comparison window.",
		evidence: [
			"Visitors fell from 1,000 to 300.",
			"The campaign record shows cmp_search_1 is paused.",
		],
		evidenceRefs: [
			{ index: 0, source: "provided" },
			{ index: 1, source: "provided" },
		],
		findingKind: "product_outcome",
		publish: true,
		publicationBasis: "measured_impact",
		next: {
			type: "act",
			action: "Resume campaign cmp_search_1.",
			execution: null,
			recheckAt: "2026-07-15T00:00:00.000Z",
			target: "campaign cmp_search_1",
			verification: "Paid visits exceed 80 per day for three days.",
		},
	};
	const events: string[] = [];
	let currentScope: (BusinessScope & { startedAt: string }) | null = scope;
	let reads: { name: string; output: unknown }[] = [];
	let step = 0;
	let generationFailure = false;
	const lookup = mock(async () => {
		events.push("scope");
		return currentScope;
	});
	const remember = mock(
		async (_scope: BusinessScope, _pages: WebsitePageResult[]) => {
			events.push("flush");
		}
	);
	const log = mock(() => {});
	const model = new MockLanguageModelV3({
		doGenerate: async () => {
			events.push("model");
			const read = reads[step];
			if (!read && generationFailure)
				throw new Error("Synthetic generation failure");
			return {
				content: [
					{
						type: "tool-call",
						toolCallId: `read-${step++}`,
						toolName: read?.name ?? "finish_investigation",
						input: JSON.stringify(read ? { index: step - 1 } : outcome),
					},
				],
				finishReason: { unified: "tool-calls", raw: undefined },
				usage: {
					inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
					outputTokens: { total: 1, text: 1, reasoning: 0 },
				},
				warnings: [],
			};
		},
	});
	const readTool = tool({
		inputSchema: z.object({ index: z.number() }),
		execute: ({ index }) => {
			events.push("read");
			return reads[index]?.output;
		},
	});
	const toolkit = { scrape_page: readTool, search_website: readTool };
	const models = await import("@databuddy/ai/config/models");
	const memory = await import("@databuddy/services/business-memory");
	mock.module("@databuddy/ai/config/models", () => ({
		...models,
		createModelFromId: () => model,
		isAiGatewayConfigured: true,
	}));
	mock.module("@databuddy/ai/lib/ai-logger", () => ({
		getAILogger: () => ({ wrap: () => model }),
	}));
	mock.module("@databuddy/ai/tools/toolkit", () => ({
		createToolkit: () => toolkit,
	}));
	mock.module("@databuddy/services/business-memory", () => ({
		...memory,
		getWebsiteBusinessScope: lookup,
	}));
	mock.module("./business-profile", () => ({
		rememberBusinessPages: remember,
	}));
	mock.module("./lib/evlog-insights", () => ({ emitInsightsEvent: log }));
	const { runInsightAgent, InsightAgentExecutionError } = await import(
		"./agent"
	);

	beforeEach(() => {
		events.length = 0;
		step = 0;
		currentScope = scope;
		generationFailure = false;
		reads = [{ name: "scrape_page", output: page }];
		lookup.mockClear();
		remember.mockClear();
		log.mockClear();
	});

	describe("native investigation page retention", () => {
		it("flushes successful deeper pages once after the outcome", async () => {
			const second = {
				...page,
				url: "https://example.com/docs/exports",
				finalUrl: "https://example.com/docs/exports",
			};
			reads.push({ name: "scrape_page", output: second });
			expect((await runInsightAgent(input)).outcome.title).toBe(outcome.title);
			expect(lookup.mock.calls).toEqual([
				[{ organizationId: scope.organizationId, websiteId: scope.websiteId }],
			]);
			expect(events[0]).toBe("scope");
			expect(events.at(-1)).toBe("flush");
			expect(remember.mock.calls).toEqual([[scope, [page, second]]]);
		});

		it("flushes pages on generation failure using the epoch captured before the read", async () => {
			generationFailure = true;
			await expect(
				runInsightAgent(input, {
					onStepFinish: () => {
						currentScope = { ...scope, startedAt: "2026-07-12T00:00:00.000Z" };
					},
				})
			).rejects.toBeInstanceOf(InsightAgentExecutionError);
			expect(lookup).toHaveBeenCalledTimes(1);
			expect(remember.mock.calls).toEqual([[scope, [page]]]);
		});

		it("retains the read when an onStepFinish observer fails", async () => {
			await expect(
				runInsightAgent(input, {
					onStepFinish: () => {
						throw new Error("Synthetic observer failure");
					},
				})
			).rejects.toThrow("Synthetic observer failure");
			expect(remember.mock.calls).toEqual([[scope, [page]]]);
		});

		for (const mode of ["model", "tools", "dry-run"] as const) {
			it(`does no scope lookup or retention for ${mode}`, async () => {
				await runInsightAgent(
					mode === "dry-run"
						? {
								...input,
								appContext: { ...input.appContext, mutationMode: "dry-run" },
							}
						: { ...input, retainBusinessPages: true },
					mode === "model"
						? { model }
						: mode === "tools"
							? { tools: toolkit }
							: {}
				);
				expect(events).toContain("read");
				expect(lookup).not.toHaveBeenCalled();
				expect(remember).not.toHaveBeenCalled();
			});
		}

		it("retains native sources in analytics dry-run only with explicit caller authorization", async () => {
			await runInsightAgent({
				...input,
				retainBusinessPages: true,
				appContext: { ...input.appContext, mutationMode: "dry-run" },
			});
			expect(events[0]).toBe("scope");
			expect(remember.mock.calls).toEqual([[scope, [page]]]);
		});

		it("ignores failures, malformed page outputs, and other tools", async () => {
			reads = [
				{
					name: "scrape_page",
					output: { success: false, error: "Read unavailable" },
				},
				{ name: "scrape_page", output: { ...page, fetchedAt: "invalid" } },
				{ name: "scrape_page", output: { ...page, content: "" } },
				{ name: "search_website", output: page },
			];
			await runInsightAgent(input);
			expect(remember).not.toHaveBeenCalled();
		});

		it("skips retention without an initialized scope", async () => {
			currentScope = null;
			await runInsightAgent(input);
			expect(lookup).toHaveBeenCalledTimes(1);
			expect(remember).not.toHaveBeenCalled();
		});

		it("preserves successful generation if scope lookup fails", async () => {
			lookup.mockRejectedValueOnce(new Error("Private provider payload"));
			expect((await runInsightAgent(input)).outcome.title).toBe(outcome.title);
			expect(remember).not.toHaveBeenCalled();
			expect(log).toHaveBeenCalledTimes(1);
			expect(JSON.stringify(log.mock.calls)).not.toContain(
				"Private provider payload"
			);
		});

		it("preserves successful generation if optional retention fails", async () => {
			remember.mockRejectedValueOnce(new Error("Private provider payload"));
			expect((await runInsightAgent(input)).outcome.title).toBe(outcome.title);
			expect(remember).toHaveBeenCalledTimes(1);
			expect(log).toHaveBeenCalledTimes(1);
			expect(JSON.stringify(log.mock.calls)).not.toContain(
				"Private provider payload"
			);
		});

		it("preserves the original generation error if optional retention also fails", async () => {
			generationFailure = true;
			remember.mockRejectedValueOnce(new Error("Private provider payload"));
			await expect(runInsightAgent(input)).rejects.toThrow(
				"Synthetic generation failure"
			);
			expect(remember).toHaveBeenCalledTimes(1);
			expect(log).toHaveBeenCalledTimes(1);
			expect(JSON.stringify(log.mock.calls)).not.toContain(
				"Private provider payload"
			);
		});
	});
}
