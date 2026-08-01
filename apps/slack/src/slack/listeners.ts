import { Assistant, type App } from "@slack/bolt";
import { and, db, desc, eq, or, sql } from "@databuddy/db";
import {
	insightObservations,
	insightRunEffects,
	insightRunItems,
} from "@databuddy/db/schema";
import { createRPCContext } from "@databuddy/rpc";
import { appendInvestigationReply } from "@databuddy/rpc/insights";
import type { DatabuddyAgentClient, SlackAgentRun } from "@/agent/agent-client";
import { createSlackEventLog } from "@/lib/evlog-slack";
import { abortSlackActiveRun } from "@/slack/active-runs";
import { getSlackChannelMentionPolicy } from "@/slack/channel-policy";
import { logSlackReactionFeedback } from "@/slack/feedback";
import type { SlackInstallationServices } from "@/slack/installations";
import {
	createRecentDedupe,
	isPlainChannelThreadFollowUp,
	isPlainDirectMessage,
	stripLeadingMention,
	toDeletedSlackMessage,
	toSlackMessage,
	toThreadTitle,
} from "@/slack/message-routing";
import { SLACK_COPY, SLACK_SUGGESTED_PROMPTS } from "@/slack/messages";
import { handleAgentRun } from "@/slack/run-handler";
import { createSlackConversationContext } from "@/slack/slack-context";
import {
	respondToBindCommand,
	respondToStatusCommand,
} from "@/slack/slash-commands";
import {
	slackThreadQueue,
	type SlackThreadQueueStore,
} from "@/slack/thread-queue";
import {
	slackThreadReplyGate,
	type SlackThreadReplyDecision,
	type SlackThreadReplyGate,
} from "@/slack/thread-relevance";
import type { SlackAgentClient, SlackLogger, SlackSay } from "@/slack/types";

export type SlackInvestigationReplyHandler = (options: {
	client: SlackAgentClient;
	installations: SlackInstallationServices;
	logger: SlackLogger;
	run: SlackAgentRun;
	say: SlackSay;
}) => Promise<boolean>;

function createDatabuddyAssistant({
	agent,
	dedupe,
	threadQueue,
}: {
	agent: Pick<DatabuddyAgentClient, "stream">;
	dedupe: ReturnType<typeof createRecentDedupe>;
	threadQueue: SlackThreadQueueStore;
}) {
	return new Assistant({
		threadContextChanged: async ({ logger, saveThreadContext }) => {
			try {
				await saveThreadContext();
			} catch (error) {
				logger.error(error);
			}
		},
		threadStarted: async ({
			logger,
			saveThreadContext,
			say,
			setSuggestedPrompts,
		}) => {
			try {
				await say(SLACK_COPY.assistantGreeting);
				await saveThreadContext();
				await setSuggestedPrompts({
					prompts: [...SLACK_SUGGESTED_PROMPTS],
					title: SLACK_COPY.suggestedPromptsTitle,
				});
			} catch (error) {
				logger.error(error);
			}
		},
		userMessage: async ({
			client,
			context,
			logger,
			message,
			say,
			setStatus,
			setTitle,
		}) => {
			const msg = toSlackMessage(message);
			const channelId = msg?.channel;
			const messageTs = msg?.ts;
			const text = msg?.text;
			const userId = msg?.user;
			if (!(text && channelId && messageTs && userId)) {
				return;
			}
			if (
				!dedupe.claim(
					[msg.team ?? "", channelId, msg.client_msg_id ?? messageTs].join(":")
				)
			) {
				return;
			}

			await setTitle(toThreadTitle(text));
			await setStatus({
				loading_messages: [SLACK_COPY.streamOpening],
				status: "is thinking...",
			});

			const run: SlackAgentRun = {
				channelId,
				messageTs,
				teamId: context.teamId,
				text,
				threadTs: msg.thread_ts ?? messageTs,
				trigger: "assistant",
				userId,
			};
			await threadQueue.markEngaged(run);
			await handleAgentRun({
				agent,
				client,
				threadQueue,
				logger,
				run,
				say,
			});
		},
	});
}

