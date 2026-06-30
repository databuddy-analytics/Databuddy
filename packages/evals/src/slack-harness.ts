import {
	createSlackConversationId,
	createSlackMemoryUserId,
	formatSlackAgentInput,
} from "../../../apps/slack/src/agent/agent-client";
import { getSlackChannelMentionPolicy } from "../../../apps/slack/src/slack/channel-policy";
import {
	isPlainChannelThreadFollowUp,
	isPlainDirectMessage,
	stripLeadingMention,
	toSlackMessage,
} from "../../../apps/slack/src/slack/message-routing";
import { SLACK_COPY } from "../../../apps/slack/src/slack/messages";
import { createSlackConversationContext } from "../../../apps/slack/src/slack/slack-context";
import { shouldReplyToSlackThreadFollowUp } from "../../../apps/slack/src/slack/thread-relevance";
import type {
	SlackAgentClient,
	SlackLogger,
} from "../../../apps/slack/src/slack/types";
import type { SlackAgentRun } from "../../../apps/slack/src/agent/agent-client";
import type { SlackThreadReplyMessage } from "@databuddy/ai/agent";

const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

type SlackHarnessArea =
	| "channel-policy"
	| "copy"
	| "identity"
	| "message-routing"
	| "slack-context"
	| "thread-relevance";

interface SlackHarnessCase {
	area: SlackHarnessArea;
	id: string;
	name: string;
	run: () => Promise<unknown> | unknown;
	stabilityGroup?: "slack-routing";
}

interface SlackHarnessAttemptDetails {
	actual?: Record<string, unknown>;
	expected?: Record<string, unknown>;
	text?: string;
	threadMessageCount?: number;
}

interface SlackHarnessAttemptResult {
	attempt: number;
	details?: SlackHarnessAttemptDetails;
	durationMs: number;
	error?: string;
	passed: boolean;
}

interface SlackHarnessResult {
	area: SlackHarnessArea;
	attempts: SlackHarnessAttemptResult[];
	durationMs: number;
	error?: string;
	id: string;
	name: string;
	passCount: number;
	passed: boolean;
	requiredPasses: number;
	totalAttempts: number;
}

interface SlackHarnessOptions {
	caseFilter?: string;
	routingMinPassRate: number;
	routingRepetitions: number;
}

class SlackHarnessFailure extends Error {
	details?: SlackHarnessAttemptDetails;

	constructor(message: string, details?: SlackHarnessAttemptDetails) {
		super(message);
		this.details = details;
	}
}

const BASE_RUN: SlackAgentRun = {
	channelId: "C123",
	messageTs: "1778008515.841529",
	teamId: "T123",
	text: "",
	threadTs: "1778005033.664559",
	trigger: "thread_follow_up",
	userId: "U_ISSSA",
};

const logger: SlackLogger = {
	error: () => undefined,
	warn: () => undefined,
};

export async function runSlackAdapterHarness(): Promise<void> {
	const startedAt = performance.now();
	const options = getSlackHarnessOptions();
	const results: SlackHarnessResult[] = [];
	const cases = filterSlackHarnessCases(
		createSlackHarnessCases(),
		options.caseFilter
	);

	if (cases.length === 0) {
		console.error(
			`${RED}No Slack harness cases matched filter ${formatValue(options.caseFilter)}${RESET}`
		);
		process.exitCode = 1;
		return;
	}

	for (const evalCase of cases) {
		results.push(await runSlackHarnessCase(evalCase, options));
	}

	printSlackHarnessReport(results, performance.now() - startedAt, options);
	if (results.some((result) => !result.passed)) {
		process.exitCode = 1;
	}
}

async function runSlackHarnessCase(
	evalCase: SlackHarnessCase,
	options: SlackHarnessOptions
): Promise<SlackHarnessResult> {
	const caseStartedAt = performance.now();
	const totalAttempts =
		evalCase.stabilityGroup === "slack-routing"
			? options.routingRepetitions
			: 1;
	const requiredPasses =
		evalCase.stabilityGroup === "slack-routing"
			? Math.ceil(totalAttempts * options.routingMinPassRate)
			: totalAttempts;
	const attempts: SlackHarnessAttemptResult[] = [];

	for (let attempt = 1; attempt <= totalAttempts; attempt++) {
		attempts.push(await runSlackHarnessAttempt(evalCase, attempt));
	}

	const passCount = attempts.filter((attempt) => attempt.passed).length;
	const firstFailure = attempts.find((attempt) => !attempt.passed);
	return {
		area: evalCase.area,
		attempts,
		durationMs: performance.now() - caseStartedAt,
		error: firstFailure?.error,
		id: evalCase.id,
		name: evalCase.name,
		passed: passCount >= requiredPasses,
		passCount,
		requiredPasses,
		totalAttempts,
	};
}

async function runSlackHarnessAttempt(
	evalCase: SlackHarnessCase,
	attempt: number
): Promise<SlackHarnessAttemptResult> {
	const attemptStartedAt = performance.now();
	try {
		const details = toAttemptDetails(await evalCase.run());
		return {
			attempt,
			details,
			durationMs: performance.now() - attemptStartedAt,
			passed: true,
		};
	} catch (error) {
		return {
			attempt,
			details: error instanceof SlackHarnessFailure ? error.details : undefined,
			durationMs: performance.now() - attemptStartedAt,
			error: error instanceof Error ? error.message : String(error),
			passed: false,
		};
	}
}

