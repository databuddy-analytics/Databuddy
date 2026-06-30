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
	cleanupSlackActiveRun,
	registerSlackActiveRun,
} from "@/slack/active-runs";
import { SLACK_COPY } from "@/slack/messages";
import { streamAgentToSlack } from "@/slack/respond";
import { createSlackConversationContext } from "@/slack/slack-context";
import type { SlackAgentClient, SlackLogger, SlackSay } from "@/slack/types";
import type { SlackThreadQueueStore } from "@/slack/thread-queue";

const MAX_FOLLOW_UP_ROUNDS = 3;
const QUEUED_TAKEOVER_RETRY_DELAYS_MS = [0, 25, 75] as const;

export async function handleAgentRun({
	agent,
	client,
	logger,
	run,
	say,
	threadQueue,
}: {
	agent: Pick<DatabuddyAgentClient, "stream">;
	client: SlackAgentClient;
	logger: SlackLogger;
	run: SlackAgentRun;
	say: SlackSay;
	threadQueue: SlackThreadQueueStore;
}): Promise<void> {
	const eventLog = createRunLog(run);
	const startedAt = performance.now();
	let lockAcquired = false;
	let abortController: AbortController | null = null;
	let registeredRun: SlackAgentRun | null = null;

	await withSlackLogContext(eventLog, async () => {
		try {
			await threadQueue.markEngaged(run);
			lockAcquired = await threadQueue.tryAcquire(run);
			let currentRun = run;
			if (!lockAcquired) {
				const queued = await threadQueue.enqueue(run);
				setSlackLog(eventLog, {
					slack_followup_queued: queued.ok,
					slack_followup_queue_reason: queued.reason,
					slack_followup_queue_size: queued.queuedCount,
					slack_followup_truncated: queued.truncated,
				});

				if (!queued.ok) {
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

			registeredRun = currentRun;
			abortController = registerSlackActiveRun(registeredRun);
			await addTriggerReaction({ client, eventLog, logger, run: currentRun });
			const slackContext =
				currentRun.slackContext ??
				createSlackConversationContext(client, currentRun);
			currentRun = { ...currentRun, slackContext };
			let totalFollowUps = 0;
			for (let round = 0; round <= MAX_FOLLOW_UP_ROUNDS; round++) {
				const result = await streamAgentToSlack({
					abortSignal: abortController?.signal,
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

				if (result.aborted || round >= MAX_FOLLOW_UP_ROUNDS) {
					break;
				}

				const followUps = await threadQueue.drain(run);
				if (followUps.length === 0) {
					break;
				}

				totalFollowUps += followUps.length;
				currentRun = createFollowUpRun(currentRun, followUps);
			}

			if (totalFollowUps > 0) {
				setSlackLog(eventLog, {
					slack_followup_drained_count: totalFollowUps,
				});
			}
		} finally {
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