export function registerSlackListeners(
	app: App,
	agent: Pick<DatabuddyAgentClient, "stream">,
	installations: SlackInstallationServices,
	threadQueue: SlackThreadQueueStore = slackThreadQueue,
	threadReplyGate: SlackThreadReplyGate = slackThreadReplyGate,
	investigationReplyHandler: SlackInvestigationReplyHandler = handleInvestigationThreadReply
): void {
	const dedupe = createRecentDedupe();

	app.assistant(createDatabuddyAssistant({ agent, dedupe, threadQueue }));

	app.event(
		"app_mention",
		async ({ body, client, context, event, logger, say }) => {
			const threadTs = event.thread_ts ?? event.ts;
			const teamId = context.teamId ?? event.team;
			const text = stripLeadingMention(event.text ?? "").trim();
			if (!event.user) {
				return;
			}
			if (!text) {
				await say({
					text: SLACK_COPY.emptyMention,
					thread_ts: threadTs,
				});
				return;
			}

			const channelPolicy = await getSlackChannelMentionPolicy({
				channelId: event.channel,
				client,
				logger,
			});
			if (
				isExternalSlackConnectMention({
					channelPolicy,
					isExtSharedEvent: body.is_ext_shared_channel === true,
					sourceTeamId: getMentionSourceTeamId(event),
					teamId,
				})
			) {
				logChannelGate({
					channelId: event.channel,
					messageTs: event.ts,
					policyReason: "slack_connect_external_user",
					teamId,
					userId: event.user,
				});
				await say({
					text: SLACK_COPY.slackConnectExternalUser,
					thread_ts: threadTs,
				});
				return;
			}

			const readiness = await installations.getChannelReadiness({
				autoBind: channelPolicy.autoBind,
				channelId: event.channel,
				teamId,
			});
			if (!readiness.ok) {
				logChannelGate({
					channelId: event.channel,
					errorCode: channelPolicy.errorCode,
					messageTs: event.ts,
					policyReason: channelPolicy.reason,
					teamId,
					userId: event.user,
				});
				await say({
					text:
						channelPolicy.reason === "slack_connect"
							? SLACK_COPY.slackConnectNeedsBind
							: channelPolicy.reason === "missing_scope"
								? SLACK_COPY.missingSlackScopes
								: readiness.message,
					thread_ts: threadTs,
				});
				return;
			}

			const run: SlackAgentRun = {
				channelId: event.channel,
				messageTs: event.ts,
				teamId,
				text,
				threadTs,
				trigger: "app_mention",
				userId: event.user,
			};
			if (
				await investigationReplyHandler({
					client,
					installations,
					logger,
					run,
					say,
				})
			) {
				return;
			}
			if (!dedupe.claim([teamId ?? "", event.channel, event.ts].join(":"))) {
				return;
			}
			await threadQueue.markEngaged(run);
			await handleAgentRun({
				agent,
				client,
				threadQueue,
				logger,
				run,
				say,
			});
		}
	);

	app.message(async ({ client, context, logger, message, say }) => {
		const msg = toSlackMessage(message);
		const deletedMessage = toDeletedSlackMessage(msg);
		if (deletedMessage) {
			const teamId = context.teamId ?? deletedMessage.team;
			const queuedFollowUpRemoved = await threadQueue.removeDeletedFollowUp({
				channelId: deletedMessage.channel,
				messageTs: deletedMessage.deletedTs,
				teamId,
			});
			const activeRunAborted = abortSlackActiveRun({
				channelId: deletedMessage.channel,
				messageTs: deletedMessage.deletedTs,
				teamId,
			});
			createSlackEventLog({
				slack_active_run_aborted: activeRunAborted,
				slack_channel_id: deletedMessage.channel,
				slack_deleted_message_ts: deletedMessage.deletedTs,
				slack_event: "message_deleted",
				slack_followup_removed: queuedFollowUpRemoved,
				slack_team_id: teamId,
			}).emit();
			return;
		}

		if (isPlainDirectMessage(msg)) {
			if (
				!dedupe.claim(
					[msg.team ?? "", msg.channel, msg.client_msg_id ?? msg.ts].join(":")
				)
			) {
				return;
			}

			await handleAgentRun({
				agent,
				client,
				threadQueue,
				logger,
				run: {
					channelId: msg.channel,
					messageTs: msg.ts,
					teamId: context.teamId ?? msg.team,
					text: msg.text,
					threadTs: msg.thread_ts ?? msg.ts,
					trigger: "direct_message",
					userId: msg.user,
				},
				say,
			});
			return;
		}

		if (!isPlainChannelThreadFollowUp(msg)) {
			logMessageRouteSkipped({
				botUserId: context.botUserId,
				message: msg,
				reason: "not_thread_follow_up",
				teamId: context.teamId ?? msg?.team,
			});
			return;
		}

		if (mentionsBot(msg.text, context.botUserId)) {
			logMessageRouteSkipped({
				botUserId: context.botUserId,
				message: msg,
				reason: "app_mention_event_handles_bot_mention",
				teamId: context.teamId ?? msg.team,
			});
			return;
		}

		const teamId = context.teamId ?? msg.team;
		const sourceTeamId = msg.user_team ?? msg.source_team;
		if (sourceTeamId && teamId && sourceTeamId !== teamId) {
			logChannelGate({
				channelId: msg.channel,
				messageTs: msg.ts,
				policyReason: "slack_connect_external_user",
				teamId,
				userId: msg.user,
			});
			await say({
				text: SLACK_COPY.slackConnectExternalUser,
				thread_ts: msg.thread_ts,
			});
			return;
		}
		const run: SlackAgentRun = {
			channelId: msg.channel,
			messageTs: msg.ts,
			teamId,
			text: msg.text,
			threadTs: msg.thread_ts,
			trigger: "thread_follow_up",
			userId: msg.user,
		};
		if (
			await investigationReplyHandler({
				client,
				installations,
				logger,
				run,
				say,
			})
		) {
			return;
		}
		if (!dedupe.claim([teamId ?? "", msg.channel, msg.ts].join(":"))) {
			logMessageRouteSkipped({
				botUserId: context.botUserId,
				message: msg,
				reason: "duplicate",
				teamId,
			});
			return;
		}
		if (!(await threadQueue.isEngaged(run))) {
			logMessageRouteSkipped({
				botUserId: context.botUserId,
				message: msg,
				reason: "thread_not_engaged",
				teamId,
			});
			return;
		}

		const slackContext = createSlackConversationContext(client, run);
		const replyDecision = await threadReplyGate.shouldReply(run, {
			botUserId: context.botUserId,
			readThreadMessages: async () =>
				(await slackContext?.readCurrentThread?.())?.messages ?? [],
		});
		if (!replyDecision.shouldReply) {
			logThreadReplyIgnored({ decision: replyDecision, run });
			return;
		}

		await handleAgentRun({
			agent,
			client,
			threadQueue,
			logger,
			run: { ...run, slackContext },
			say,
		});
	});

	registerSlackCommands(app, installations);
	registerSlackReactionFeedback(app, installations);
}

