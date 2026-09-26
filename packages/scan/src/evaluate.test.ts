import assert from "node:assert/strict";
import { test } from "node:test";
import {
	parseResponse,
	requestEvaluation,
	type Attempt,
	type EvaluationOptions,
} from "./evaluate.js";

const jobs = [
	{ path: "src/action.ts", start: 7, end: 9, source: "await persist();\n" },
];
const response = () => ({
	answers: {
		coverage_0: { choice: "missing", probabilities: { missing: 0.8 } },
		category_0: { choice: "activation", probabilities: { activation: 0.6 } },
		priority_0: { score: 2 },
	},
	usage: { inputTokens: 10, outputTokens: 3 },
});

function options(overrides: Partial<EvaluationOptions> = {}) {
	const attempts: Attempt[] = [];
	const retries: { attempt: number; reason: string; waitMs: number }[] = [];
	return {
		attempts,
		retries,
		value: {
			apiKey: "fixture-key",
			timeoutMs: 1000,
			signal: new AbortController().signal,
			onAttempt: (attempt: Attempt) => {
				attempts.push(attempt);
			},
			onRetry: (retry: { attempt: number; reason: string; waitMs: number }) => {
				retries.push(retry);
			},
			...overrides,
		},
	};
}

async function withFetch(
	mock: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>,
	run: () => Promise<void>
) {
	const original = globalThis.fetch;
	Reflect.set(globalThis, "fetch", mock);
	try {
		await run();
	} finally {
		globalThis.fetch = original;
	}
}

test("response schemas validate every answer and preserve selected probabilities", () => {
	assert.deepEqual(parseResponse(response(), jobs), {
		rows: [
			{
				path: "src/action.ts",
				start: 7,
				end: 9,
				coverage: "missing",
				category: "activation",
				priority: 2,
				coverageProbability: 0.8,
				categoryProbability: 0.6,
			},
		],
		inputTokens: 10,
		outputTokens: 3,
	});
	for (const answers of [
		{},
		{ ...response().answers, coverage_0: { choice: "invented" } },
		{
			...response().answers,
			category_0: { choice: "none", probabilities: { none: 1.2 } },
		},
		{ ...response().answers, priority_0: { score: 4 } },
		{ ...response().answers, priority_0: { score: 2, probabilities: [0.5] } },
	]) {
		assert.throws(() => parseResponse({ answers }, jobs));
	}
});

test("5xx and timeout retry twice, with complete attempt records and private headers", async () => {
	const state = options();
	let count = 0;
	await withFetch(
		async (url, init) => {
			assert.equal(url, "https://ai-gateway.vercel.sh/v4/ai/evaluation-model");
			assert.equal(
				new Headers(init?.headers).get("authorization"),
				"Bearer fixture-key"
			);
			assert.equal(
				new Headers(init?.headers).get("ai-model-id"),
				"typesafe-ai/jev"
			);
			assert.ok(init?.signal instanceof AbortSignal);
			count++;
			if (count === 1) {
				return Response.json(
					{ error: { type: "service_unavailable_error" } },
					{ status: 503, headers: { "x-request-id": "fixture:1" } }
				);
			}
			if (count === 2) {
				throw new DOMException("timeout fixture", "TimeoutError");
			}
			return Response.json(response());
		},
		async () => {
			assert.deepEqual(await requestEvaluation("{}", state.value), response());
		}
	);
	assert.deepEqual(
		state.attempts.map(({ attempt, status, error }) => ({
			attempt,
			status,
			error,
		})),
		[
			{ attempt: 1, status: 503, error: "HTTP 503" },
			{ attempt: 2, status: null, error: "timeout" },
			{ attempt: 3, status: 200, error: undefined },
		]
	);
	assert.equal(state.attempts[0]?.providerCode, "service_unavailable_error");
	assert.equal(state.attempts[0]?.requestId, "fixture:1");
	assert.equal(state.retries.length, 2);
});

test("exhausted 5xx, auth and rate limits stop at their exact attempt limits", async () => {
	for (const status of [503, 401, 403, 429]) {
		const state = options();
		await withFetch(
			async () =>
				Response.json(
					{ error: { code: "unsafe provider text fixture" } },
					{ status, headers: { "x-request-id": "invalid id" } }
				),
			async () => {
				await assert.rejects(
					requestEvaluation("{}", state.value),
					new RegExp(`Gateway HTTP ${status}`)
				);
			}
		);
		assert.equal(state.attempts.length, status === 503 ? 5 : 1);
		assert.equal(state.retries.length, status === 503 ? 4 : 0);
		assert.ok(
			state.attempts.every(
				(attempt) => !(attempt.providerCode || attempt.requestId)
			)
		);
	}
});

test("a per-minute rate limit waits for Retry-After and retries", async () => {
	const state = options();
	const sent: number[] = [];
	await withFetch(
		async () => {
			sent.push(performance.now());
			return sent.length === 1
				? new Response(null, { status: 429, headers: { "retry-after": "1" } })
				: Response.json(response());
		},
		async () => {
			assert.deepEqual(await requestEvaluation("{}", state.value), response());
		}
	);
	assert.deepEqual(
		state.attempts.map((attempt) => attempt.status),
		[429, 200]
	);
	assert.equal(state.retries[0]?.waitMs, 1000);
	assert.ok((sent[1] ?? 0) - (sent[0] ?? 0) >= 950);
});

test("provider error bodies are bounded and cancelled without retaining body text", async () => {
	let cancelled = false;
	const body =
		JSON.stringify({ error: { code: "invalid_api_key" } }).padEnd(4096, " ") +
		"private fixture tail";
	const state = options();
	await withFetch(
		async () =>
			new Response(
				new ReadableStream({
					start(controller) {
						controller.enqueue(new TextEncoder().encode(body));
					},
					cancel() {
						cancelled = true;
					},
				}),
				{ status: 401 }
			),
		async () => {
			await assert.rejects(
				requestEvaluation("{}", state.value),
				/Gateway HTTP 401/
			);
		}
	);
	assert.equal(cancelled, true);
	assert.equal(state.attempts[0]?.providerCode, "invalid_api_key");
	assert.ok(!JSON.stringify(state.attempts).includes("private fixture tail"));
});
