import "@databuddy/test/env";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
	claimAttributionQuestions,
	compareByUncertaintyDesc,
	evaluateWithJev,
	judgeCase,
	parseProposedEvidence,
	uncertaintyOf,
} from "./judge";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_KEY = process.env.AI_GATEWAY_API_KEY;

beforeEach(() => {
	process.env.AI_GATEWAY_API_KEY = "test-gateway-key";
});
afterEach(() => {
	globalThis.fetch = ORIGINAL_FETCH;
	if (ORIGINAL_KEY === undefined) {
		delete process.env.AI_GATEWAY_API_KEY;
	} else {
		process.env.AI_GATEWAY_API_KEY = ORIGINAL_KEY;
	}
});

const booleanQuestion = {
	type: "boolean" as const,
	instructions: "Decide something about state.subject.",
	criteria: { true: "Yes.", false: "No." },
};

describe("evaluateWithJev", () => {
	it("skips the request entirely with no questions", async () => {
		globalThis.fetch = mock(async () => Response.json({}));
		const result = await evaluateWithJev({ subject: 1 }, {});
		expect(result).toBeNull();
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});

	it("skips the request entirely without AI_GATEWAY_API_KEY", async () => {
		delete process.env.AI_GATEWAY_API_KEY;
		globalThis.fetch = mock(async () => Response.json({}));
		const result = await evaluateWithJev(
			{ subject: 1 },
			{ q: booleanQuestion }
		);
		expect(result).toBeNull();
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});

	it("posts the batched state/questions body with zero-data-retention headers", async () => {
		let capturedUrl: string | URL | Request | undefined;
		let capturedInit: RequestInit | undefined;
		globalThis.fetch = mock(
			async (url: string | URL | Request, init?: RequestInit) => {
				capturedUrl = url;
				capturedInit = init;
				return Response.json({
					answers: { q: { probability: 0.75 } },
					usage: { inputTokens: 120, outputTokens: 40 },
				});
			}
		);
		const result = await evaluateWithJev(
			{ subject: "example" },
			{ q: booleanQuestion }
		);
		expect(capturedUrl).toBe(
			"https://ai-gateway.vercel.sh/v4/ai/evaluation-model"
		);
		const headers = new Headers(capturedInit?.headers);
		expect(headers.get("authorization")).toBe("Bearer test-gateway-key");
		expect(headers.get("ai-model-id")).toBe("typesafe-ai/jev");
		expect(headers.get("ai-gateway-auth-method")).toBe("api-key");
		expect(headers.get("ai-evaluation-model-specification-version")).toBe("4");
		const body = JSON.parse(String(capturedInit?.body));
		expect(body).toEqual({
			state: { subject: "example" },
			questions: { q: booleanQuestion },
			providerOptions: { gateway: { zeroDataRetention: true } },
		});
		expect(result).toEqual({
			probabilities: { q: 0.75 },
			usage: { inputTokens: 120, outputTokens: 40 },
		});
	});

	it("returns null on a non-ok response", async () => {
		globalThis.fetch = mock(async () => new Response("nope", { status: 500 }));
		const result = await evaluateWithJev(
			{ subject: 1 },
			{ q: booleanQuestion }
		);
		expect(result).toBeNull();
	});

	it("returns null when the response fails schema validation", async () => {
		globalThis.fetch = mock(async () =>
			Response.json({ answers: { q: { probability: "not-a-number" } } })
		);
		const result = await evaluateWithJev(
			{ subject: 1 },
			{ q: booleanQuestion }
		);
		expect(result).toBeNull();
	});

	it("returns null instead of throwing when fetch rejects", async () => {
		globalThis.fetch = mock(async () => {
			throw new Error("network down");
		});
		const result = await evaluateWithJev(
			{ subject: 1 },
			{ q: booleanQuestion }
		);
		expect(result).toBeNull();
	});

	it("defaults missing usage fields to zero instead of throwing", async () => {
		globalThis.fetch = mock(async () =>
			Response.json({ answers: { q: { probability: 0.4 } } })
		);
		const result = await evaluateWithJev(
			{ subject: 1 },
			{ q: booleanQuestion }
		);
		expect(result).toEqual({
			probabilities: { q: 0.4 },
			usage: { inputTokens: 0, outputTokens: 0 },
		});
	});
});

describe("uncertaintyOf", () => {
	it("is maximal at 0.5 and zero at the extremes", () => {
		expect(uncertaintyOf(0.5)).toBe(1);
		expect(uncertaintyOf(0)).toBe(0);
		expect(uncertaintyOf(1)).toBe(0);
		expect(uncertaintyOf(0.9)).toBeCloseTo(0.2, 5);
		expect(uncertaintyOf(0.1)).toBeCloseTo(0.2, 5);
	});
});

describe("compareByUncertaintyDesc", () => {
	it("sorts most-ambiguous first", () => {
		const items = [
			{ id: "confident", uncertainty: 0.1 },
			{ id: "ambiguous", uncertainty: 0.9 },
			{ id: "middling", uncertainty: 0.5 },
		];
		const sorted = [...items].sort(compareByUncertaintyDesc);
		expect(sorted.map((item) => item.id)).toEqual([
			"ambiguous",
			"middling",
			"confident",
		]);
	});

	it("treats a missing verdict as maximally uncertain", () => {
		const items: ({ uncertainty: number } | null)[] = [
			{ uncertainty: 0.2 },
			null,
			{ uncertainty: 0.6 },
		];
		const sorted = [...items].sort(compareByUncertaintyDesc);
		expect(sorted[0]).toBeNull();
	});
});