async function handleInvestigationThreadReply({
	client,
	installations,
	logger,
	run,
	say,
}: Parameters<SlackInvestigationReplyHandler>[0]): Promise<boolean> {
	if (
		!(run.messageTs && run.teamId && run.threadTs) ||
		run.threadTs === run.messageTs
	) {
		return false;
	}
	const resolved = await installations.resolve(run);
	if (!resolved) {
		return false;
	}

	const [delivery] = await db
		.select({ insightId: insightObservations.insightId })
		.from(insightRunEffects)
		.innerJoin(
			insightRunItems,
			eq(insightRunEffects.runItemId, insightRunItems.id)
		)
		.innerJoin(
			insightObservations,
			and(
				eq(insightObservations.runId, insightRunItems.runId),
				eq(insightObservations.organizationId, insightRunItems.organizationId),
				eq(insightObservations.websiteId, insightRunItems.websiteId)
			)
		)
		.where(
			and(
				eq(insightRunEffects.externalId, run.threadTs),
				or(
					eq(insightRunEffects.effectKey, run.channelId),
					sql`${insightRunEffects.payload}->>'channelId' = ${run.channelId}`
				),
				or(
					sql`${insightRunEffects.payload}->>'insightId' = ${insightObservations.insightId}`,
					sql`${insightRunEffects.payload}->>'insightId' is null`
				),
				eq(insightRunEffects.status, "succeeded"),
				eq(insightRunItems.organizationId, resolved.organizationId)
			)
		)
		.orderBy(
			desc(insightRunEffects.completedAt),
			desc(insightObservations.createdAt)
		)
		.limit(1);
	if (!delivery?.insightId) {
		return false;
	}

	const replyId = [
		"slack",
		run.teamId,
		run.channelId,
		run.messageTs.replaceAll(".", "-"),
	].join("-");
	let response: { clientMessageId: string; text: string };
	try {
		const context = await createRPCContext(
			{ headers: new Headers() },
			{ apiKey: resolved.apiKey, session: null }
		);
		const { reply } = await appendInvestigationReply({
			authorName: "Slack teammate",
			body: run.text,
			context,
			insightId: delivery.insightId,
			replyId,
			slackDelivery: {
				channelId: run.channelId,
				threadTs: run.threadTs,
				type: "slack",
			},
		});
		if (reply.status === "succeeded") {
			return true;
		}
		response =
			reply.status === "failed"
				? {
						clientMessageId: `${replyId}-failure`,
						text: "I couldn't finish this investigation. Try replying again, or open it from the original message.",
					}
				: {
						clientMessageId: `${replyId}-ack`,
						text: "Continuing this investigation. I’ll post the result here when it’s ready.",
					};
	} catch (error) {
		logger.error("Failed to continue Slack investigation", error);
		response = {
			clientMessageId: `${replyId}-failure`,
			text: "I couldn't continue this investigation. Try replying again, or open it from the original message.",
		};
	}

	try {
		await client.apiCall("chat.postMessage", {
			channel: run.channelId,
			client_msg_id: response.clientMessageId,
			text: response.text,
			thread_ts: run.threadTs,
		});
	} catch (error) {
		logger.warn("Failed to acknowledge Slack investigation reply", error);
		await say({ text: response.text, thread_ts: run.threadTs });
	}
	return true;
}

