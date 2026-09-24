import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
	type Catalog,
	createRequest,
	parseResponse,
	requestEvaluation,
	type Attempt,
	type EvaluationOptions,
} from "./evaluate.js";

const jobs = [
	{ path: "src/action.ts", start: 7, end: 9, source: "await persist();\n" },
];
const catalog: Catalog = {
	attributeTracking: ['src/page.tsx:9 data-track="cta"'],
	directTrackingCandidates: ['src/covered.ts:2 track("saved")'],
	note: "Fixture catalog",
	trackedRoutes: [
		"links.create -> link_created (src/router.ts:4-20, trackedProcedure)",
	],
	trackingHelpers: ["saveDraft (src/save.ts:3) fires draft_saved"],
	warehouseWrites: [],
};
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

test("request JSON retains the original protocol and cache hash", () => {
	const body = createRequest(jobs, catalog);
	assert.equal(
		createHash("sha256").update(body).digest("hex"),
		"c7a1f7c03cfce0203937d8cbd8011912d942052afaa1213e45ef6ca3f2549883"
	);
	assert.deepEqual(JSON.parse(body).providerOptions, {
		gateway: { zeroDataRetention: true },
	});
});

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

test("Retry-After honors cancellation before another request starts", async () => {
	const controller = new AbortController();
	let waitMs = 0;
	const state = options({
		signal: controller.signal,
		onRetry(retry) {
			waitMs = retry.waitMs;
			controller.abort();
		},
	});
	await withFetch(
		async () =>
			new Response(null, { status: 503, headers: { "retry-after": "60" } }),
		async () => {
			await assert.rejects(requestEvaluation("{}", state.value), {
				name: "AbortError",
			});
		}
	);
	assert.equal(waitMs, 60_000);
	assert.equal(state.attempts.length, 1);
});

test("cancellation aborts the fetch and does not retry", async () => {
	const controller = new AbortController();
	const state = options({ signal: controller.signal });
	await withFetch(
		async (_url, init) =>
			new Promise((_resolve, reject) => {
				init?.signal?.addEventListener(
					"abort",
					() => reject(init.signal?.reason),
					{ once: true }
				);
				controller.abort();
			}),
		async () => {
			await assert.rejects(requestEvaluation("{}", state.value), {
				name: "AbortError",
			});
		}
	);
	assert.equal(state.attempts.length, 1);
	assert.equal(state.attempts[0]?.error, "interrupted");
	assert.equal(state.retries.length, 0);
});

test("a timeout while consuming a successful response body still retries", async () => {
	const state = options({ timeoutMs: 5 });
	const keepAlive = setTimeout(() => {}, 1000);
	try {
		await withFetch(
			async (_url, init) =>
				new Response(
					new ReadableStream({
						start(controller) {
							init?.signal?.addEventListener(
								"abort",
								() =>
									controller.error(
										new DOMException("fixture stream aborted", "AbortError")
									),
								{ once: true }
							);
						},
					})
				),
			async () => {
				await assert.rejects(requestEvaluation("{}", state.value), {
					name: "TimeoutError",
				});
			}
		);
	} finally {
		clearTimeout(keepAlive);
	}
	assert.equal(state.attempts.length, 5);
	assert.equal(state.retries.length, 4);
	assert.ok(
		state.attempts.every(
			(attempt) => attempt.status === 200 && attempt.error === "timeout"
		)
	);
});
