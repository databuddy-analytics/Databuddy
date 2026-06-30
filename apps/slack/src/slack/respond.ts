import { repairSlackReply, validateSlackReply } from "@databuddy/ai/agent";
import { isDatabuddyAgentUserError } from "@databuddy/ai/agent/errors";
import type { RequestLogger } from "evlog";
import type { DatabuddyAgentClient, SlackAgentRun } from "@/agent/agent-client";
import { getSlackApiErrorCode, setSlackLog, toError } from "@/lib/evlog-slack";
import { SLACK_COPY } from "@/slack/messages";
import { renderAgentOutputForSlack } from "@/slack/output-adapter";
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
	client: Pick<SlackAgentClient, "chat">;
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

	let pending = "";
	let fullText = "";
	let safeMarkdown = "";
	let chunkCount = 0;
	let convertedComponents = 0;
	let droppedComponents = 0;
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

	const renderIncremental = (streaming: boolean) => {
		const rendered = renderAgentOutputForSlack(fullText, { streaming });
		convertedComponents = rendered.convertedComponents;
		droppedComponents = rendered.droppedComponents;
		if (rendered.markdown.startsWith(safeMarkdown)) {
			pending += rendered.markdown.slice(safeMarkdown.length);
			safeMarkdown = rendered.markdown;
		}
	};

	try {
		for await (const chunk of agent.stream(run, { abortSignal })) {
			chunkCount++;
			fullText += chunk;
			renderIncremental(true);
			await flush(false);
		}
		renderIncremental(false);
		await flush(true);

		const rawFinalText = safeMarkdown.trim();
		const repaired = await maybeRepairReply({
			abortSignal,
			draft: rawFinalText,
			eventLog,
			logger,
		});
		const finalText = repaired.text;
		if (streamTs) {
			if (!thinkingResolved) {
				await resolveThinking(client, run.channelId, streamTs, "complete");
			}
			const result = await finishStreamedResponse({
				client,
				convertedComponents,
				droppedComponents,
				eventLog,
				finalText,
				run,
				chunkCount,
				startedAt,
				streamTs,
			});
			if (repaired.applied) {
				await replaceStreamedMessage({
					channelId: run.channelId,
					client,
					logger,
					text: finalText,
					ts: streamTs,
				});
			}
			return result;
		}
		return sendFinalMessage({
			convertedComponents,
			droppedComponents,
			eventLog,
			finalText,
			run,
			say,
			chunkCount,
			startedAt,
		});
	} catch (error) {
		if (streamTs && !thinkingResolved) {
			const status =
				abortSignal?.aborted ||
				isAbortError(error) ||
				isSlackUserCancellation(error)
					? "complete"
					: "error";
			await resolveThinking(client, run.channelId, streamTs, status);
		}

		if (abortSignal?.aborted || isAbortError(error)) {
			if (streamTs) {
				await flushAndStop(client, run.channelId, streamTs, pending, logger);
			}
			return abortedResult(safeMarkdown, chunkCount, streamTs);
		}

		if (isSlackUserCancellation(error)) {
			setSlackLog(eventLog, {
				slack_stream_cancelled: true,
				slack_stream_cancelled_code: getSlackApiErrorCode(error),
			});
			return abortedResult(safeMarkdown, chunkCount, streamTs);
		}

		logStreamError(error, eventLog, logger);
		renderIncremental(false);

		const partialText = safeMarkdown.trim();
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

function markdownChunk(text: string) {
	return { text, type: "markdown_text" as const };
}

interface MaybeRepairOptions {
	abortSignal?: AbortSignal;
	draft: string;
	eventLog?: RequestLogger;
	logger: LoggerLike;
}

async function maybeRepairReply({
	abortSignal,
	draft,
	eventLog,
	logger,
}: MaybeRepairOptions): Promise<{ applied: boolean; text: string }> {
	if (!draft) {
		return { applied: false, text: draft };
	}
	const validation = validateSlackReply(draft);
	if (validation.valid) {
		return { applied: false, text: draft };
	}
	setSlackLog(eventLog, {
		slack_reply_repair_issues: validation.issues.length,
		slack_reply_repair_issue_codes: validation.issues
			.map((i) => i.code)
			.join(","),
		slack_reply_repair_triggered: true,
	});
	try {
		const corrected = await repairSlackReply({
			abortSignal,
			draft,
			issues: validation.issues,
		});
		if (!(corrected && corrected !== draft)) {
			setSlackLog(eventLog, { slack_reply_repair_no_change: true });
			return { applied: false, text: draft };
		}
		const post = validateSlackReply(corrected);
		setSlackLog(eventLog, {
			slack_reply_repair_applied: true,
			slack_reply_repair_residual_issues: post.issues.length,
		});
		return { applied: true, text: corrected };
	} catch (error) {
		logger.warn("Failed to repair slack reply", toError(error));
		setSlackLog(eventLog, { slack_reply_repair_failed: true });
		return { applied: false, text: draft };
	}
}

async function replaceStreamedMessage({
	channelId,
	client,
	logger,
	text,
	ts,
}: {
	channelId: string;
	client: Pick<SlackAgentClient, "chat">;
	logger: LoggerLike;
	text: string;
	ts: string;
}): Promise<void> {
	try {
		await client.chat.update({
			channel: channelId,
			text,
			ts,
		});
	} catch (error) {
		logger.warn("Failed to update slack message with repaired text", error);
	}
}

function thinkingTaskChunk(status: "complete" | "error" | "in_progress") {
	return {
		id: THINKING_TASK_ID,
		status,
		title: SLACK_COPY.streamOpening,
		type: "task_update" as const,
	};
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
	convertedComponents: number;
	droppedComponents: number;
	eventLog?: RequestLogger;
	finalText: string;
	startedAt: number;
}

function logSuccess(
	{
		chunkCount,
		convertedComponents,
		droppedComponents,
		eventLog,
		finalText,
		startedAt,
	}: SuccessLogOptions,
	extra: Record<string, unknown>
) {
	setSlackLog(eventLog, {
		slack_answer_chars: finalText.length,
		slack_components_converted: convertedComponents,
		slack_components_dropped: droppedComponents,
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
			partialText ? undefined : failureText
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
		text: partialText || failureText,
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

function abortedResult(
	safeMarkdown: string,
	chunkCount: number,
	streamTs: string | null
): StreamAgentToSlackResult {
	return {
		aborted: true,
		answerChars: safeMarkdown.trim().length,
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

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isAbortError(error: unknown): boolean {
	return (
		(error instanceof DOMException && error.name === "AbortError") ||
		(error instanceof Error && error.name === "AbortError")
	);
}