describe("parseProposedEvidence", () => {
	it("extracts sources/claim entries", () => {
		const candidate = {
			evidence: [
				{ sources: [{ source: "signal" }], claim: "Visitors fell 480→0." },
				{
					sources: [{ source: "provided", index: 0 }],
					claim: { retention: true },
				},
			],
		};
		expect(parseProposedEvidence(candidate)).toEqual(candidate.evidence);
	});

	it("returns an empty array for malformed or missing input", () => {
		expect(parseProposedEvidence(undefined)).toEqual([]);
		expect(parseProposedEvidence(null)).toEqual([]);
		expect(parseProposedEvidence({})).toEqual([]);
		expect(parseProposedEvidence({ evidence: [{ claim: "x" }] })).toEqual([]);
	});
});

describe("claimAttributionQuestions", () => {
	it("returns metric/population/period/direction questions naming the claim index", () => {
		const questions = claimAttributionQuestions(2);
		expect(Object.keys(questions).sort()).toEqual([
			"direction",
			"metric",
			"period",
			"population",
		]);
		for (const question of Object.values(questions)) {
			expect(question.type).toBe("boolean");
			expect(question.instructions).toContain("proposedEvidence[2]");
		}
	});
});

const finalOutcome = {
	title: "Gross revenue fell",
	summary: "Gross revenue fell from $10,000 to $100 this week.",
	rootCause: null,
	evidence: ["Gross revenue fell from $10,000 to $100 this week."],
};

describe("judgeCase", () => {
	it("is unavailable without a rubric or any string evidence claim", async () => {
		globalThis.fetch = mock(async () => Response.json({}));
		const verdict = await judgeCase({
			finalOutcome,
			history: [],
			proposedEvidence: [
				{
					sources: [{ source: "tool" }],
					claim: { currency: "USD", fields: ["gross_revenue"] },
				},
			],
			reviewRequired: null,
			signal: {},
			suppliedEvidence: [],
			toolCalls: [],
		});
		expect(verdict).toEqual({ available: false, claims: {}, uncertainty: 1 });
		expect(globalThis.fetch).not.toHaveBeenCalled();
	});

	it("is unavailable without AI_GATEWAY_API_KEY even when there is work to judge", async () => {
		delete process.env.AI_GATEWAY_API_KEY;
		globalThis.fetch = mock(async () => Response.json({}));
		const verdict = await judgeCase({
			finalOutcome,
			history: [],
			proposedEvidence: [
				{
					sources: [{ source: "tool", name: "get_data", toolCallId: "call-1" }],
					claim: "Gross revenue fell from $10,000 to $100 this week.",
				},
			],
			reviewRequired:
				"Verify the number belongs to gross revenue, not transactions.",
			signal: {},
			suppliedEvidence: [],
			toolCalls: [],
		});
		expect(verdict.available).toBe(false);
		expect(verdict.uncertainty).toBe(1);
	});

	it("batches the rubric and every string claim's attribution questions into one call", async () => {
		let capturedQuestions: Record<string, unknown> | undefined;
		globalThis.fetch = mock(async (_url, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body));
			capturedQuestions = body.questions;
			return Response.json({
				answers: {
					reviewRequired: { probability: 0.1 },
					claim_1_metric: { probability: 0.05 },
					claim_1_population: { probability: 0.9 },
					claim_1_period: { probability: 0.85 },
					claim_1_direction: { probability: 0.5 },
				},
				usage: { inputTokens: 500, outputTokens: 80 },
			});
		});
		const verdict = await judgeCase({
			finalOutcome,
			history: [],
			proposedEvidence: [
				{
					sources: [{ source: "tool", name: "get_data", toolCallId: "call-1" }],
					claim: { currency: "USD", fields: ["gross_revenue"] },
				},
				{
					sources: [{ source: "tool", name: "get_data", toolCallId: "call-2" }],
					claim: "Gross revenue fell from $10,000 to $100 this week.",
				},
			],
			reviewRequired:
				"Verify the number belongs to gross revenue, not transactions.",
			signal: { signalKey: "revenue:USD" },
			suppliedEvidence: [],
			toolCalls: [
				{
					name: "get_data",
					input: {},
					output: {
						results: { revenue: { data: [{ gross_revenue: 10_000 }] } },
					},
					toolCallId: "call-2",
				},
			],
		});
		// Only claim index 1 is a string claim; the structured revenue claim at
		// index 0 is skipped, matching agent.ts's own numeric-grounding scope.
		expect(Object.keys(capturedQuestions ?? {}).sort()).toEqual([
			"claim_1_direction",
			"claim_1_metric",
			"claim_1_period",
			"claim_1_population",
			"reviewRequired",
		]);
		expect(verdict.available).toBe(true);
		expect(verdict.reviewRequired?.probability).toBe(0.1);
		expect(verdict.claims[1]?.metric?.probability).toBe(0.05);
		expect(verdict.claims[1]?.population?.probability).toBe(0.9);
		expect(verdict.claims[0]).toBeUndefined();
		// Most uncertain question here is direction at p=0.5 → uncertainty 1.
		expect(verdict.uncertainty).toBe(1);
		expect(verdict.usage).toEqual({ inputTokens: 500, outputTokens: 80 });
	});
});
