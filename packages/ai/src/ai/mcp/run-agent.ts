import {
	formatMemoryForPrompt,
	getMemoryContext,
	isMemoryEnabled,
	storeConversation,
} from "../../lib/supermemory";
import type { ApiKeyRow } from "@databuddy/api-keys/resolve";
import type { LanguageModelUsage, StepResult, ToolSet } from "ai";
import { ToolLoopAgent } from "ai";
import { DatabuddyAgentUserError } from "../../agent/errors";
import { getAILogger } from "../../lib/ai-logger";
import { mergeWideEvent } from "../../lib/tracing";
import {
	ensureAgentCreditsAvailable,
	resolveAgentBillingCustomerId,
	trackAgentUsageAndBill,
} from "../agents/execution";
import { createMcpAgentConfig } from "../agents/mcp";
import { getDefaultAgentModelId } from "../config/models";
import type { AppMutationMode } from "../config/context";
import type { DatabuddyAgentSlackContext } from "./slack-context";

const DEFAULT_MCP_AGENT_TIMEOUT_MS = 45_000;
export type AgentBillingMode = "bill" | "skip";

export interface RunMcpAgentOptions {
	abortSignal?: AbortSignal;
	apiKey: ApiKeyRow | null;
	billingMode?: AgentBillingMode;
	conversationId?: string;
	memoryUserId?: string | null;
	modelOverride?: string | null;
	mutationMode?: AppMutationMode;
	priorMessages?: Array<{ role: "user" | "assistant"; content: string }>;
	question: string;
	requestHeaders: Headers;
	slackContext?: DatabuddyAgentSlackContext | null;
	source?: "dashboard" | "mcp" | "slack";
	storeMemory?: boolean;
	timeoutMs?: number;
	timezone?: string;
	userId: string | null;
	websiteDomain?: string | null;
	websiteId?: string | null;
}

export interface McpAgentToolTrace {
	index: number;
	input: unknown;
	name: string;
	output: unknown;
}

export interface RunMcpAgentTraceResult {
	answer: string;
	steps: number;
	toolCalls: McpAgentToolTrace[];
	truncated?: boolean;
	usage: LanguageModelUsage;
}

export async function runMcpAgent(
	options: RunMcpAgentOptions
): Promise<string> {
	const prepared = await prepareMcpAgentRun(options);
	const abort = createRunAbortController(options);

	try {
		const result = await prepared.agent.generate({
			messages: prepared.messages,
			abortSignal: abort.signal,
		});

		const usage = (result as { usage?: LanguageModelUsage }).usage;
		if (usage) {
			await trackPreparedUsage(prepared, usage);
		}

		const answer = result.text ?? "No response generated.";
		if (options.storeMemory !== false) {
			storePreparedConversation(prepared, options.question, answer);
		}

		return answer;
	} finally {
		abort.cleanup();
	}
}

export async function runMcpAgentWithTrace(
	options: RunMcpAgentOptions
): Promise<RunMcpAgentTraceResult> {
	const prepared = await prepareMcpAgentRun(options);
	const abort = createRunAbortController(options);

	try {
		const result = await prepared.agent.generate({
			messages: prepared.messages,
			abortSignal: abort.signal,
		});

		await trackPreparedUsage(prepared, result.totalUsage);
		const stepCount = result.steps.length;
		const rawAnswer = (result.text ?? "").trim();
		const answer =
			rawAnswer ||
			`I ran ${stepCount} step${stepCount === 1 ? "" : "s"} but couldn't fit a summary into this turn. The question is wide enough that I exhausted the step budget gathering data. Ask me a narrower slice (one metric, one segment, one time range) and I'll give you a focused answer.`;
		if (options.storeMemory !== false) {
			storePreparedConversation(prepared, options.question, answer);
		}

		return {
			answer,
			steps: result.steps.length,
			toolCalls: collectToolTrace(result.steps),
			usage: result.totalUsage,
		};
	} catch (err) {
		if (isInternalTimeoutAbort(err, options.abortSignal)) {
			return await buildTruncatedTrace(prepared);
		}
		throw err;
	} finally {
		abort.cleanup();
	}
}