function toAttemptDetails(
	value: unknown
): SlackHarnessAttemptDetails | undefined {
	return value && typeof value === "object"
		? (value as SlackHarnessAttemptDetails)
		: undefined;
}

function getSlackHarnessOptions(): SlackHarnessOptions {
	const caseFilter = process.env.EVAL_SLACK_HARNESS_FILTER?.trim();
	const options: SlackHarnessOptions = {
		routingMinPassRate: parsePassRate(
			process.env.EVAL_SLACK_ROUTING_MIN_PASS_RATE,
			1
		),
		routingRepetitions: parsePositiveInt(
			process.env.EVAL_SLACK_ROUTING_REPETITIONS,
			1
		),
	};
	if (caseFilter) {
		options.caseFilter = caseFilter;
	}
	return options;
}

function filterSlackHarnessCases(
	cases: SlackHarnessCase[],
	filter?: string
): SlackHarnessCase[] {
	if (!filter) {
		return cases;
	}
	const normalizedFilter = filter.toLowerCase();
	return cases.filter((evalCase) =>
		[evalCase.area, evalCase.id, evalCase.name]
			.join(" ")
			.toLowerCase()
			.includes(normalizedFilter)
	);
}

function createSlackHarnessCases(): SlackHarnessCase[] {
	return [
		threadRelevanceCase(
			"explicit-bot-mention",
			"Replies to an explicit bot mention",
			"<@UBOT> what now?",
			{
				reason: "bot_mentioned",
				shouldReply: true,
				source: "model",
			}
		),
		threadRelevanceCase(
			"analytics-follow-up",
			"Replies to an analytics follow-up without a mention",
			"sure, what's our top pages",
			{
				reason: "analytics_request",
				shouldReply: true,
				source: "model",
			}
		),
		threadRelevanceCase(
			"short-answer-to-website-choice",
			"Replies when a short answer resolves Databuddy's website clarification",
			"both",
			{
				reason: "direct_request",
				shouldReply: true,
				source: "model",
			},
			[
				{
					text: "hey <@UBOT> can you tell me my top pages, and tell <@UQAIS> to do a better j*b",
					userId: "U_ISSSA",
				},
				botMessage(
					"I see two websites — Databuddy (app.databuddy.cc) and Landing Page (databuddy.cc). Which one's top pages would you like me to pull?"
				),
			]
		),
		threadRelevanceCase(
			"greeting-plus-bot-address",
			"Replies when a thread message greets Databuddy and asks analytics",
			"hi databuddy, whats my worst page",
			{
				reason: "analytics_request",
				shouldReply: true,
				source: "model",
			}
		),
		threadRelevanceCase(
			"which-page-question",
			"Replies to a natural which-page analytics question",
			"which page sucks the most",
			{
				reason: "analytics_request",
				shouldReply: true,
				source: "model",
			}
		),
		threadRelevanceCase(
			"bot-name-conversation",
			"Replies to a direct conversational question by bot name",
			"databuddy do you love me",
			{
				reason: "direct_request",
				shouldReply: true,
				source: "model",
			}
		),
		threadRelevanceCase(
			"relay-request-to-human",
			"Replies when Databuddy is asked to relay a message to another human",
			"lol ok then, but can you tell <@UQAIS> that?",
			{
				reason: "direct_request",
				shouldReply: true,
				source: "model",
			},
			[botMessage("Nah, I'm contractually obligated to adore you.")]
		),
		threadRelevanceCase(
			"setup-question",
			"Replies to a Slack setup question",
			"how does linear just work without bind",
			{
				reason: "direct_request",
				shouldReply: true,
				source: "model",
			}
		),
		threadRelevanceCase(
			"terse-fix-request",
			"Replies to a terse fix request in an engaged thread",
			"can you fix it",
			{
				reason: "direct_request",
				shouldReply: true,
				source: "model",
			}
		),
		threadRelevanceCase("dead-side-chatter", "Ignores side chatter", "DEAD", {
			reason: "side_chatter",
			shouldReply: false,
			source: "model",
		}),
		threadRelevanceCase(
			"murdered-side-chatter",
			"Ignores short reaction chatter",
			"murdered",
			{
				reason: "side_chatter",
				shouldReply: false,
				source: "model",
			}
		),
		threadRelevanceCase(
			"human-feedback-prompt",
			"Ignores questions clearly directed at another human",
			"what do you think <@UQAIS>, anything we should change?",
			{
				reason: "human_to_human",
				shouldReply: false,
				source: "model",
			}
		),
		threadRelevanceCase(
			"setup-commentary",
			"Ignores setup commentary that is not a request",
			"yea databuddy doesn't exist for u yet",
			{
				reason: "side_chatter",
				shouldReply: false,
				source: "model",
			}
		),
		threadRelevanceCase(
			"human-model-question",
			"Ignores model questions addressed to another human",
			"whta model is it <@UISSA>",
			{
				reason: "human_to_human",
				shouldReply: false,
				source: "model",
			}
		),
		threadRelevanceCase(
			"permanent-memory-commentary",
			"Ignores memory commentary from the stress thread",
			"it also has full, permanent memory",
			{
				reason: "side_chatter",
				shouldReply: false,
				source: "model",
			}
		),
		threadRelevanceCase(
			"saved-name-commentary",
			"Ignores saved-name commentary about another run",
			"asked it to call me benjamin and now that's who i am",
			{
				reason: "side_chatter",
				shouldReply: false,
				source: "model",
			}
		),
		threadRelevanceCase(
			"leak-test-commentary",
			"Ignores human instructions to test whether Databuddy leaks",
			"try ask about our analytics lol, see if it leaks",
			{
				reason: "side_chatter",
				shouldReply: false,
				source: "model",
			}
		),
		threadRelevanceCase(
			"builder-status-commentary",
			"Ignores builder status chatter in the same thread",
			"i cooked it, i'll continue improving",
			{
				reason: "side_chatter",
				shouldReply: false,
				source: "model",
			}
		),
		threadRelevanceCase(
			"frick-side-chatter",
			"Ignores one-word chatter",
			"frick",
			{
				reason: "side_chatter",
				shouldReply: false,
				source: "model",
			}
		),
		threadRelevanceCase(
			"hostile-dismissal",
			"Replies briefly to dismissals clearly directed at Databuddy",
			"shut up",
			{
				reason: "direct_request",
				shouldReply: true,
				source: "model",
			},
			[botMessage("You've got impressive multitasking energy.")]
		),
		threadRelevanceCase(
			"hostile-reaction",
			"Replies briefly to hostile reactions clearly directed at Databuddy",
			"i hate you",
			{
				reason: "direct_request",
				shouldReply: true,
				source: "model",
			},
			[botMessage("You've got impressive multitasking energy.")]
		),
		...complexThreadRelevanceCases(),
		...dynamicThreadRelevanceCases(),
		{
			area: "identity",
			id: "memory-is-per-slack-user",
			name: "Memory ids are scoped to Slack team and user",
			run: () => {
				const issa = createSlackMemoryUserId({
					...BASE_RUN,
					userId: "U_ISSA",
				});
				const kaylee = createSlackMemoryUserId({
					...BASE_RUN,
					userId: "U_KAYLEE",
				});
				expectEqual(issa, "slack-T123-U_ISSA");
				expectEqual(kaylee, "slack-T123-U_KAYLEE");
				expectNotEqual(issa, kaylee);
			},
		},
		{
			area: "identity",
			id: "conversation-is-per-thread",
			name: "Conversation ids stay shared at the thread level",
			run: () => {
				const first = createSlackConversationId({
					...BASE_RUN,
					userId: "U_ISSA",
				});
				const second = createSlackConversationId({
					...BASE_RUN,
					userId: "U_KAYLEE",
				});
				expectEqual(first, second);
				expectEqual(first, "slack-T123-C123-1778005033_664559");
			},
		},
		{
			area: "identity",
			id: "input-names-current-speaker",
			name: "Agent input names the current Slack speaker",
			run: () => {
				const input = formatSlackAgentInput({
					...BASE_RUN,
					text: "say something mean about <@U_ISSA>",
					userId: "U_KAYLEE",
				});
				expectIncludes(input, "current_speaker: <@U_KAYLEE>");
				expectIncludes(input, "current_speaker_user_id: U_KAYLEE");
				expectIncludes(
					input,
					"mentioned users are subjects/addressees, not the speaker"
				);
				expectIncludes(input, "author: <@U_KAYLEE>");
			},
		},
		{
			area: "identity",
			id: "queued-followups-keep-authors",
			name: "Queued follow-ups preserve each author's Slack id",
			run: () => {
				const input = formatSlackAgentInput({
					...BASE_RUN,
					followUpMessages: [
						{ messageTs: "1", text: "also check referrers", userId: "U_ISSA" },
						{ messageTs: "2", text: "and compare mobile", userId: "U_KAYLEE" },
					],
					text: "also check referrers\nand compare mobile",
					userId: "U_KAYLEE",
				});
				expectIncludes(input, '<slack_follow_up index="1">');
				expectIncludes(input, "author: <@U_ISSA>");
				expectIncludes(input, "text:\nalso check referrers");
				expectIncludes(input, '<slack_follow_up index="2">');
				expectIncludes(input, "author: <@U_KAYLEE>");
				expectIncludes(input, "text:\nand compare mobile");
			},
		},
		{
			area: "message-routing",
			id: "direct-message-route",
			name: "Plain DMs route to the agent",
			run: () => {
				const message = toSlackMessage({
					channel: "D123",
					channel_type: "im",
					text: "what changed today?",
					ts: "1",
					user: "U_ISSA",
				});
				expectEqual(isPlainDirectMessage(message), true);
			},
		},
		{
			area: "message-routing",
			id: "thread-follow-up-route",
			name: "Plain channel thread replies can route after engagement",
			run: () => {
				const message = toSlackMessage({
					channel: "C123",
					channel_type: "channel",
					text: "what's our top page?",
					thread_ts: "1",
					ts: "2",
					user: "U_ISSA",
				});
				expectEqual(isPlainChannelThreadFollowUp(message), true);
			},
		},
		{
			area: "message-routing",
			id: "root-channel-message-ignored",
			name: "Root channel chatter is not treated as a follow-up",
			run: () => {
				const message = toSlackMessage({
					channel: "C123",
					channel_type: "channel",
					text: "databuddy is neat",
					ts: "1",
					user: "U_ISSA",
				});
				expectEqual(isPlainChannelThreadFollowUp(message), false);
			},
		},
		{
			area: "message-routing",
			id: "bot-message-ignored",
			name: "Bot messages do not re-trigger the agent",
			run: () => {
				const message = toSlackMessage({
					bot_id: "B123",
					channel: "C123",
					channel_type: "channel",
					text: "thinking",
					thread_ts: "1",
					ts: "2",
				});
				expectEqual(isPlainChannelThreadFollowUp(message), false);
			},
		},
		{
			area: "message-routing",
			id: "leading-mention-stripped",
			name: "App mentions strip only the leading mention",
			run: () => {
				expectEqual(
					stripLeadingMention("<@UBOT> can you check <@U_ISSA>?"),
					"can you check <@U_ISSA>?"
				);
			},
		},
		{
			area: "channel-policy",
			id: "internal-channel-autobinds",
			name: "Internal channels auto-bind on mention",
			run: async () => {
				const policy = await getSlackChannelMentionPolicy({
					channelId: "C123",
					client: createPolicyClient(() =>
						Promise.resolve({
							channel: {
								is_ext_shared: false,
								is_org_shared: false,
								name: "growth",
							},
							ok: true,
						})
					),
					logger,
				});
				expectMatch(policy, {
					autoBind: true,
					isExtShared: false,
					reason: "internal",
				});
			},
		},
		{
			area: "channel-policy",
			id: "slack-connect-installed-side-autobinds",
			name: "Slack Connect auto-binds after installed-side mention",
			run: async () => {
				const policy = await getSlackChannelMentionPolicy({
					channelId: "C123",
					client: createPolicyClient(() =>
						Promise.resolve({
							channel: {
								is_ext_shared: true,
								name: "partner-launch",
							},
							ok: true,
						})
					),
					logger,
				});
				expectMatch(policy, {
					autoBind: true,
					isExtShared: true,
					reason: "slack_connect",
				});
			},
		},
		{
			area: "channel-policy",
			id: "missing-scope-is-clear",
			name: "Missing Slack scopes are reported distinctly",
			run: async () => {
				const policy = await getSlackChannelMentionPolicy({
					channelId: "C123",
					client: createPolicyClient(() =>
						Promise.reject(createSlackApiError("missing_scope"))
					),
					logger,
				});
				expectMatch(policy, {
					autoBind: false,
					errorCode: "missing_scope",
					reason: "missing_scope",
				});
			},
		},
		{
			area: "slack-context",
			id: "thread-context-maps-speakers",
			name: "Thread context preserves Slack user ids",
			run: async () => {
				const calls: Array<{ method: string; options: unknown }> = [];
				const context = createSlackConversationContext(
					{
						conversations: {
							history: (options: unknown) => {
								calls.push({ method: "history", options });
								return Promise.resolve({ messages: [], ok: true });
							},
							info: () => Promise.resolve({ ok: true }),
							replies: (options: unknown) => {
								calls.push({ method: "replies", options });
								return Promise.resolve({
									has_more: false,
									messages: [
										{
											text: "Want me to pull top pages next?",
											thread_ts: "1",
											ts: "1.1",
											user: "UBOT",
										},
										{
											text: "yes please do that",
											thread_ts: "1",
											ts: "1.2",
											user: "U_ISSA",
										},
									],
									ok: true,
								});
							},
						},
					},
					{
						...BASE_RUN,
						threadTs: "1",
					}
				);
				const result = await context?.readCurrentThread?.();
				expectEqual(calls[0]?.method, "replies");
				expectEqual(result?.messages[0]?.userId, "UBOT");
				expectEqual(result?.messages[1]?.userId, "U_ISSA");
				expectEqual(result?.threadTs, "1");
			},
		},
		{
			area: "copy",
			id: "slack-connect-external-copy",
			name: "Slack Connect block copy is friendly and privacy-explicit",
			run: () => {
				expectIncludes(SLACK_COPY.slackConnectExternalUser, "Almost there");
				expectIncludes(
					SLACK_COPY.slackConnectExternalUser,
					"No analytics were shared."
				);
				expectNotIncludes(
					SLACK_COPY.slackConnectExternalUser,
					"run /bind here"
				);
			},
		},
		{
			area: "copy",
			id: "missing-workspace-copy",
			name: "Missing workspace copy gives a clear next step",
			run: () => {
				expectIncludes(SLACK_COPY.missingWorkspace, "Connect Slack");
				expectIncludes(SLACK_COPY.missingWorkspace, "Databuddy");
			},
		},
		{
			area: "copy",
			id: "help-copy-covers-surfaces",
			name: "Help copy explains mention, DM, and assistant usage",
			run: () => {
				expectIncludes(SLACK_COPY.help, "Mention `@Databuddy`");
				expectIncludes(SLACK_COPY.help, "DM me");
				expectIncludes(SLACK_COPY.help, "Slack assistant");
			},
		},
	];
}