function registerSlackCommands(
	app: App,
	installations: SlackInstallationServices
) {
	app.command("/databuddy-help", async ({ ack, respond }) => {
		await ack();
		await respond({ response_type: "ephemeral", text: SLACK_COPY.help });
	});

	app.command(
		"/databuddy-status",
		async ({ ack, command, logger, respond }) => {
			await ack();
			await respondToStatusCommand({ command, installations, logger, respond });
		}
	);

	app.command("/databuddy-bind", async ({ ack, command, logger, respond }) => {
		await ack();
		await respondToBindCommand({ command, installations, logger, respond });
	});

	// Keep the original command working for existing installations while new
	// manifests use the namespaced command.
	app.command("/bind", async ({ ack, command, logger, respond }) => {
		await ack();
		await respondToBindCommand({ command, installations, logger, respond });
	});
}

function registerSlackReactionFeedback(
	app: App,
	installations: SlackInstallationServices
) {
	for (const [eventName, action] of [
		["reaction_added", "added"],
		["reaction_removed", "removed"],
	] as const) {
		app.event(eventName, async ({ context, event, logger }) => {
			await logSlackReactionFeedback({
				action,
				botUserId: context.botUserId,
				event,
				installations,
				logger,
				teamId: context.teamId,
			});
		});
	}
}

function getMentionSourceTeamId(event: {
	source_team?: string;
	team?: string;
	user_team?: string;
}): string | undefined {
	return event.user_team ?? event.source_team ?? event.team;
}

function isExternalSlackConnectMention({
	channelPolicy,
	isExtSharedEvent,
	sourceTeamId,
	teamId,
}: {
	channelPolicy: { isExtShared?: boolean };
	isExtSharedEvent: boolean;
	sourceTeamId?: string;
	teamId?: string;
}): boolean {
	return Boolean(
		(channelPolicy.isExtShared || isExtSharedEvent) &&
			sourceTeamId &&
			teamId &&
			sourceTeamId !== teamId
	);
}

function logChannelGate({
	channelId,
	errorCode,
	messageTs,
	policyReason,
	teamId,
	userId,
}: {
	channelId: string;
	errorCode?: string;
	messageTs: string;
	policyReason: string;
	teamId?: string;
	userId: string;
}) {
	createSlackEventLog({
		slack_channel_gate_reason: policyReason,
		slack_channel_id: channelId,
		slack_channel_lookup_error: errorCode,
		slack_event: "channel_gate",
		slack_message_ts: messageTs,
		slack_team_id: teamId,
		slack_user_id: userId,
	}).emit();
}

function logThreadReplyIgnored({
	decision,
	run,
}: {
	decision: SlackThreadReplyDecision;
	run: SlackAgentRun;
}) {
	createSlackEventLog({
		slack_channel_id: run.channelId,
		slack_event: "thread_reply_gate",
		slack_message_ts: run.messageTs,
		slack_thread_reply_allowed: false,
		slack_thread_reply_confidence: decision.confidence,
		slack_thread_reply_reason: decision.reason,
		slack_thread_reply_source: decision.source,
		slack_thread_ts: run.threadTs,
		slack_trigger: run.trigger,
		slack_user_id: run.userId,
	}).emit();
}

function logMessageRouteSkipped({
	botUserId,
	message,
	reason,
	teamId,
}: {
	botUserId?: string;
	message: ReturnType<typeof toSlackMessage>;
	reason:
		| "app_mention_event_handles_bot_mention"
		| "duplicate"
		| "not_thread_follow_up"
		| "thread_not_engaged";
	teamId?: string;
}) {
	if (!shouldLogRouteSkip(message, botUserId)) {
		return;
	}

	createSlackEventLog({
		slack_channel_id: message?.channel,
		slack_channel_type: message?.channel_type,
		slack_event: "message_route_skip",
		slack_message_ts: message?.ts,
		slack_route_skip_reason: reason,
		slack_team_id: teamId,
		slack_text_length: message?.text?.length,
		slack_thread_ts: message?.thread_ts,
		slack_user_id: message?.user,
	}).emit();
}

function mentionsBot(text: string, botUserId?: string): boolean {
	return Boolean(botUserId && text.includes(`<@${botUserId}>`));
}

function shouldLogRouteSkip(
	message: ReturnType<typeof toSlackMessage>,
	botUserId?: string
): boolean {
	const text = message?.text;
	if (!(text && message.channel && message.ts && message.user)) {
		return false;
	}
	if (message.channel_type === "im" || message.subtype || message.bot_id) {
		return false;
	}
	const normalized = text.toLowerCase();
	return (
		normalized.includes("databuddy") ||
		normalized.includes("bunny") ||
		Boolean(botUserId && normalized.includes(`<@${botUserId.toLowerCase()}>`))
	);
}