function isInternalTimeoutAbort(
	err: unknown,
	externalSignal: AbortSignal | undefined
): boolean {
	return (
		err instanceof Error &&
		err.name === "AbortError" &&
		!externalSignal?.aborted
	);
}

async function buildTruncatedTrace(
	prepared: Awaited<ReturnType<typeof prepareMcpAgentRun>>
): Promise<RunMcpAgentTraceResult> {
	const steps = prepared.capturedSteps;
	const usage = aggregateStepUsage(steps);
	await trackPreparedUsage(prepared, usage);
	const stepCount = steps.length;
	return {
		answer: `The investigation reached its time budget after ${stepCount} step${stepCount === 1 ? "" : "s"} and was stopped before composing a final summary. The partial tool trace is the only evidence gathered.`,
		steps: stepCount,
		toolCalls: collectToolTrace(steps),
		truncated: true,
		usage,
	};
}

function aggregateStepUsage(
	steps: ReadonlyArray<{ usage: LanguageModelUsage }>
): LanguageModelUsage {
	let inputTokens = 0;
	let outputTokens = 0;
	let totalTokens = 0;
	let noCacheTokens = 0;
	let cacheReadTokens = 0;
	let cacheWriteTokens = 0;
	let textTokens = 0;
	let reasoningTokens = 0;
	for (const { usage } of steps) {
		inputTokens += usage.inputTokens ?? 0;
		outputTokens += usage.outputTokens ?? 0;
		totalTokens += usage.totalTokens ?? 0;
		noCacheTokens += usage.inputTokenDetails?.noCacheTokens ?? 0;
		cacheReadTokens += usage.inputTokenDetails?.cacheReadTokens ?? 0;
		cacheWriteTokens += usage.inputTokenDetails?.cacheWriteTokens ?? 0;
		textTokens += usage.outputTokenDetails?.textTokens ?? 0;
		reasoningTokens += usage.outputTokenDetails?.reasoningTokens ?? 0;
	}
	return {
		inputTokens,
		outputTokens,
		totalTokens,
		inputTokenDetails: { noCacheTokens, cacheReadTokens, cacheWriteTokens },
		outputTokenDetails: { textTokens, reasoningTokens },
	};
}

export async function* streamMcpAgentText(
	options: RunMcpAgentOptions
): AsyncGenerator<string> {
	const prepared = await prepareMcpAgentRun(options);
	const abort = createRunAbortController(options);

	try {
		const result = await prepared.agent.stream({
			messages: prepared.messages,
			abortSignal: abort.signal,
		});
		let answer = "";

		for await (const chunk of result.textStream) {
			answer += chunk;
			yield chunk;
		}

		const usage = await result.totalUsage;
		await trackPreparedUsage(prepared, usage);
		if (options.storeMemory !== false) {
			storePreparedConversation(
				prepared,
				options.question,
				answer.trim() ||
					"I exhausted the step budget gathering data without composing a summary. Try a narrower question."
			);
		}
	} finally {
		abort.cleanup();
	}
}

function createRunAbortController(options: RunMcpAgentOptions): {
	cleanup: () => void;
	signal: AbortSignal;
} {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), getTimeoutMs(options));
	const externalSignal = options.abortSignal;
	const abortFromExternalSignal = () => {
		controller.abort(externalSignal?.reason);
	};

	if (externalSignal?.aborted) {
		abortFromExternalSignal();
	} else {
		externalSignal?.addEventListener("abort", abortFromExternalSignal, {
			once: true,
		});
	}

	return {
		cleanup: () => {
			clearTimeout(timeout);
			externalSignal?.removeEventListener("abort", abortFromExternalSignal);
		},
		signal: controller.signal,
	};
}