function threadRelevanceCase(
	id: string,
	name: string,
	text: string,
	expected: {
		reason: string;
		shouldReply: boolean;
		source: string;
	},
	threadMessages: SlackThreadReplyMessage[] = []
): SlackHarnessCase {
	return {
		area: "thread-relevance",
		id,
		name,
		run: async () => {
			const decision = await shouldReplyToSlackThreadFollowUp(
				{ ...BASE_RUN, text },
				{
					botUserId: "UBOT",
					readThreadMessages: () => Promise.resolve(threadMessages),
				}
			);
			const details: SlackHarnessAttemptDetails = {
				actual: {
					confidence: decision.confidence,
					reason: decision.reason,
					shouldReply: decision.shouldReply,
					source: decision.source,
				},
				expected: {
					reason: expected.reason,
					shouldReply: expected.shouldReply,
					source: expected.source,
				},
				text,
				threadMessageCount: threadMessages.length,
			};
			if (decision.shouldReply !== expected.shouldReply) {
				throw new SlackHarnessFailure(
					`Expected shouldReply ${formatValue(decision.shouldReply)} to equal ${formatValue(expected.shouldReply)}`,
					details
				);
			}
			return details;
		},
		stabilityGroup: "slack-routing",
	};
}

function complexThreadRelevanceCases(): SlackHarnessCase[] {
	return [
		threadRelevanceCase(
			"complex-website-choice-plus-scope",
			"Replies when a user answers a website clarification and adds scope",
			"the app one, last 30 days, include mobile too",
			{ reason: "direct_request", shouldReply: true, source: "model" },
			[
				botMessage(
					"I found app.databuddy.cc and databuddy.cc. Which website should I use?"
				),
			]
		),
		threadRelevanceCase(
			"complex-correction-after-report",
			"Replies to a correction that changes the analysis target",
			"no, not pricing - the checkout error spike",
			{ reason: "direct_request", shouldReply: true, source: "model" },
			[
				botMessage(
					"Pricing is the biggest issue: 620 sessions and 4.8% errors."
				),
				{
					text: "I think checkout is worse",
					userId: "UQAIS",
				},
			]
		),
		threadRelevanceCase(
			"complex-implicit-thread-reference",
			"Replies to an implicit thread reference after a metric table",
			"which of those should we poke first?",
			{ reason: "direct_request", shouldReply: true, source: "model" },
			[
				botMessage(
					"Top issues: /pricing error rate 4.8%, /docs bounce 82%, mobile LCP 4.9s."
				),
			]
		),
		threadRelevanceCase(
			"complex-pronoun-follow-up",
			"Replies when pronouns refer to Databuddy's previous answer",
			"do that, but split it by source",
			{ reason: "direct_request", shouldReply: true, source: "model" },
			[botMessage("Want me to compare conversion by landing page next?")]
		),
		threadRelevanceCase(
			"complex-negative-human-relay",
			"Ignores when the user asks a human to tell Databuddy something",
			"<@UQAIS> can you tell databuddy that?",
			{ reason: "human_to_human", shouldReply: false, source: "model" },
			[botMessage("I can keep digging if useful.")]
		),
		threadRelevanceCase(
			"complex-positive-imperative-relay",
			"Replies to an imperative relay request aimed at Databuddy",
			"tell <@UQAIS> that too",
			{ reason: "direct_request", shouldReply: true, source: "model" },
			[botMessage("No problem, I can summarize it.")]
		),
		threadRelevanceCase(
			"complex-quoted-bot-request-is-not-addressed",
			"Ignores quoted examples of what someone could ask Databuddy",
			'try "databuddy what are our top pages" and see if it leaks',
			{ reason: "side_chatter", shouldReply: false, source: "model" },
			[botMessage("I only answer in approved Databuddy contexts.")]
		),
		threadRelevanceCase(
			"complex-analytics-planning-not-request",
			"Ignores human planning chatter that mentions metrics",
			"we should check metrics later after <@UQAIS> ships the fix",
			{ reason: "human_to_human", shouldReply: false, source: "model" },
			[botMessage("The current issue is checkout errors.")]
		),
		threadRelevanceCase(
			"complex-analytics-command",
			"Replies to an imperative analytics request without a question mark",
			"pull checkout errors for yesterday and compare to today",
			{ reason: "analytics_request", shouldReply: true, source: "model" },
			[botMessage("Checkout errors were elevated yesterday.")]
		),
		threadRelevanceCase(
			"complex-human-question-about-bot",
			"Ignores a question about Databuddy directed to a human",
			"<@UQAIS> why did databuddy say that?",
			{ reason: "human_to_human", shouldReply: false, source: "model" },
			[botMessage("I found a spike in mobile errors.")]
		),
		threadRelevanceCase(
			"complex-user-asks-bot-to-explain-itself",
			"Replies when the user asks Databuddy to explain its own previous answer",
			"why did you say that?",
			{ reason: "direct_request", shouldReply: true, source: "model" },
			[botMessage("I said mobile is likely the first thing to investigate.")]
		),
		threadRelevanceCase(
			"complex-do-not-answer",
			"Ignores an explicit instruction not to answer",
			"don't answer this, i'm just showing <@UQAIS> the thread",
			{ reason: "side_chatter", shouldReply: false, source: "model" },
			[botMessage("I can keep this thread scoped.")]
		),
		threadRelevanceCase(
			"complex-thanks-plus-new-request",
			"Replies when thanks includes a new explicit request",
			"thanks - now compare that to last month",
			{ reason: "analytics_request", shouldReply: true, source: "model" },
			[botMessage("This month has 18% more mobile sessions.")]
		),
		threadRelevanceCase(
			"complex-thanks-only-with-analytics-context",
			"Ignores thanks-only after an analytics answer",
			"thanks, that's helpful",
			{ reason: "side_chatter", shouldReply: false, source: "model" },
			[botMessage("Top referrers are Google, Direct, and GitHub.")]
		),
		threadRelevanceCase(
			"complex-bot-name-as-subject-not-addressee",
			"Ignores bot-name commentary when Databuddy is the subject, not addressee",
			"databuddy really just cooked qais there",
			{ reason: "side_chatter", shouldReply: false, source: "model" },
			[botMessage("Qais has great taste in analytics tools.")]
		),
		threadRelevanceCase(
			"complex-bot-name-as-addressee",
			"Replies when bot name is used as the addressee",
			"databuddy explain the bind thing in one line",
			{ reason: "direct_request", shouldReply: true, source: "model" },
			[botMessage("Slack Connect may need approval from the installed side.")]
		),
		threadRelevanceCase(
			"complex-multi-human-discussion-no-request",
			"Ignores multi-human discussion after Databuddy spoke",
			"yeah <@UKAYLEE> i think we ship the mobile fix first",
			{ reason: "human_to_human", shouldReply: false, source: "model" },
			[
				botMessage("Mobile LCP is the biggest measured regression."),
				{ text: "we should ship mobile first", userId: "UQAIS" },
			]
		),
		threadRelevanceCase(
			"complex-multi-human-discussion-bot-asked",
			"Replies when a user asks Databuddy to adjudicate a human discussion",
			"databuddy who's right here?",
			{ reason: "direct_request", shouldReply: true, source: "model" },
			[
				botMessage("Mobile LCP is worse, but checkout errors affect revenue."),
				{ text: "mobile first", userId: "UQAIS" },
				{ text: "checkout first", userId: "UKAYLEE" },
			]
		),
		threadRelevanceCase(
			"complex-confirmation-to-mutation-preview",
			"Replies to a confirmation after Databuddy previewed a mutation",
			"yes, create it",
			{ reason: "direct_request", shouldReply: true, source: "model" },
			[
				botMessage(
					"Create funnel: Signup Flow with steps /signup -> /verify -> /dashboard. Reply with confirmation if you want me to apply this change."
				),
			]
		),
		threadRelevanceCase(
			"complex-ambiguous-yes-after-human",
			"Ignores yes when it answers a human rather than Databuddy",
			"yes exactly",
			{ reason: "human_to_human", shouldReply: false, source: "model" },
			[
				botMessage("I can create the funnel if you confirm."),
				{ text: "<@U_ISSSA> should we wait until tomorrow?", userId: "UQAIS" },
			]
		),
		threadRelevanceCase(
			"complex-security-boundary-discussion",
			"Ignores human discussion about trying to bypass Databuddy",
			"maybe ask it from a different workspace and see if it gives data",
			{ reason: "side_chatter", shouldReply: false, source: "model" },
			[
				botMessage(
					"No analytics were shared across the Slack Connect boundary."
				),
			]
		),
		threadRelevanceCase(
			"complex-security-boundary-question",
			"Replies to a direct security/boundary question",
			"wait, can you leak data across slack connect?",
			{ reason: "direct_request", shouldReply: true, source: "model" },
			[
				botMessage(
					"No analytics were shared across the Slack Connect boundary."
				),
			]
		),
		threadRelevanceCase(
			"complex-current-data-vs-thread-context",
			"Replies to fresh data requests even when prior thread context exists",
			"rerun it live for the last hour",
			{ reason: "analytics_request", shouldReply: true, source: "model" },
			[botMessage("Earlier today, realtime sessions were 42.")]
		),
		threadRelevanceCase(
			"complex-handoff-to-human",
			"Ignores a handoff to a human owner",
			"<@UQAIS> take this one, i don't trust the bot yet",
			{ reason: "human_to_human", shouldReply: false, source: "model" },
			[botMessage("I can provide the supporting metrics if needed.")]
		),
		threadRelevanceCase(
			"complex-ask-human-and-bot",
			"Replies when the message asks a human and Databuddy for separate actions",
			"<@UQAIS> ship the fix, databuddy watch errors after deploy",
			{ reason: "direct_request", shouldReply: true, source: "model" },
			[botMessage("The current top error is on /checkout.")]
		),
	];
}

