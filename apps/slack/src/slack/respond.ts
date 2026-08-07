import { isRecord } from "@/lib/guards";
import { isDatabuddyAgentUserError } from "@databuddy/ai/agent/errors";
import type { RequestLogger } from "evlog";
import type { DatabuddyAgentClient, SlackAgentRun } from "@/agent/agent-client";
import { getSlackApiErrorCode, setSlackLog, toError } from "@/lib/evlog-slack";
import {
	ComponentStreamSplitter,
	componentsToBlocks,
	feedbackButtonsBlock,
} from "@/slack/blocks";
import { SLACK_COPY } from "@/slack/messages";
import type { SlackAgentClient } from "@/slack/types";

const STREAM_FLUSH_INTERVAL_MS = 900;
const STREAM_FLUSH_CHARS = 1200;
const STREAM_APPEND_LIMIT_CHARS = 3500;
const THINKING_TASK_ID = "thinking";

const SLACK_USER_CANCELLED_CODES = new Set([
	"message_not_found",
	"channel_not_found",
	"is_archived",
	"thread_not_found",
]);

function isSlackUserCancellation(error: unknown): boolean {
	const code = getSlackApiErrorCode(error);
	return Boolean(code && SLACK_USER_CANCELLED_CODES.has(code));
}

interface LoggerLike {
	error(...args: unknown[]): void;
	warn(...args: unknown[]): void;
}

type SayFn = (message: {
	text: string;
	thread_ts?: string;
}) => Promise<unknown>;

interface StreamAgentToSlackOptions {
	abortSignal?: AbortSignal;
	agent: Pick<DatabuddyAgentClient, "stream">;
	client: Pick<SlackAgentClient, "apiCall" | "chat">;
	eventLog?: RequestLogger;
	logger: LoggerLike;
	run: SlackAgentRun;
	say: SayFn;
}

export interface StreamAgentToSlackResult {
	aborted?: boolean;
	answerChars: number;
	chunks: number;
	ok: boolean;
	responseTs?: string;
	streamed: boolean;
}

