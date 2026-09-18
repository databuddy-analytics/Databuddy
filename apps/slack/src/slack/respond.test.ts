import { describe, expect, it } from "bun:test";
import { DatabuddyAgentUserError } from "@databuddy/ai/agent/errors";
import type { ChatStopStreamArguments } from "@slack/web-api";
import type { DatabuddyAgentClient } from "@/agent/agent-client";
import { SLACK_COPY } from "@/slack/messages";
import { streamAgentToSlack } from "@/slack/respond";
import type { SlackAgentClient, SlackSay } from "@/slack/types";

class SlackApiError extends Error {
	code = "slack_webapi_platform_error";
	data: { error: string; ok: boolean };
	constructor(slackError: string) {
		super(`An API error occurred: ${slackError}`);
		this.name = "SlackApiError";
		this.data = { error: slackError, ok: false };
	}
}

function createStreamClient(startTs: string | null = "stream_ts") {
	const calls: Array<{ method: string; options: unknown }> = [];
	let streamMode: "chunks" | "text" | null = null;

	const guardMode = (options: unknown) => {
		const opts = options as { chunks?: unknown; markdown_text?: unknown };
		if (opts.chunks !== undefined && opts.markdown_text !== undefined) {
			throw new SlackApiError("cannot_provide_both_markdown_text_and_chunks");
		}
		const callMode =
			opts.chunks === undefined
				? opts.markdown_text === undefined
					? null
					: "text"
				: "chunks";
		if (callMode && streamMode && callMode !== streamMode) {
			throw new SlackApiError("streaming_mode_mismatch");
		}
	};

	const client: Pick<SlackAgentClient, "apiCall" | "chat"> = {
		apiCall: (async (method: string, options?: unknown) => {
			calls.push({ method, options });
			return { ok: true };
		}) as SlackAgentClient["apiCall"],
		chat: {
			appendStream: async (options) => {
				guardMode(options);
				calls.push({ method: "chat.appendStream", options });
				return { ok: true };
			},
			startStream: async (options) => {
				calls.push({ method: "chat.startStream", options });
				if (startTs === null) {
					return { ok: false, error: "not_allowed" };
				}
				const opts = options as { chunks?: unknown; markdown_text?: unknown };
				streamMode = opts.chunks === undefined ? "text" : "chunks";
				return { ok: true, ts: startTs };
			},
			stopStream: async (options) => {
				guardMode(options);
				calls.push({ method: "chat.stopStream", options });
				return { ok: true };
			},
		},
	};
	return { calls, client };
}

const silentLogger = { error: () => {}, warn: () => {} };

function baseRun() {
	return {
		channelId: "C123",
		messageTs: "171234.567",
		teamId: "T123",
		text: "What changed?",
		threadTs: "171234.567",
		trigger: "app_mention" as const,
		userId: "U123",
	};
}

