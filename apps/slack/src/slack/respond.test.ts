import { describe, expect, it } from "bun:test";
import { DatabuddyAgentUserError } from "@databuddy/ai/agent/errors";
import type { DatabuddyAgentClient } from "@/agent/agent-client";
import { SLACK_COPY } from "@/slack/messages";
import { streamAgentToSlack } from "@/slack/respond";
import type { SlackAgentClient } from "@/slack/types";

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
			opts.chunks !== undefined
				? "chunks"
				: opts.markdown_text !== undefined
					? "text"
					: null;
		if (callMode && streamMode && callMode !== streamMode) {
			throw new SlackApiError("streaming_mode_mismatch");
		}
	};

	const client: Pick<SlackAgentClient, "chat"> = {
		chat: {
			appendStream: async (options) => {
				guardMode(options);
				calls.push({ method: "chat.appendStream", options });
				return { ok: true };
			},
			startStream: async (options) => {
				calls.push({ method: "chat.startStream", options });
				if (startTs === null) return { ok: false, error: "not_allowed" };
				const opts = options as { chunks?: unknown; markdown_text?: unknown };
				streamMode = opts.chunks !== undefined ? "chunks" : "text";
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
	it("shows a thinking indicator then streams the answer", async () => {
		const originalDateNow = Date.now;
		let now = 0;
		const { calls, client } = createStreamClient();
		const agent: Pick<DatabuddyAgentClient, "stream"> = {
			async *stream() {
				now = 1000;
				yield "Traffic is up 12%.";
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
				chunks: [{ text: "Traffic is up 12%.", type: "markdown_text" }],
			}),
		});
		expect(calls[2].options).not.toHaveProperty("markdown_text");

		expect(calls.map((c) => c.method)).toEqual([
			"chat.startStream",
			"chat.appendStream",
			"chat.appendStream",
			"chat.stopStream",
		]);
	});

	it("does not append a failure message after a partial answer streamed", async () => {
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
		expect(stopCall?.options).not.toHaveProperty("markdown_text");
		expect(JSON.stringify(calls)).not.toContain(SLACK_COPY.agentFailure);
	});

	it("surfaces user-facing agent errors in the stream", async () => {
		const { calls, client } = createStreamClient();
		const agent: Pick<DatabuddyAgentClient, "stream"> = {
			async *stream() {
				throw new DatabuddyAgentUserError({
					code: "agent_credits_exhausted",
					message:
						"You're out of Databunny credits this month. Upgrade or wait for the monthly reset.",
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
				JSON.stringify(c.options).includes('"error"'),
		);
		expect(thinkingResolve).toBeDefined();

		const stopCall = calls.find((c) => c.method === "chat.stopStream");
		expect(getChunkText(stopCall?.options)).toBe(
			"You're out of Databunny credits this month. Upgrade or wait for the monthly reset.",
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

	it("does not stream dashboard component JSON into Slack", async () => {
		const { calls, client } = createStreamClient();
		const agent: Pick<DatabuddyAgentClient, "stream"> = {
			async *stream() {
				yield "Here are the top pages:\n";
				yield JSON.stringify({
					type: "data-table",
					title: "Top Pages",
					columns: ["Page", "Visitors"],
					rows: [["/", 1500]],
				});
			},
		};

		await streamAgentToSlack({
			agent,
			client,
			logger: silentLogger,
			run: baseRun(),
			say: async () => {},
		});

		const sentText = calls
			.map((call) => getChunkText(call.options))
			.filter((value): value is string => typeof value === "string")
			.join("\n");
		expect(sentText).toContain("*Top Pages*");
		expect(sentText).toContain("1,500");
		expect(sentText).not.toContain('"type"');
		expect(sentText).not.toContain('"rows"');
	});
});

function getChunkText(value: unknown): string | undefined {
	if (!isRecord(value) || !Array.isArray(value.chunks)) {
		return undefined;
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