export async function streamAgentToSlack({
	abortSignal,
	agent,
	client,
	eventLog,
	logger,
	run,
	say,
}: StreamAgentToSlackOptions): Promise<StreamAgentToSlackResult> {
	if (abortSignal?.aborted) {
		return {
			aborted: true,
			answerChars: 0,
			chunks: 0,
			ok: false,
			streamed: false,
		};
	}

	const startedAt = performance.now();

	const streamTs = run.threadTs
		? await startThinkingStream(client, run, logger, run.threadTs)
		: null;
	setSlackLog(eventLog, { slack_stream_started: Boolean(streamTs) });

	const splitter = new ComponentStreamSplitter();
	let pending = "";
	let fullText = "";
	let chunkCount = 0;
	let lastFlushAt = Date.now();
	let thinkingResolved = false;

	const flush = async (force = false) => {
		if (!(pending && streamTs)) {
			return;
		}
		if (
			!force &&
			pending.length < STREAM_FLUSH_CHARS &&
			Date.now() - lastFlushAt < STREAM_FLUSH_INTERVAL_MS
		) {
			return;
		}

		do {
			const text = pending.slice(0, STREAM_APPEND_LIMIT_CHARS);
			pending = pending.slice(text.length);
			lastFlushAt = Date.now();

			if (text.trim()) {
				if (!thinkingResolved) {
					await resolveThinking(client, run.channelId, streamTs, "complete");
					thinkingResolved = true;
				}
				await client.chat.appendStream({
					channel: run.channelId,
					chunks: [markdownChunk(text)],
					ts: streamTs,
				});
			}
		} while (force && pending);
	};

	const updateThinkingStatus = (toolNames: string[]) => {
		if (!streamTs || thinkingResolved) {
			return;
		}
		client.chat
			.appendStream({
				channel: run.channelId,
				chunks: [thinkingTaskChunk("in_progress", toolStatusLabel(toolNames))],
				ts: streamTs,
			})
			.catch(() => {
				// Progress updates are best-effort; the card keeps its last title.
			});
	};

	try {
		for await (const chunk of agent.stream(run, {
			abortSignal,
			onToolEvent: updateThinkingStatus,
		})) {
			chunkCount++;
			const prose = splitter.push(chunk);
			fullText += prose;
			pending += prose;
			await flush(false);
		}
		const tail = splitter.flush();
		fullText += tail.text;
		pending += tail.text;
		await flush(true);

		const finalText = fullText.trim();
		const componentBlocks = componentsToBlocks(tail.components);
		const trailingBlocks = [...componentBlocks, feedbackButtonsBlock()];
		setSlackLog(eventLog, {
			slack_component_count: tail.components.length,
			slack_block_count: componentBlocks.length,
		});
		if (streamTs) {
			if (!thinkingResolved) {
				await resolveThinking(client, run.channelId, streamTs, "complete");
			}
			const result = await finishStreamedResponse({
				client,
				eventLog,
				finalText,
				run,
				chunkCount,
				startedAt,
				streamTs,
			});
			await postComponentBlocks({
				blocks: trailingBlocks,
				client,
				logger,
				run,
			});
			return result;
		}
		const result = await sendFinalMessage({
			eventLog,
			finalText,
			run,
			say,
			chunkCount,
			startedAt,
		});
		await postComponentBlocks({ blocks: trailingBlocks, client, logger, run });
		return result;
	} catch (error) {
		const abortReason =
			abortSignal?.aborted && typeof abortSignal.reason === "string"
				? abortSignal.reason
				: undefined;
		if (streamTs && !thinkingResolved) {
			const status =
				abortReason !== "timeout" &&
				(abortSignal?.aborted ||
					isAbortError(error) ||
					isSlackUserCancellation(error))
					? "complete"
					: "error";
			await resolveThinking(client, run.channelId, streamTs, status);
		}

		if (abortSignal?.aborted || isAbortError(error)) {
			if (streamTs) {
				await flushAndStop(
					client,
					run.channelId,
					streamTs,
					pending,
					logger,
					abortStopText(abortReason)
				);
			}
			return abortedResult(fullText, chunkCount, streamTs);
		}

		if (isSlackUserCancellation(error)) {
			setSlackLog(eventLog, {
				slack_stream_cancelled: true,
				slack_stream_cancelled_code: getSlackApiErrorCode(error),
			});
			return abortedResult(fullText, chunkCount, streamTs);
		}

		logStreamError(error, eventLog, logger);

		const partialText = fullText.trim();
		const failureText = isDatabuddyAgentUserError(error)
			? error.message
			: SLACK_COPY.agentFailure;

		return recoverFromError({
			client,
			chunkCount,
			failureText,
			logger,
			partialText,
			pending,
			run,
			say,
			streamTs,
		});
	}
}

async function postComponentBlocks({
	blocks,
	client,
	logger,
	run,
}: {
	blocks: Record<string, unknown>[];
	client: Pick<SlackAgentClient, "apiCall">;
	logger: LoggerLike;
	run: SlackAgentRun;
}): Promise<void> {
	if (blocks.length === 0) {
		return;
	}
	try {
		await client.apiCall("chat.postMessage", {
			blocks,
			channel: run.channelId,
			text: SLACK_COPY.blockFallback,
			thread_ts: run.threadTs ?? run.messageTs,
		});
	} catch (error) {
		logger.warn("Failed to post Slack data blocks", error);
	}
}

function markdownChunk(text: string) {
	return { text, type: "markdown_text" as const };
}

function thinkingTaskChunk(
	status: "complete" | "error" | "in_progress",
	title: string = SLACK_COPY.streamOpening
) {
	return {
		id: THINKING_TASK_ID,
		status,
		title,
		type: "task_update" as const,
	};
}