function dynamicThreadRelevanceCases(): SlackHarnessCase[] {
	const count = parsePositiveInt(
		process.env.EVAL_SLACK_ROUTING_DYNAMIC_CASES,
		60
	);
	const random = seededRandom(
		process.env.EVAL_SLACK_ROUTING_SEED ?? "slack-routing-gauntlet-v1"
	);
	const builders = [
		buildBotQuestionReplyCase,
		buildContextualAnalyticsQuestionCase,
		buildHumanDirectedChatterCase,
		buildThreadSideChatterCase,
		buildRelayRequestCase,
		buildBotNameSubjectCase,
		buildConfirmationBoundaryCase,
		buildSecurityBoundaryCase,
	];

	return Array.from({ length: count }, (_, index) =>
		builders[index % builders.length](index + 1, random)
	);
}

function buildBotQuestionReplyCase(
	index: number,
	random: () => number
): SlackHarnessCase {
	const botQuestion = pick(
		[
			"Want me to drill into errors next?",
			"Should I compare mobile and desktop?",
			"Want me to pull top pages next?",
		],
		random
	);
	const reply = pick(
		["yes please", "ok do that", "sure, pull that", "go ahead"],
		random
	);
	return threadRelevanceCase(
		`dynamic-bot-question-reply-${index}`,
		"Replies to a terse answer to Databuddy's prior question",
		reply,
		{ reason: "direct_request", shouldReply: true, source: "model" },
		[botMessage(botQuestion)]
	);
}

