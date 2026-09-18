import type { RequestLogger } from "evlog";
import type {
	DatabuddyAgentClient,
	SlackAgentRun,
	SlackFollowUpMessage,
} from "@/agent/agent-client";
import {
	createSlackEventLog,
	getSlackApiErrorCode,
	setSlackLog,
	withSlackLogContext,
} from "@/lib/evlog-slack";
import {
	abortSlackThreadRun,
	cleanupSlackActiveRun,
	registerSlackActiveRun,
	trackSlackRunPromise,
} from "@/slack/active-runs";
import { isSlackStopCommand } from "@/slack/message-routing";
import { SLACK_COPY } from "@/slack/messages";
import { streamAgentToSlack } from "@/slack/respond";
import { createSlackConversationContext } from "@/slack/slack-context";
import type { SlackAgentClient, SlackLogger, SlackSay } from "@/slack/types";
import type { SlackThreadQueueStore } from "@/slack/thread-queue";

const QUEUED_TAKEOVER_RETRY_DELAYS_MS = [0, 25, 75] as const;
// Finish before the five-minute Redis lock expires.
const RUN_TIMEOUT_MS = 4 * 60 * 1000;

interface HandleAgentRunOptions {
	agent: Pick<DatabuddyAgentClient, "stream">;
	client: SlackAgentClient;
	logger: SlackLogger;
	run: SlackAgentRun;
	say: SlackSay;
	threadQueue: SlackThreadQueueStore;
}

export function handleAgentRun(options: HandleAgentRunOptions): Promise<void> {
	const runPromise = executeAgentRun(options);
	trackSlackRunPromise(runPromise);
	return runPromise;
}

async function executeAgentRun({
	agent,
	client,
	logger,
	run,
	say,
	threadQueue,
}: HandleAgentRunOptions): Promise<void> {
	const eventLog = createRunLog(run);
	const startedAt = performance.now();
	let lockAcquired = false;
	let registeredRun: SlackAgentRun | null = null;
	let runTimeout: ReturnType<typeof setTimeout> | null = null;
	let stopPoll: ReturnType<typeof setInterval> | null = null;

	await withSlackLogContext(eventLog, async () => {
		try {
			if (isSlackStopCommand(run.text)) {
				abortSlackThreadRun(run);
				await threadQueue.stop(run);
				await say({ text: SLACK_COPY.agentStopped, thread_ts: run.threadTs });
				return;
			}
			await threadQueue.markEngaged(run);
			lockAcquired = await threadQueue.tryAcquire(run);
			let currentRun: SlackAgentRun | undefined = run;
			if (!lockAcquired) {
				const queued = await threadQueue.enqueue(run);
				setSlackLog(eventLog, {
					slack_followup_queued: queued.ok,
					slack_followup_queue_reason: queued.reason,
					slack_followup_queue_size: queued.queuedCount,
					slack_followup_truncated: queued.truncated,
				});

				if (!queued.ok) {
					if (queued.reason === "stopped") {
						return;
					}
					await say({
						text:
							queued.reason === "queue_full"
								? SLACK_COPY.queueFull
								: SLACK_COPY.queueUnavailable,
						thread_ts: run.threadTs,
					});
					return;
				}

				lockAcquired = await tryAcquireQueuedRun(run, threadQueue);
				if (!lockAcquired) {
					return;
				}

				const followUps = await threadQueue.drain(run);
				if (followUps.length === 0) {
					return;
				}

				setSlackLog(eventLog, {
					slack_followup_takeover: true,
					slack_followup_takeover_count: followUps.length,
				});
				currentRun = createFollowUpRun(run, followUps);
			}

			const shutdownController = new AbortController();
			let controller = new AbortController();
			stopPoll = setInterval(() => {
				if (!registeredRun) {
					return;
				}
				const currentController = controller;
				threadQueue
					.isStopped(registeredRun)
					.then((stopped) => {
						if (stopped) {
							currentController.abort("stop");
						}
					})
					.catch(() => currentController.abort("coordination_error"));
			}, 500);
			let totalFollowUps = 0;
			while (!shutdownController.signal.aborted) {
				if (!currentRun) {
					const followUps = await threadQueue.drain(run);
					if (followUps.length === 0) {
						// Check emptiness and release atomically so a late arrival has an owner.
						if (await threadQueue.release(run, true)) {
							lockAcquired = false;
							break;
						}
						continue;
					}
					totalFollowUps += followUps.length;
					currentRun = createFollowUpRun(run, followUps);
				}
				if (await threadQueue.isStopped(currentRun)) {
					currentRun = undefined;
					continue;
				}
				if (!(await threadQueue.renew(run))) {
					throw new Error("Slack thread lock expired");
				}
				if (shutdownController.signal.aborted) {
					break;
				}
				if (registeredRun) {
					cleanupSlackActiveRun(registeredRun);
				}
				controller = new AbortController();
				if (runTimeout) {
					clearTimeout(runTimeout);
				}
				runTimeout = setTimeout(() => {
					setSlackLog(eventLog, { slack_run_timed_out: true });
					controller.abort("timeout");
				}, RUN_TIMEOUT_MS);
				registeredRun = currentRun;
				registerSlackActiveRun(currentRun, controller, shutdownController);
				await addTriggerReaction({ client, eventLog, logger, run: currentRun });
				currentRun = {
					...currentRun,
					slackContext:
						currentRun.slackContext ??
						createSlackConversationContext(client, currentRun),
				};
				const result = await streamAgentToSlack({
					abortSignal: controller.signal,
					agent,
					client,
					eventLog,
					logger,
					run: currentRun,
					say,
				});
				setSlackLog(eventLog, {
					slack_response_aborted: result.aborted,
					slack_response_ok: result.ok,
					slack_response_ts: result.responseTs,
					slack_response_streamed: result.streamed,
				});
				if (controller.signal.reason === "coordination_error") {
					throw new Error("Slack thread coordination failed");
				}
				currentRun = undefined;
			}

			if (totalFollowUps > 0) {
				setSlackLog(eventLog, {
					slack_followup_drained_count: totalFollowUps,
				});
			}
		} catch (error) {
			logger.error(error);
			await say({ text: SLACK_COPY.queueUnavailable, thread_ts: run.threadTs });
		} finally {
			if (stopPoll) {
				clearInterval(stopPoll);
			}
			if (runTimeout) {
				clearTimeout(runTimeout);
			}
			if (lockAcquired) {
				await threadQueue.release(run).catch((error) => {
					logger.warn("Failed to release Slack thread lock", error);
				});
			}
			cleanupSlackActiveRun(registeredRun ?? run);
			setSlackLog(eventLog, {
				"timing.slack_total_ms": Math.round(performance.now() - startedAt),
			});
			eventLog.emit();
		}
	});
}