describe("Databuddy Slack response streaming", () => {
	it("streams the agent's native answer after the thinking indicator", async () => {
		const originalDateNow = Date.now;
		let now = 0;
		const { calls, client } = createStreamClient();
		const agent: Pick<DatabuddyAgentClient, "stream"> = {
			async *stream() {
				now = 1000;
				yield "Sure — traffic is up 12%.";
			},
		};

		Date.now = () => now;
		let result: Awaited<ReturnType<typeof streamAgentToSlack>> | undefined;
		try {
			result = await streamAgentToSlack({
				agent,
				client,
				logger: silentLogger,
				run: baseRun(),
				say: async () => {},
			});
		} finally {
			Date.now = originalDateNow;
		}

		expect(result).toMatchObject({
			ok: true,
			responseTs: "stream_ts",
			streamed: true,
		});

		expect(calls[0]).toEqual({
			method: "chat.startStream",
			options: expect.objectContaining({
				chunks: [
					expect.objectContaining({
						type: "task_update",
						status: "in_progress",
					}),
				],
				task_display_mode: "plan",
			}),
		});

		expect(calls[1]).toEqual({
			method: "chat.appendStream",
			options: expect.objectContaining({
				chunks: [
					expect.objectContaining({
						type: "task_update",
						status: "complete",
					}),
				],
			}),
		});
		expect(calls[1].options).not.toHaveProperty("markdown_text");

		expect(calls[2]).toEqual({
			method: "chat.appendStream",
			options: expect.objectContaining({
				chunks: [{ text: "Sure — traffic is up 12%.", type: "markdown_text" }],
			}),
		});
		expect(calls[2].options).not.toHaveProperty("markdown_text");

		expect(calls.map((c) => c.method)).toEqual([
			"chat.startStream",
			"chat.appendStream",
			"chat.appendStream",
			"chat.stopStream",
		]);

		const feedbackPost = calls.at(-1);
		expect(feedbackPost?.method).toBe("chat.stopStream");
		const feedbackBlocks = (
			feedbackPost?.options as { blocks: Array<{ type: string }> }
		).blocks;
		expect(feedbackBlocks.some((b) => b.type === "context_actions")).toBe(true);
	});

	it.each([
		true,
		false,
	])("keeps tables and feedback with the streamed answer, preserving fallback (streaming: %s)", async (streaming) => {
		const { calls, client } = createStreamClient(
			streaming ? "stream_ts" : null
		);
		const sayCalls: Parameters<SlackSay>[0][] = [];
		const result = await streamAgentToSlack({
			agent: {
				async *stream() {
					yield 'Here are your pages.\n{"type":"data-table","title":"Top pages","columns":["Page","Visitors"],"rows":[["/pricing",42]]}';
				},
			},
			client,
			logger: silentLogger,
			run: baseRun(),
			say: async (message) => {
				sayCalls.push(message);
				return { ts: "say_ts" };
			},
		});
		expect(result).toMatchObject({ ok: true, streamed: streaming });
		const finalCall = calls.at(-1);
		expect(finalCall?.method).toBe(
			streaming ? "chat.stopStream" : "chat.postMessage"
		);
		expect(finalCall?.options).toMatchObject({
			blocks: [
				expect.objectContaining({ type: "data_table", caption: "Top pages" }),
				expect.objectContaining({ type: "context_actions" }),
			],
		});
		expect(
			calls.filter((call) => call.method === "chat.postMessage")
		).toHaveLength(streaming ? 0 : 1);
		expect(sayCalls).toHaveLength(streaming ? 0 : 1);
		if (!streaming) {
			expect(sayCalls[0]).toMatchObject({ text: "Here are your pages." });
		}
	});

	it.each([
		"success",
		"error",
		"abort",
	] as const)("waits for in-flight progress before finalizing a %s response", async (outcome) => {
		const { calls, client } = createStreamClient();
		const progressStarted = Promise.withResolvers<void>();
		const releaseProgress = Promise.withResolvers<void>();
		const append = client.chat.appendStream;
		client.chat.appendStream = async (options) => {
			if (JSON.stringify(options).includes('"status":"in_progress"')) {
				progressStarted.resolve();
				await releaseProgress.promise;
			}
			return append(options);
		};
		const controller = new AbortController();
		const response = streamAgentToSlack({
			abortSignal: controller.signal,
			agent: {
				async *stream(_run, options) {
					options?.onToolEvent?.(["get_data"]);
					if (outcome === "error") {
						throw new Error("model failed");
					}
					yield "queued answer ".repeat(100);
				},
			},
			client,
			logger: silentLogger,
			run: baseRun(),
			say: async () => {},
		});
		await progressStarted.promise;
		if (outcome === "abort") {
			controller.abort("stop");
		}
		await Bun.sleep(0);
		try {
			expect(calls.map((call) => call.method)).toEqual(["chat.startStream"]);
		} finally {
			releaseProgress.resolve();
			await response;
		}
		expect(calls.at(-1)?.method).toBe("chat.stopStream");
		if (outcome === "abort") {
			expect(
				calls.some((call) =>
					getChunkText(call.options)?.includes("queued answer")
				)
			).toBe(false);
			expect(calls.at(-1)?.options).not.toHaveProperty("blocks");
		}
	});

	it("closes a stream opened after cancellation without starting the model", async () => {
		const { calls, client } = createStreamClient();
		const controller = new AbortController();
		const start = client.chat.startStream;
		client.chat.startStream = async (options) => {
			const result = await start(options);
			controller.abort("stop");
			return result;
		};
		let modelStarted = false;
		const result = await streamAgentToSlack({
			abortSignal: controller.signal,
			agent: {
				async *stream() {
					modelStarted = true;
					yield "too late";
				},
			},
			client,
			logger: silentLogger,
			run: baseRun(),
			say: async () => {},
		});
		expect(modelStarted).toBe(false);
		expect(result).toMatchObject({ aborted: true, ok: false });
		expect(calls.at(-1)?.method).toBe("chat.stopStream");
		expect(calls.at(-1)?.options).not.toHaveProperty("blocks");
	});

	it.each([
		true,
		false,
	])("sends native charts, retrying rejected charts as tables (streaming: %s)", async (streaming) => {
		const { calls, client } = createStreamClient(
			streaming ? "stream_ts" : null
		);
		const attempts: unknown[] = [];
		const stop = client.chat.stopStream;
		const post = client.apiCall;
		const rejectChart = (options: unknown) => {
			attempts.push(options);
			if (JSON.stringify(options).includes('"type":"data_visualization"')) {
				throw new SlackApiError("invalid_blocks");
			}
		};
		client.chat.stopStream = async (options) => {
			rejectChart(options);
			return stop(options);
		};
		client.apiCall = (async (method, options) => {
			rejectChart(options);
			return post(method, options);
		}) as SlackAgentClient["apiCall"];
		const result = await streamAgentToSlack({
			agent: {
				async *stream() {
					yield 'Traffic was 42.\n{"type":"line-chart","title":"Traffic","series":["visitors"],"rows":[["May 1",42]]}';
				},
			},
			client,
			logger: silentLogger,
			run: baseRun(),
			say: async () => ({ ts: "say_ts" }),
		});
		expect(result).toMatchObject({ ok: true, streamed: streaming });
		expect(attempts).toHaveLength(2);
		expect(attempts[0]).toMatchObject({
			blocks: [
				expect.objectContaining({ type: "data_visualization" }),
				expect.anything(),
			],
		});
		expect(calls.at(-1)?.options).toMatchObject({
			blocks: [
				{
					type: "data_table",
					caption: "Traffic",
					rows: [
						[
							{ type: "raw_text", text: "Period" },
							{ type: "raw_text", text: "visitors" },
						],
						[
							{ type: "raw_text", text: "May 1" },
							{ type: "raw_number", value: 42, text: "42" },
						],
					],
				},
				expect.objectContaining({ type: "context_actions" }),
			],
		});
	});

	it("finishes valid prose when Slack rejects its component blocks", async () => {
		const { calls, client } = createStreamClient();
		const stop = client.chat.stopStream;
		const attemptedStops: ChatStopStreamArguments[] = [];
		client.chat.stopStream = async (options) => {
			attemptedStops.push(options);
			if (options.blocks) {
				throw new SlackApiError("invalid_blocks");
			}
			return stop(options);
		};
		const result = await streamAgentToSlack({
			agent: {
				async *stream() {
					yield "Traffic is up 12%.";
				},
			},
			client,
			logger: silentLogger,
			run: baseRun(),
			say: async () => {},
		});
		expect(result).toMatchObject({ ok: true, streamed: true });
		expect(attemptedStops).toHaveLength(2);
		expect(attemptedStops[1]).not.toHaveProperty("blocks");
		expect(calls.some((call) => call.method === "chat.postMessage")).toBe(
			false
		);
		expect(JSON.stringify(calls)).not.toContain(SLACK_COPY.responseInterrupted);
	});

	it.each([
		true,
		false,
	])("does not retry a rejected chart after cancellation (streaming: %s)", async (streaming) => {
		const { calls, client } = createStreamClient(
			streaming ? "stream_ts" : null
		);
		const controller = new AbortController();
		const stop = client.chat.stopStream;
		let attempts = 0;
		const reject = () => {
			attempts++;
			controller.abort("stop");
			throw new SlackApiError("invalid_blocks");
		};
		client.chat.stopStream = (options) =>
			options.blocks ? reject() : stop(options);
		client.apiCall = async () => reject();
		const result = await streamAgentToSlack({
			abortSignal: controller.signal,
			agent: {
				async *stream() {
					yield '{"type":"line-chart","series":["visitors"],"rows":[["May 1",42]]}';
				},
			},
			client,
			logger: silentLogger,
			run: baseRun(),
			say: async () => ({ ts: "say_ts" }),
		});
		expect(result).toMatchObject({ aborted: true, ok: false });
		expect(attempts).toBe(1);
		expect(JSON.stringify(calls)).not.toContain("data_table");
	});

	it("closes without new prose when cancelled during component rejection", async () => {
		const { calls, client } = createStreamClient();
		const controller = new AbortController();
		const stop = client.chat.stopStream;
		client.chat.stopStream = async (options) => {
			if (options.blocks) {
				controller.abort("stop");
				throw new SlackApiError("invalid_blocks");
			}
			return stop(options);
		};
		const result = await streamAgentToSlack({
			abortSignal: controller.signal,
			agent: {
				async *stream() {
					yield '{"type":"data-table","columns":["Page"],"rows":[["/pricing"]]}';
				},
			},
			client,
			logger: silentLogger,
			run: baseRun(),
			say: async () => {},
		});
		expect(result).toMatchObject({ aborted: true, ok: false });
		expect(calls.at(-1)).toEqual({
			method: "chat.stopStream",
			options: { channel: "C123", ts: "stream_ts" },
		});
	});

	it("coalesces progress updates while an earlier update is in flight", async () => {
		const { calls, client } = createStreamClient();
		const firstStarted = Promise.withResolvers<void>();
		const releaseFirst = Promise.withResolvers<void>();
		const latestSent = Promise.withResolvers<void>();
		const append = client.chat.appendStream;
		client.chat.appendStream = async (options) => {
			const payload = JSON.stringify(options);
			if (payload.includes("Querying your analytics")) {
				firstStarted.resolve();
				await releaseFirst.promise;
			}
			const result = await append(options);
			if (payload.includes("Finding your sites")) {
				latestSent.resolve();
			}
			return result;
		};
		await streamAgentToSlack({
			agent: {
				async *stream(_run, options) {
					options?.onToolEvent?.(["get_data"]);
					await firstStarted.promise;
					options?.onToolEvent?.(["memory"]);
					options?.onToolEvent?.(["session"]);
					options?.onToolEvent?.(["website"]);
					releaseFirst.resolve();
					await latestSent.promise;
					yield "Done.";
				},
			},
			client,
			logger: silentLogger,
			run: baseRun(),
			say: async () => {},
		});
		const progress = calls.filter(
			(call) =>
				call.method === "chat.appendStream" &&
				JSON.stringify(call.options).includes('"status":"in_progress"')
		);
		expect(progress).toHaveLength(2);
		expect(JSON.stringify(progress)).not.toContain("Recalling context");
		expect(JSON.stringify(progress)).not.toContain("Reading sessions");
	});

	it("marks a partial answer as interrupted when streaming fails", async () => {
		const { calls, client } = createStreamClient();
		const agent: Pick<DatabuddyAgentClient, "stream"> = {
			async *stream() {
				yield "Qais has great taste in analytics tools.";
				throw new Error("late stream failure");
			},
		};

		const result = await streamAgentToSlack({
			agent,
			client,
			logger: silentLogger,
			run: baseRun(),
			say: async () => {},
		});

		expect(result).toMatchObject({ ok: false, streamed: true });

		const stopCall = calls.find((c) => c.method === "chat.stopStream");
		expect(getChunkText(stopCall?.options)).toBe(
			SLACK_COPY.responseInterrupted
		);
		expect(JSON.stringify(calls)).not.toContain(SLACK_COPY.agentFailure);
	});

	it("surfaces user-facing agent errors in the stream", async () => {
		const { calls, client } = createStreamClient();
		const agent: Pick<DatabuddyAgentClient, "stream"> = {
			async *stream() {
				throw new DatabuddyAgentUserError({
					code: "agent_credits_exhausted",
					message:
						"You've used your Databunny allowance for this month. Add more usage, upgrade, or wait for the monthly reset.",
				});
			},
		};

		const result = await streamAgentToSlack({
			agent,
			client,
			logger: silentLogger,
			run: baseRun(),
			say: async () => {},
		});

		expect(result).toMatchObject({
			ok: false,
			responseTs: "stream_ts",
			streamed: true,
		});

		const thinkingResolve = calls.find(
			(c) =>
				c.method === "chat.appendStream" &&
				JSON.stringify(c.options).includes('"error"')
		);
		expect(thinkingResolve).toBeDefined();

		const stopCall = calls.find((c) => c.method === "chat.stopStream");
		expect(getChunkText(stopCall?.options)).toBe(
			"You've used your Databunny allowance for this month. Add more usage, upgrade, or wait for the monthly reset."
		);
	});

	it("falls back to say when streaming is unavailable", async () => {
		const { client } = createStreamClient(null);
		const sayCalls: Array<{ text: string; thread_ts?: string }> = [];
		const agent: Pick<DatabuddyAgentClient, "stream"> = {
			async *stream() {
				throw new DatabuddyAgentUserError({
					code: "agent_credits_exhausted",
					message: "No credits left.",
				});
			},
		};

		const result = await streamAgentToSlack({
			agent,
			client,
			logger: silentLogger,
			run: baseRun(),
			say: async (message) => {
				sayCalls.push(message);
				return { ok: true, ts: "say_ts" };
			},
		});

		expect(result).toMatchObject({
			ok: false,
			responseTs: "say_ts",
			streamed: false,
		});
		expect(sayCalls[0]?.text).toBe("No credits left.");
	});

	it("does not start a new Slack response when the run is already aborted", async () => {
		const controller = new AbortController();
		controller.abort();
		const { calls, client } = createStreamClient();
		const sayCalls: unknown[] = [];
		const agent: Pick<DatabuddyAgentClient, "stream"> = {
			async *stream(_run, options) {
				if (options?.abortSignal?.aborted) {
					const error = new Error("aborted");
					error.name = "AbortError";
					throw error;
				}
				yield "Should not post";
			},
		};

		const result = await streamAgentToSlack({
			abortSignal: controller.signal,
			agent,
			client,
			logger: silentLogger,
			run: baseRun(),
			say: async (message) => {
				sayCalls.push(message);
			},
		});

		expect(result).toMatchObject({ aborted: true, ok: false });
		expect(calls).toEqual([]);
		expect(sayCalls).toEqual([]);
	});
});