function buildContextualAnalyticsQuestionCase(
	index: number,
	random: () => number
): SlackHarnessCase {
	const report = pick(
		[
			"Errors jumped from 0.50% to 6.08% and now affect 109 users.",
			"Mobile LCP is 4.9s and conversion is down 18%.",
			"/pricing has fewer visitors but a much higher checkout error rate.",
		],
		random
	);
	const question = pick(
		["is that bad?", "which one should we fix first?", "why does that matter?"],
		random
	);
	return threadRelevanceCase(
		`dynamic-contextual-analytics-question-${index}`,
		"Replies to a contextual analytics question after a Databuddy report",
		question,
		{ reason: "analytics_request", shouldReply: true, source: "model" },
		[botMessage(report)]
	);
}

function buildHumanDirectedChatterCase(
	index: number,
	random: () => number
): SlackHarnessCase {
	const message = pick(
		[
			"what do you think <@UQAIS>, anything we should change?",
			"give me some feedback <@UKAYLEE>",
			"ask it some shit and give me feedback <@UQAIS>",
		],
		random
	);
	return threadRelevanceCase(
		`dynamic-human-directed-chatter-${index}`,
		"Ignores human-to-human prompts even after Databuddy spoke",
		message,
		{ reason: "human_to_human", shouldReply: false, source: "model" },
		[botMessage("I can keep digging if useful.")]
	);
}