async function prepareMcpAgentRun(options: RunMcpAgentOptions) {
	const sessionId = options.conversationId ?? crypto.randomUUID();
	const mcpUserId = options.userId ?? options.apiKey?.userId ?? null;
	const memoryUserId = options.memoryUserId ?? mcpUserId;
	const organizationId = options.apiKey?.organizationId ?? null;
	const source = options.source ?? "mcp";
	const selectedModelId =
		options.modelOverride ?? getDefaultAgentModelId(source);

	const apiKeyId = options.apiKey?.id ?? null;

	const billingCustomerId =
		options.billingMode === "skip"
			? null
			: await resolveAgentBillingCustomerId({
					userId: mcpUserId,
					apiKey: options.apiKey,
					organizationId,
				});
	mergeWideEvent({
		agent_billing_mode: options.billingMode === "skip" ? "skip" : "bill",
	});

	if (
		options.billingMode !== "skip" &&
		!(await ensureAgentCreditsAvailable(billingCustomerId))
	) {
		throw new DatabuddyAgentUserError({
			code: "agent_credits_exhausted",
			message:
				"You're out of Databunny credits this month. Upgrade or wait for the monthly reset.",
		});
	}

	const [config, memoryCtx] = await Promise.all([
		Promise.resolve(
			createMcpAgentConfig({
				billingCustomerId,
				requestHeaders: options.requestHeaders,
				apiKey: options.apiKey,
				userId: mcpUserId,
				timezone: options.timezone,
				chatId: sessionId,
				modelOverride: options.modelOverride,
				memoryUserId,
				mutationMode: options.mutationMode,
				organizationId,
				slackContext: options.slackContext,
				source,
				websiteDomain: options.websiteDomain,
				websiteId: options.websiteId,
				activeTools: selectActiveToolsForQuestion({
					question: options.question,
					source,
				}),
			})
		),
		isMemoryEnabled()
			? getMemoryContext(options.question, memoryUserId, apiKeyId)
			: Promise.resolve(null),
	]);

	const memoryBlock = memoryCtx ? formatMemoryForPrompt(memoryCtx) : "";
	const instructions = config.system;

	const mcpTelemetryMetadata: Record<string, string> = {
		source,
		authType: options.apiKey ? "api_key" : "session",
		timezone: options.timezone ?? "UTC",
		"tcc.conversational": "true",
	};
	if (mcpUserId) {
		mcpTelemetryMetadata.userId = mcpUserId;
	}
	if (options.apiKey?.organizationId) {
		mcpTelemetryMetadata.organizationId = options.apiKey.organizationId;
	}
	mcpTelemetryMetadata["tcc.sessionId"] = sessionId;

	const ai = getAILogger();
	const capturedSteps: StepResult<ToolSet>[] = [];
	const agent = new ToolLoopAgent({
		model: ai.wrap(config.model),
		instructions,
		tools: config.tools,
		activeTools: config.activeTools,
		stopWhen: config.stopWhen,
		temperature: config.temperature,
		experimental_context: config.experimental_context,
		onStepFinish: (step) => {
			capturedSteps.push(step);
		},
		experimental_telemetry: {
			isEnabled: true,
			functionId: `databuddy.${source}.ask`,
			metadata: mcpTelemetryMetadata,
		},
	});

	const questionContent = memoryBlock
		? `<context>\n${memoryBlock}\n</context>\n\n${options.question}`
		: options.question;

	const messages =
		options.priorMessages && options.priorMessages.length > 0
			? [
					...options.priorMessages,
					{ role: "user" as const, content: questionContent },
				]
			: [{ role: "user" as const, content: questionContent }];

	return {
		agent,
		apiKeyId,
		billingCustomerId,
		capturedSteps,
		memoryUserId,
		mcpUserId,
		messages,
		modelId: selectedModelId,
		organizationId,
		sessionId,
		source,
		websiteDomain: options.websiteDomain ?? undefined,
		websiteId: options.websiteId ?? undefined,
	};
}

async function trackPreparedUsage(
	prepared: Awaited<ReturnType<typeof prepareMcpAgentRun>>,
	usage: LanguageModelUsage
): Promise<void> {
	await trackAgentUsageAndBill({
		usage,
		modelId: prepared.modelId,
		source: prepared.source,
		organizationId: prepared.organizationId,
		userId: prepared.mcpUserId,
		chatId: prepared.sessionId,
		billingCustomerId: prepared.billingCustomerId,
	});
}

const NO_TOOL_CHAT_PATTERN =
	/\b(hi|hello|hey|thanks|thank you|lol|nice|cool|ok|okay|nah that's wrong|that's wrong|nope|shut up)\b|^\s*(damn|lol|nice|thanks)[.!?\s]*$/i;