const TOOL_STATUS_LABELS: [RegExp, string][] = [
	[/sql|get_data|describe_schema|discover_query/, "Querying your analytics..."],
	[/session|profile|interesting/, "Reading sessions..."],
	[/github/, "Checking recent code changes..."],
	[/scrape/, "Reading the page..."],
	[/search_console/, "Checking search data..."],
	[/memory/, "Recalling context..."],
	[/website/, "Finding your sites..."],
	[/create|update|delete|configure/, "Applying changes..."],
	[/investigation|insight/, "Reviewing investigations..."],
];

export function toolStatusLabel(toolNames: string[]): string {
	for (const name of toolNames) {
		const match = TOOL_STATUS_LABELS.find(([pattern]) => pattern.test(name));
		if (match) {
			return match[1];
		}
	}
	return "Working on it...";
}

async function startThinkingStream(
	client: Pick<SlackAgentClient, "chat">,
	run: SlackAgentRun,
	logger: LoggerLike,
	threadTs: string
): Promise<string | null> {
	try {
		const result = await client.chat.startStream({
			channel: run.channelId,
			chunks: [thinkingTaskChunk("in_progress")],
			recipient_team_id: run.teamId,
			recipient_user_id: run.userId,
			task_display_mode: "plan",
			thread_ts: threadTs,
		});

		if (
			isRecord(result) &&
			result.ok === true &&
			typeof result.ts === "string"
		) {
			return result.ts;
		}

		logger.warn(
			"Slack streaming unavailable",
			isRecord(result) && typeof result.error === "string"
				? result.error
				: undefined
		);
		return null;
	} catch (error) {
		logger.warn("Slack streaming failed to start", error);
		return null;
	}
}

async function resolveThinking(
	client: Pick<SlackAgentClient, "chat">,
	channelId: string,
	streamTs: string,
	status: "complete" | "error"
): Promise<void> {
	try {
		await client.chat.appendStream({
			channel: channelId,
			chunks: [thinkingTaskChunk(status)],
			ts: streamTs,
		});
	} catch {
		// Non-critical — thinking card stays unresolved
	}
}

interface SuccessLogOptions {
	chunkCount: number;
	eventLog?: RequestLogger;
	finalText: string;
	startedAt: number;
}

function logSuccess(
	{ chunkCount, eventLog, finalText, startedAt }: SuccessLogOptions,
	extra: Record<string, unknown>
) {
	setSlackLog(eventLog, {
		slack_answer_chars: finalText.length,
		slack_stream_chunks: chunkCount,
		"timing.slack_agent_response_ms": Math.round(performance.now() - startedAt),
		...extra,
	});
}

async function finishStreamedResponse(
	options: SuccessLogOptions & {
		client: Pick<SlackAgentClient, "chat">;
		run: SlackAgentRun;
		streamTs: string;
	}
): Promise<StreamAgentToSlackResult> {
	await options.client.chat.stopStream({
		channel: options.run.channelId,
		ts: options.streamTs,
		...(options.finalText
			? {}
			: { chunks: [markdownChunk(SLACK_COPY.noAnswer)] }),
	});
	logSuccess(options, { slack_streamed: true });
	return {
		answerChars: options.finalText.length,
		chunks: options.chunkCount,
		ok: true,
		responseTs: options.streamTs,
		streamed: true,
	};
}

async function sendFinalMessage(
	options: SuccessLogOptions & { run: SlackAgentRun; say: SayFn }
): Promise<StreamAgentToSlackResult> {
	const response = await options.say({
		text: options.finalText || SLACK_COPY.noAnswer,
		thread_ts: options.run.threadTs,
	});
	const responseTs = getMessageTs(response);
	logSuccess(options, {
		slack_response_ts: responseTs,
		slack_streamed: false,
	});
	return {
		answerChars: options.finalText.length,
		chunks: options.chunkCount,
		ok: true,
		responseTs,
		streamed: false,
	};
}