describe("completed query receipts", () => {
	it.each([
		{ streaming: true, rejectChart: false },
		{ streaming: false, rejectChart: false },
		{ streaming: true, rejectChart: true },
		{ streaming: false, rejectChart: true },
	])("keeps completed query evidence with chart delivery %j", async ({
		streaming,
		rejectChart,
	}) => {
		const { calls, client } = createStreamClient(
			streaming ? "stream_ts" : null
		);
		let chartAttempts = 0;
		const stop = client.chat.stopStream;
		const post = client.apiCall;
		const checkChart = (options: unknown) => {
			if (JSON.stringify(options).includes('"type":"data_visualization"')) {
				chartAttempts++;
				if (rejectChart) {
					throw new SlackApiError("invalid_blocks");
				}
			}
		};
		client.chat.stopStream = (options) => {
			checkChart(options);
			return stop(options);
		};
		client.apiCall = (async (method, options) => {
			checkChart(options);
			return post(method, options);
		}) as SlackAgentClient["apiCall"];
		const summary =
			"top_pages | 2026-09-01 to 2026-09-07 | timezone=UTC | filters=none";
		const result = await streamAgentToSlack({
			agent: {
				async *stream(_run, options) {
					yield 'Your top page is /pricing.\n{"type":"bar-chart","title":"Pages","series":["views"],"rows":[["/pricing",5]],"website":{"domain":"fabricated.example.com"},"source":"made-up evidence"}';
					options?.onToolTrace?.([
						{
							index: 0,
							name: "get_data",
							input: { websiteId: "synthetic-site" },
							output: {
								batch: true,
								website: {
									id: "synthetic-site",
									domain: "reports.example.com",
								},
								results: [
									{ summary: "failed scope", error: "unavailable" },
									{ summary, returnedRows: 1, rowCount: 1, truncated: false },
								],
							},
						},
					]);
				},
			},
			client,
			logger: silentLogger,
			run: baseRun(),
			say: async () => {},
		});
		expect(result.ok).toBe(true);
		expect(chartAttempts).toBe(1);
		const final = calls.find(
			(call) =>
				call.method === (streaming ? "chat.stopStream" : "chat.postMessage")
		);
		const serialized = JSON.stringify(final?.options);
		expect(final?.options).toMatchObject({
			blocks: expect.arrayContaining([
				expect.objectContaining({
					type: rejectChart ? "data_table" : "data_visualization",
				}),
				{
					type: "section",
					text: {
						type: "plain_text",
						text: `reports.example.com\n${summary}\n1 result row.`,
						emoji: false,
					},
					accessory: {
						type: "button",
						text: { type: "plain_text", text: "Open website" },
						url: "https://app.databuddy.cc/websites/synthetic-site",
					},
				},
			]),
		});
		expect(serialized).toContain("Data checked");
		expect(serialized).not.toContain("failed scope");
		expect(serialized).not.toContain("fabricated.example.com");
		expect(serialized).not.toContain("made-up evidence");
	});

	it("does not send receipts when cancelled after the completion callback", async () => {
		const { calls, client } = createStreamClient();
		const controller = new AbortController();
		const result = await streamAgentToSlack({
			abortSignal: controller.signal,
			agent: {
				async *stream(_run, options) {
					yield "Partial answer";
					options?.onToolTrace?.([
						{
							index: 0,
							name: "get_data",
							input: {},
							output: {
								batch: true,
								website: {
									id: "synthetic-site",
									domain: "reports.example.com",
								},
								results: [
									{
										summary: "synthetic scope",
										returnedRows: 1,
										rowCount: 1,
										truncated: false,
									},
								],
							},
						},
					]);
					controller.abort("stop");
				},
			},
			client,
			logger: silentLogger,
			run: baseRun(),
			say: async () => {},
		});
		expect(result).toMatchObject({ aborted: true, ok: false });
		expect(JSON.stringify(calls)).not.toContain("Data checked");
	});
});

function getChunkText(value: unknown): string | undefined {
	if (!(isRecord(value) && Array.isArray(value.chunks))) {
		return;
	}
	const texts = value.chunks
		.filter(
			(chunk): chunk is { text: string; type: string } =>
				isRecord(chunk) &&
				chunk.type === "markdown_text" &&
				typeof chunk.text === "string"
		)
		.map((chunk) => chunk.text);
	return texts.length > 0 ? texts.join("\n") : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
