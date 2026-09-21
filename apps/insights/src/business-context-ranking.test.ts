import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import {
	mergeBusinessContext,
	type BusinessContext,
	type BusinessSource,
} from "@databuddy/ai/lib/business-context";
import { planInvestigationsWithBusinessContext } from "./generation";
import { rankInvestigationBusinessContext } from "./business-context-ranking";

const date = "2026-09-20T00:00:00.000Z";
const page = (id: string): BusinessSource => ({
	id,
	kind: "website",
	observedAt: date,
	url: `https://example.com/${id}`,
	content: id.padEnd(3000, "."),
});
const profile: BusinessContext = {
	capturedAt: date,
	status: "ready",
	issues: [],
	sources: [
		{
			id: "profile",
			kind: "organization_profile",
			content: "Saved profile".padEnd(4000, "."),
			observedAt: date,
		},
		{
			...page("home"),
			url: "https://example.com/",
			content: "Home".padEnd(4000, "."),
		},
	],
};
const related: BusinessContext = {
	...profile,
	sources: [
		{
			id: "reply",
			kind: "team_reply",
			content: "Original correction".padEnd(4000, "."),
			observedAt: date,
		},
		page("decoration"),
		page("old-plan"),
		page("exception"),
	],
};
const input = {
	subjectKey: "goal:checkout",
	contexts: [profile, related],
	query: "Does checkout_completed always establish payment?",
};
type Evaluator = NonNullable<
	Parameters<typeof rankInvestigationBusinessContext>[1]
>;
const response = {
	answers: {
		q0: { type: "boolean" as const, probability: 0.1 },
		q1: { type: "boolean" as const, probability: 0.1 },
		q2: { type: "boolean" as const, probability: 0.9 },
	},
	usage: { inputTokens: 100, outputTokens: 3 },
	warnings: [],
};

describe("Jev optional context ranking", () => {
	it("freezes ranked context through the real investigation planner seam", async () => {
		let rankingCalls = 0;
		const candidates = await planInvestigationsWithBusinessContext(
			{
				organizationId: "fixture-org",
				websiteId: "fixture-site",
				domain: "example.com",
				timezone: "UTC",
				asOf: date,
			},
			[
				{
					baseline: 100,
					current: 20,
					deltaPercent: -80,
					detectedAt: "2026-09-19",
					direction: "down",
					label: "checkout_completed",
					method: "wow",
					metric: "custom_event_reach",
					severity: "warning",
					subjectKey: "custom_event_reach:checkout_completed",
					entityId: "checkout_completed",
					entityLabel: "checkout_completed",
				},
			],
			{
				loadBusinessProfile: async () => profile,
				recallBusinessContext: async () => related,
				rankBusinessContext: (options) => {
					rankingCalls++;
					expect(options.query).toContain("checkout_completed");
					expect(options.contexts).toEqual([profile, related]);
					return rankInvestigationBusinessContext(options, {
						doEvaluate: async () => response,
					});
				},
			},
			false
		);
		expect(rankingCalls).toBe(1);
		expect(candidates[0]?.businessContext?.sources.map((s) => s.id)).toEqual([
			"profile",
			"reply",
			"home",
			"exception",
		]);
	});
	it("uses full scoped sources, accounts for usage, and recovers the relevant page", async () => {
		let calls = 0;
		let usageCalls = 0;
		const model: Evaluator = {
			doEvaluate: async (request) => {
				calls++;
				expect(request.providerOptions).toEqual({
					gateway: { zeroDataRetention: true },
				});
				expect(
					(typeof request.state === "string"
						? JSON.parse(request.state)
						: request.state
					).optionalSources
				).toEqual(
					related.sources.slice(1).map((source, index) => ({
						...source,
						selectionId: `source_${index}`,
					}))
				);
				expect(request.questions.q2?.instructions).toContain('"source_2"');
				return response;
			},
		};
		const result = await rankInvestigationBusinessContext(
			{
				...input,
				onUsage: (usage) => {
					usageCalls++;
					expect(usage.modelId).toBe("typesafe-ai/jev");
					expect(usage.usage.totalTokens).toBe(103);
				},
			},
			model
		);
		expect(calls).toBe(1);
		expect(usageCalls).toBe(1);
		expect(result.sources.map((s) => s.id)).toEqual([
			"profile",
			"reply",
			"home",
			"exception",
		]);
	});
	it("never calls the model when no pages compete, input is oversized, or cancelled", async () => {
		let calls = 0;
		const model: Evaluator = {
			doEvaluate: () => {
				calls++;
				throw new Error("Unexpected model request");
			},
		};
		for (const options of [
			{ ...input, contexts: [profile] },
			{ ...input, query: "🙂".repeat(16_000) },
			{ ...input, abortSignal: AbortSignal.abort() },
		]) {
			expect(await rankInvestigationBusinessContext(options, model)).toEqual(
				mergeBusinessContext(...options.contexts)
			);
			expect(calls).toBe(0);
		}
	});
	it("retains exact fallback and returned usage for invalid answers", async () => {
		for (const answers of [
			{},
			{ ...response.answers, extra: response.answers.q0 },
			{
				...response.answers,
				q1: { type: "boolean" as const, probability: Number.NaN },
			},
		]) {
			let tracked = false;
			const result = await rankInvestigationBusinessContext(
				{
					...input,
					onUsage: () => {
						tracked = true;
					},
				},
				{ doEvaluate: async () => ({ ...response, answers }) }
			);
			expect(tracked).toBe(true);
			expect(result).toEqual(mergeBusinessContext(...input.contexts));
		}
	});
	it("skips unavailable billing without a provider request", async () => {
		let calls = 0;
		const model: Evaluator = {
			doEvaluate: async () => {
				calls++;
				return response;
			},
		};
		for (const canRun of [
			async () => false,
			() => Promise.reject(new Error("Synthetic availability failure")),
		]) {
			expect(
				await rankInvestigationBusinessContext({ ...input, canRun }, model)
			).toEqual(mergeBusinessContext(...input.contexts));
		}
		expect(calls).toBe(0);
	});
	it("falls back after a provider failure without retrying", async () => {
		let calls = 0;
		const result = await rankInvestigationBusinessContext(input, {
			doEvaluate: () => {
				calls++;
				return Promise.reject(new Error("Synthetic provider failure"));
			},
		});
		expect(calls).toBe(1);
		expect(result).toEqual(mergeBusinessContext(...input.contexts));
	});
	it("aborts the optional request after one second", async () => {
		const started = performance.now();
		const result = await rankInvestigationBusinessContext(input, {
			doEvaluate: ({ abortSignal }) =>
				new Promise((_, reject) => {
					abortSignal?.addEventListener(
						"abort",
						() => reject(abortSignal.reason),
						{ once: true }
					);
				}),
		});
		expect(performance.now() - started).toBeLessThan(1500);
		expect(result).toEqual(mergeBusinessContext(...input.contexts));
	});
});