async function flushAndStop(
	client: Pick<SlackAgentClient, "chat">,
	channelId: string,
	streamTs: string,
	pending: string,
	logger: LoggerLike,
	stopText?: string
): Promise<void> {
	if (pending.trim()) {
		await client.chat
			.appendStream({
				channel: channelId,
				chunks: [markdownChunk(pending.slice(0, STREAM_APPEND_LIMIT_CHARS))],
				ts: streamTs,
			})
			.catch((e) => logger.warn("Failed to flush partial Slack stream", e));
	}
	await client.chat
		.stopStream({
			channel: channelId,
			ts: streamTs,
			...(stopText ? { chunks: [markdownChunk(stopText)] } : {}),
		})
		.catch((e) => logger.warn("Failed to stop Slack stream", e));
}

async function recoverFromError({
	client,
	chunkCount,
	failureText,
	logger,
	partialText,
	pending,
	run,
	say,
	streamTs,
}: {
	client: Pick<SlackAgentClient, "chat">;
	chunkCount: number;
	failureText: string;
	logger: LoggerLike;
	partialText: string;
	pending: string;
	run: SlackAgentRun;
	say: SayFn;
	streamTs: string | null;
}): Promise<StreamAgentToSlackResult> {
	if (streamTs) {
		await flushAndStop(
			client,
			run.channelId,
			streamTs,
			pending,
			logger,
			partialText ? SLACK_COPY.responseInterrupted : failureText
		);
		return {
			answerChars: partialText.length,
			chunks: chunkCount,
			ok: false,
			responseTs: streamTs,
			streamed: true,
		};
	}

	const response = await say({
		text: partialText
			? `${partialText}\n\n${SLACK_COPY.responseInterrupted}`
			: failureText,
		thread_ts: run.threadTs,
	});
	return {
		answerChars: partialText.length,
		chunks: chunkCount,
		ok: false,
		responseTs: getMessageTs(response),
		streamed: false,
	};
}

function logStreamError(
	error: unknown,
	eventLog: RequestLogger | undefined,
	logger: LoggerLike
): void {
	const userFacingError = isDatabuddyAgentUserError(error) ? error : null;
	const err = toError(error);
	const slackApiCode = getSlackApiErrorCode(error);

	setSlackLog(eventLog, {
		slack_agent_error_code: userFacingError?.code,
		slack_agent_error_message: err.message,
		slack_agent_error_name: err.name,
		slack_agent_error_user_facing: Boolean(userFacingError),
		slack_api_error_code: slackApiCode,
	});

	if (userFacingError) {
		logger.warn("Slack agent returned a user-facing error", err);
		eventLog?.warn(err.message, {
			agent_error_code: userFacingError.code,
			error_step: "agent_response",
		});
	} else if (slackApiCode) {
		logger.warn("Slack API rejected stream payload", err);
		eventLog?.warn(err.message, {
			error_step: "slack_api",
			slack_api_error_code: slackApiCode,
		});
	} else {
		logger.error("Slack agent response failed", err);
		eventLog?.error(err, { error_step: "agent_response" });
	}
}

function abortStopText(reason: string | undefined): string | undefined {
	if (reason === "timeout") {
		return SLACK_COPY.agentTimeout;
	}
	if (reason === "shutdown") {
		return SLACK_COPY.agentRestarted;
	}
	return;
}

function abortedResult(
	answer: string,
	chunkCount: number,
	streamTs: string | null
): StreamAgentToSlackResult {
	return {
		aborted: true,
		answerChars: answer.trim().length,
		chunks: chunkCount,
		ok: false,
		responseTs: streamTs ?? undefined,
		streamed: Boolean(streamTs),
	};
}

function getMessageTs(response: unknown): string | undefined {
	return isRecord(response) && typeof response.ts === "string"
		? response.ts
		: undefined;
}

function isAbortError(error: unknown): boolean {
	return (
		(error instanceof DOMException && error.name === "AbortError") ||
		(error instanceof Error && error.name === "AbortError")
	);
}