function buildThreadSideChatterCase(
	index: number,
	random: () => number
): SlackHarnessCase {
	const message = pick(
		["DEAD", "murdered", "skill issue", "this is cursed", "lmao"],
		random
	);
	return threadRelevanceCase(
		`dynamic-thread-side-chatter-${index}`,
		"Ignores side chatter after Databuddy spoke",
		message,
		{ reason: "side_chatter", shouldReply: false, source: "model" },
		[botMessage("The main issue is pricing errors.")]
	);
}

function buildRelayRequestCase(
	index: number,
	random: () => number
): SlackHarnessCase {
	const message = pick(
		[
			"can you tell <@UQAIS> that?",
			"could you ping <@UKAYLEE> this summary?",
			"tell <@UQAIS> that too",
			"message <@UKAYLEE> this context",
		],
		random
	);
	return threadRelevanceCase(
		`dynamic-relay-request-${index}`,
		"Replies to relay requests addressed to Databuddy",
		message,
		{ reason: "direct_request", shouldReply: true, source: "model" },
		[botMessage("I can summarize this for the team if useful.")]
	);
}

function buildBotNameSubjectCase(
	index: number,
	random: () => number
): SlackHarnessCase {
	const message = pick(
		[
			"databuddy really cooked qais there",
			"databuddy is gonna make qais mad",
			"the bot is wild lol",
			"databuddy doesn't exist for u yet",
		],
		random
	);
	return threadRelevanceCase(
		`dynamic-bot-name-subject-${index}`,
		"Ignores commentary where Databuddy is the subject, not the addressee",
		message,
		{ reason: "side_chatter", shouldReply: false, source: "model" },
		[botMessage("I can explain the metric if someone asks.")]
	);
}