const THREAD_REFERENCE_PATTERN =
	/\b(above|that|this thread|which one|what first|where do we .*first|poke first|prioriti[sz]e|what'?s the call|do you agree|who said|who asked|recap|from earlier|from above)\b/i;
const ANALYTICS_REQUEST_PATTERN =
	/\b(analytics?|metrics?|traffic|visitors?|sessions?|page\s*views?|pageviews?|top pages?|pages?|referrers?|sources?|campaigns?|conversions?|events?|errors?|vitals?|performance|uptime|revenue|transactions?|llm|latency|bounce|countries|country|regions?|cities|devices?|browsers?|operating systems?|utm|fresh|current|latest|live|rerun|last \d+|last week|last month|today|yesterday)\b/i;
const NON_ANALYTICS_TOOL_PATTERN =
	/\b(remember|memory|forget|profile|profiles|flag|flags|feature flag|feature flags|funnel|funnels|goal|goals|annotation|annotations|link|links|short link|short links|digest|digests|subscribe|unsubscribe|create|update|delete|archive|enable|disable|rollout|target|folder|folders|navigate|open|go to|take me)\b/i;
const INVESTIGATION_REQUEST_PATTERN =
	/\b(why|what caused|root cause|because|reason|investigate|investigation|diagnose|debug|deploy|deployed|deployment|commit|commits|merged|pull request|pr|branch|release|rollback|regression|search console|google search|keyword|seo|impressions|ranking|scrape|crawl)\b/i;
const COPY_ONLY_PATTERN = /\b(exact copy|copy only)\b/i;
const SLACK_FOLLOW_UP_OPEN_TAG = "<slack_follow_up";
const SLACK_FOLLOW_UP_CLOSE_TAG = "</slack_follow_up>";
const SLACK_LATEST_MESSAGE_OPEN_TAG = "<slack_latest_message>";
const SLACK_LATEST_MESSAGE_CLOSE_TAG = "</slack_latest_message>";
const SLACK_TEXT_MARKER = "\ntext:\n";
const SLACK_TEXT_PREFIX = "text:\n";
const ANALYTICS_ACTIVE_TOOLS = [
	"list_websites",
	"get_data",
	"execute_query_builder",
	"execute_sql_query",
	"list_profiles",
	"get_profile",
	"get_profile_sessions",
];

function latestSlackText(input: string): string {
	const lastFollowUp = getLastTaggedBlock(
		input,
		SLACK_FOLLOW_UP_OPEN_TAG,
		SLACK_FOLLOW_UP_CLOSE_TAG
	);
	if (lastFollowUp !== undefined) {
		return getSlackBlockText(lastFollowUp) ?? lastFollowUp;
	}

	const latestMessage = getFirstTaggedBlock(
		input,
		SLACK_LATEST_MESSAGE_OPEN_TAG,
		SLACK_LATEST_MESSAGE_CLOSE_TAG
	);
	return latestMessage === undefined
		? input
		: (getSlackBlockText(latestMessage) ?? latestMessage);
}

function getFirstTaggedBlock(
	input: string,
	openTagPrefix: string,
	closeTag: string
): string | undefined {
	const openStart = input.indexOf(openTagPrefix);
	return openStart === -1
		? undefined
		: getTaggedBlockAfterOpen(input, openStart, openTagPrefix, closeTag)?.block;
}

function getLastTaggedBlock(
	input: string,
	openTagPrefix: string,
	closeTag: string
): string | undefined {
	let searchFrom = 0;
	let lastBlock: string | undefined;
	while (searchFrom < input.length) {
		const openStart = input.indexOf(openTagPrefix, searchFrom);
		if (openStart === -1) {
			return lastBlock;
		}

		const parsed = getTaggedBlockAfterOpen(
			input,
			openStart,
			openTagPrefix,
			closeTag
		);
		if (!parsed) {
			return lastBlock;
		}

		lastBlock = parsed.block;
		searchFrom = parsed.nextIndex;
	}
	return lastBlock;
}

function getTaggedBlockAfterOpen(
	input: string,
	openStart: number,
	openTagPrefix: string,
	closeTag: string
): { block: string; nextIndex: number } | undefined {
	const openEnd = input.indexOf(">", openStart + openTagPrefix.length);
	if (openEnd === -1) {
		return;
	}

	const bodyStart = openEnd + 1;
	const closeStart = input.indexOf(closeTag, bodyStart);
	if (closeStart === -1) {
		return;
	}

	return {
		block: input.slice(bodyStart, closeStart),
		nextIndex: closeStart + closeTag.length,
	};
}

function getSlackBlockText(block: string): string | undefined {
	const textIndex = block.indexOf(SLACK_TEXT_MARKER);
	if (textIndex !== -1) {
		return block.slice(textIndex + SLACK_TEXT_MARKER.length);
	}
	return block.startsWith(SLACK_TEXT_PREFIX)
		? block.slice(SLACK_TEXT_PREFIX.length)
		: undefined;
}

export function selectActiveToolsForQuestion(options: {
	question: string;
	source: "dashboard" | "mcp" | "slack";
}): string[] | undefined {
	const text = (
		options.source === "slack"
			? latestSlackText(options.question)
			: options.question
	).toLowerCase();
	const hasAnalyticsRequest = ANALYTICS_REQUEST_PATTERN.test(text);
	const hasNonAnalyticsToolRequest = NON_ANALYTICS_TOOL_PATTERN.test(text);
	const hasInvestigationRequest = INVESTIGATION_REQUEST_PATTERN.test(text);
	if (hasInvestigationRequest) {
		return;
	}
	if (options.source === "slack") {
		if (hasAnalyticsRequest && !hasNonAnalyticsToolRequest) {
			return THREAD_REFERENCE_PATTERN.test(text)
				? ["slack_read_current_thread", ...ANALYTICS_ACTIVE_TOOLS]
				: ANALYTICS_ACTIVE_TOOLS;
		}
		if (COPY_ONLY_PATTERN.test(text) && !THREAD_REFERENCE_PATTERN.test(text)) {
			return [];
		}
		if (THREAD_REFERENCE_PATTERN.test(text)) {
			return ["slack_read_current_thread"];
		}
		if (NO_TOOL_CHAT_PATTERN.test(text)) {
			return [];
		}
	}

	if (
		NO_TOOL_CHAT_PATTERN.test(text) &&
		!hasAnalyticsRequest &&
		!hasNonAnalyticsToolRequest
	) {
		return [];
	}
	if (hasAnalyticsRequest && !hasNonAnalyticsToolRequest) {
		return ANALYTICS_ACTIVE_TOOLS;
	}

	return;
}

function collectToolTrace(
	steps: readonly {
		readonly toolCalls: readonly {
			readonly input: unknown;
			readonly toolCallId: string;
			readonly toolName: string;
		}[];
		readonly toolResults: readonly {
			readonly output: unknown;
			readonly toolCallId: string;
		}[];
	}[]
): McpAgentToolTrace[] {
	const traces: McpAgentToolTrace[] = [];
	for (const step of steps) {
		const outputs = new Map(
			step.toolResults.map((result) => [result.toolCallId, result.output])
		);
		for (const call of step.toolCalls) {
			traces.push({
				index: traces.length,
				input: call.input,
				name: call.toolName,
				output: outputs.get(call.toolCallId) ?? null,
			});
		}
	}
	return traces;
}

function storePreparedConversation(
	prepared: Awaited<ReturnType<typeof prepareMcpAgentRun>>,
	question: string,
	answer: string
): void {
	storeConversation(
		[
			{ role: "user", content: question },
			{ role: "assistant", content: answer },
		],
		prepared.memoryUserId,
		prepared.apiKeyId,
		{
			...(prepared.websiteDomain ? { domain: prepared.websiteDomain } : {}),
			metadata: { source: prepared.source },
			conversationId: prepared.sessionId,
			websiteId: prepared.websiteId,
		}
	);
}

function getTimeoutMs(options: RunMcpAgentOptions): number {
	return options.timeoutMs ?? DEFAULT_MCP_AGENT_TIMEOUT_MS;
}