async function tryAcquireQueuedRun(
	run: SlackAgentRun,
	threadQueue: SlackThreadQueueStore
): Promise<boolean> {
	for (const delayMs of QUEUED_TAKEOVER_RETRY_DELAYS_MS) {
		if (delayMs > 0) {
			await sleep(delayMs);
		}
		if (await threadQueue.tryAcquire(run)) {
			return true;
		}
	}

	return false;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function createFollowUpRun(
	baseRun: SlackAgentRun,
	followUps: SlackFollowUpMessage[]
): SlackAgentRun {
	const lastFollowUp = followUps.at(-1);
	return {
		...baseRun,
		followUpMessages: followUps,
		messageTs: lastFollowUp?.messageTs ?? baseRun.messageTs,
		requestTs: lastFollowUp?.requestTs ?? lastFollowUp?.messageTs,
		text: followUps.map((followUp) => followUp.text).join("\n"),
		trigger: "thread_follow_up",
		userId: lastFollowUp?.userId ?? baseRun.userId,
	};
}

function createRunLog(run: SlackAgentRun): RequestLogger {
	return createSlackEventLog({
		slack_channel_id: run.channelId,
		slack_event: "agent_run",
		slack_message_ts: run.messageTs,
		slack_team_id: run.teamId,
		slack_text_length: run.text.length,
		slack_thread_ts: run.threadTs,
		slack_trigger: run.trigger,
		slack_user_id: run.userId,
	});
}

async function addTriggerReaction({
	client,
	eventLog,
	logger,
	run,
}: {
	client: Pick<SlackAgentClient, "reactions">;
	eventLog: RequestLogger;
	logger: SlackLogger;
	run: SlackAgentRun;
}): Promise<void> {
	if (!run.messageTs) {
		return;
	}

	const startedAt = performance.now();
	try {
		await client.reactions.add({
			channel: run.channelId,
			name: SLACK_COPY.processingReaction,
			timestamp: run.messageTs,
		});
		setSlackLog(eventLog, {
			slack_reaction_added: true,
			"timing.slack_reaction_ms": Math.round(performance.now() - startedAt),
		});
	} catch (error) {
		const code = getSlackApiErrorCode(error) ?? "unknown";
		setSlackLog(eventLog, {
			slack_reaction_added: code === "already_reacted",
			slack_reaction_error: code,
			"timing.slack_reaction_ms": Math.round(performance.now() - startedAt),
		});
		if (code !== "already_reacted") {
			logger.warn("Failed to add Slack trigger reaction", code);
		}
	}
}