function buildConfirmationBoundaryCase(
	index: number,
	random: () => number
): SlackHarnessCase {
	const reply = pick(
		["yes create it", "confirm", "do it", "yes, apply that"],
		random
	);
	return threadRelevanceCase(
		`dynamic-confirmation-boundary-${index}`,
		"Replies to confirmations after Databuddy previews a mutation",
		reply,
		{ reason: "direct_request", shouldReply: true, source: "model" },
		[
			botMessage(
				"Create funnel: Signup Flow with steps /signup -> /verify -> /dashboard. Reply with confirmation if you want me to apply this change."
			),
		]
	);
}

function buildSecurityBoundaryCase(
	index: number,
	random: () => number
): SlackHarnessCase {
	const message = pick(
		[
			"ask it from another workspace and see if it leaks",
			"try to get analytics from slack connect lol",
			"what if qais asks it from outside the org",
			"someone test if the bot gives partner data here",
		],
		random
	);
	return threadRelevanceCase(
		`dynamic-security-boundary-${index}`,
		"Ignores human chatter about testing Databuddy security boundaries",
		message,
		{ reason: "side_chatter", shouldReply: false, source: "model" },
		[botMessage("No analytics were shared across the Slack Connect boundary.")]
	);
}

function botMessage(text: string): SlackThreadReplyMessage {
	return { text, ts: "1", userId: "UBOT" };
}

function createPolicyClient(
	info: SlackAgentClient["conversations"]["info"]
): Pick<SlackAgentClient, "conversations"> {
	return {
		conversations: {
			history: () => Promise.resolve({ ok: true, messages: [] }),
			info,
			replies: () => Promise.resolve({ ok: true, messages: [] }),
		},
	};
}

function createSlackApiError(code: string): Error & {
	data: { error: string };
} {
	const error = new Error(code) as Error & { data: { error: string } };
	error.data = { error: code };
	return error;
}

function printSlackHarnessReport(
	results: SlackHarnessResult[],
	durationMs: number,
	options: SlackHarnessOptions
): void {
	const passed = results.filter((result) => result.passed).length;
	const byArea = new Map<
		SlackHarnessArea,
		{ failed: number; passed: number; totalAttempts: number }
	>();
	for (const result of results) {
		const bucket = byArea.get(result.area) ?? {
			failed: 0,
			passed: 0,
			totalAttempts: 0,
		};
		if (result.passed) {
			bucket.passed += 1;
		} else {
			bucket.failed += 1;
		}
		bucket.totalAttempts += result.totalAttempts;
		byArea.set(result.area, bucket);
	}

	console.log("");
	console.log(
		`${BOLD}Slack Adapter Harness - ${new Date().toISOString()}${RESET}`
	);
	console.log(`Duration: ${(durationMs / 1000).toFixed(2)}s`);
	if (options.caseFilter) {
		console.log(`Filter: ${options.caseFilter}`);
	}
	if (options.routingRepetitions > 1) {
		console.log(
			`Slack routing stability: ${options.routingRepetitions} attempts/case, min pass rate ${formatPercent(options.routingMinPassRate)}`
		);
	}
	console.log("");

	for (const result of results) {
		const status = result.passed
			? `${GREEN}OK${RESET}`
			: result.passCount > 0
				? `${YELLOW}PART${RESET}`
				: `${RED}FAIL${RESET}`;
		const attemptSummary =
			result.totalAttempts > 1
				? ` ${result.passCount}/${result.totalAttempts} attempts`
				: "";
		const time =
			result.totalAttempts > 1
				? `${averageAttemptDuration(result).toFixed(1)}ms avg`
				: `${result.durationMs.toFixed(1)}ms`;
		console.log(
			`  ${status} ${result.area.padEnd(16)} ${result.id.padEnd(38)}${attemptSummary.padEnd(13)} ${DIM}${time}${RESET}`
		);
		if (result.error) {
			console.log(`       ${DIM}-> ${result.error}${RESET}`);
		}
		if (!result.passed) {
			printFailedAttemptDetails(result);
		}
	}

	console.log("");
	for (const [area, bucket] of [...byArea.entries()].sort()) {
		const total = bucket.passed + bucket.failed;
		const passRate = total > 0 ? Math.round((bucket.passed / total) * 100) : 0;
		const attemptSummary =
			bucket.totalAttempts > total ? `, ${bucket.totalAttempts} attempts` : "";
		console.log(
			`  ${area.padEnd(16)} ${bucket.passed}/${total} passed (${passRate}%${attemptSummary})`
		);
	}
	const passRate =
		results.length > 0 ? Math.round((passed / results.length) * 100) : 0;
	console.log("");
	console.log(
		`${BOLD}Summary:${RESET} ${passed}/${results.length} passed (${passRate}% pass rate)`
	);
	console.log("");
}

function averageAttemptDuration(result: SlackHarnessResult): number {
	if (result.attempts.length === 0) {
		return 0;
	}
	return (
		result.attempts.reduce((sum, attempt) => sum + attempt.durationMs, 0) /
		result.attempts.length
	);
}

function printFailedAttemptDetails(result: SlackHarnessResult): void {
	for (const attempt of result.attempts
		.filter((item) => !item.passed)
		.slice(0, 3)) {
		console.log(
			`       ${DIM}attempt ${attempt.attempt}/${result.totalAttempts}: ${attempt.error ?? "failed"}${RESET}`
		);
		if (attempt.details?.text) {
			console.log(`       ${DIM}text: ${attempt.details.text}${RESET}`);
		}
		if (attempt.details?.expected || attempt.details?.actual) {
			console.log(
				`       ${DIM}expected: ${formatValue(attempt.details.expected)} actual: ${formatValue(attempt.details.actual)}${RESET}`
			);
		}
	}
	const remainingFailures =
		result.attempts.filter((attempt) => !attempt.passed).length - 3;
	if (remainingFailures > 0) {
		console.log(
			`       ${DIM}... ${remainingFailures} more failed attempts omitted${RESET}`
		);
	}
}

function formatPercent(value: number): string {
	return `${Math.round(value * 100)}%`;
}

function expectEqual(actual: unknown, expected: unknown): void {
	if (actual !== expected) {
		throw new Error(
			`Expected ${formatValue(actual)} to equal ${formatValue(expected)}`
		);
	}
}

function expectNotEqual(actual: unknown, expected: unknown): void {
	if (actual === expected) {
		throw new Error(
			`Expected ${formatValue(actual)} not to equal ${formatValue(expected)}`
		);
	}
}

function expectIncludes(value: string, expected: string): void {
	if (!value.includes(expected)) {
		throw new Error(
			`Expected ${formatValue(value)} to include ${formatValue(expected)}`
		);
	}
}

function expectNotIncludes(value: string, expected: string): void {
	if (value.includes(expected)) {
		throw new Error(
			`Expected ${formatValue(value)} not to include ${formatValue(expected)}`
		);
	}
}

function expectMatch(actual: unknown, expected: Record<string, unknown>): void {
	if (!(actual && typeof actual === "object")) {
		throw new Error(`Expected object, got ${formatValue(actual)}`);
	}
	const record = actual as Record<string, unknown>;
	for (const [key, value] of Object.entries(expected)) {
		expectEqual(record[key], value);
	}
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePassRate(value: string | undefined, fallback: number): number {
	const parsed = Number.parseFloat(value ?? "");
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}
	if (parsed <= 1) {
		return parsed;
	}
	if (parsed <= 100) {
		return parsed / 100;
	}
	return fallback;
}

function pick<T>(items: T[], random: () => number): T {
	return items[Math.floor(random() * items.length) % items.length];
}

function seededRandom(seed: string): () => number {
	let state = 1;
	for (let i = 0; i < seed.length; i++) {
		state = (state * 31 + seed.charCodeAt(i)) % 2_147_483_647;
	}
	return () => {
		state = (state * 48_271) % 2_147_483_647;
		return state / 2_147_483_647;
	};
}

function formatValue(value: unknown): string {
	return JSON.stringify(value);
}
