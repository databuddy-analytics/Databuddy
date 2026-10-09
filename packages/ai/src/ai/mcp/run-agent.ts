import {
	asksToRemember,
	formatMemoryForPrompt,
	getMemoryContext,
	isMemoryEnabled,
	storeConversation,
} from "../../lib/supermemory";
import type { LanguageModelUsage, StepResult, ToolSet } from "ai";
import type { AgentPrincipal, DatabuddyAgentOptions } from "../../agent";
import { createConversationAgent } from "../agents/conversation";
import { getAILogger } from "../../lib/ai-logger";
import { loadOrganizationBusinessContext } from "../../lib/organization-business-context";
import { captureError } from "../../lib/tracing";
import { trackAgentUsageAndBill } from "../agents/execution";
import { createMcpAgentConfig } from "../agents/mcp";
import { type AgentSource, getDefaultAgentModelId } from "../config/models";
import { prependBackgroundContext } from "../prompts/context";

const DEFAULT_MCP_AGENT_TIMEOUT_MS = 45_000;
const EMPTY_ANSWER =
	"No answer was generated from the gathered evidence. Try a narrower question: one metric, one segment, or one time range.";

export type RunMcpAgentOptions = DatabuddyAgentOptions & {
	conversationId: string;
	conversationUserId: string | null;
	memoryUserId: string | null;
	principal: AgentPrincipal;
	source: AgentSource;
};

export interface McpAgentToolTrace {
	index: number;
	input: unknown;
	name: string;
	output: unknown;
}

interface RunMcpAgentTraceResult {
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

		await trackPreparedUsage(prepared, result.totalUsage);

		const answer = result.text.trim() || EMPTY_ANSWER;
		storePreparedConversation(prepared, answer);

		return answer;
	} finally {
		abort.cleanup();
		await settleRemainingUsage(prepared);
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
		const answer = result.text.trim() || EMPTY_ANSWER;
		storePreparedConversation(prepared, answer);

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
		await settleRemainingUsage(prepared);
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
		answer: `The run reached its time budget after ${stepCount} step${stepCount === 1 ? "" : "s"} and was stopped before composing a final summary. The partial tool trace is the only evidence gathered.`,
		steps: stepCount,
		toolCalls: collectToolTrace(steps),
		truncated: true,
		usage,
	};
}

function aggregateStepUsage(
	steps: ReadonlyArray<{ usage: LanguageModelUsage }>
): LanguageModelUsage {
	const sum = (pick: (usage: LanguageModelUsage) => number | undefined) =>
		steps.reduce((total, { usage }) => total + (pick(usage) ?? 0), 0);
	return {
		inputTokens: sum((usage) => usage.inputTokens),
		outputTokens: sum((usage) => usage.outputTokens),
		totalTokens: sum((usage) => usage.totalTokens),
		inputTokenDetails: {
			noCacheTokens: sum((usage) => usage.inputTokenDetails?.noCacheTokens),
			cacheReadTokens: sum((usage) => usage.inputTokenDetails?.cacheReadTokens),
			cacheWriteTokens: sum(
				(usage) => usage.inputTokenDetails?.cacheWriteTokens
			),
		},
		outputTokenDetails: {
			textTokens: sum((usage) => usage.outputTokenDetails?.textTokens),
			reasoningTokens: sum(
				(usage) => usage.outputTokenDetails?.reasoningTokens
			),
		},
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
		let streamFailure: { error: unknown } | undefined;

		for await (const part of result.fullStream) {
			if (part.type === "text-delta" && !streamFailure) {
				answer += part.text;
				yield part.text;
			} else if (part.type === "error") {
				streamFailure ??= { error: part.error };
			} else if (part.type === "abort") {
				streamFailure ??= {
					error:
						abort.signal.reason ??
						new DOMException(
							part.reason ?? "Agent stream aborted",
							"AbortError"
						),
				};
			} else if (part.type === "finish" && part.finishReason === "error") {
				streamFailure ??= { error: new Error("Agent stream failed") };
			}
		}
		if (streamFailure) {
			throw streamFailure.error;
		}
		abort.signal.throwIfAborted();
		const usage = await result.totalUsage;
		await trackPreparedUsage(prepared, usage);
		abort.signal.throwIfAborted();

		if (!answer.trim()) {
			answer = EMPTY_ANSWER;
			yield answer;
		}

		options.onToolTrace?.(collectToolTrace(prepared.capturedSteps));
		storePreparedConversation(prepared, answer);
	} finally {
		abort.cleanup();
		await settleRemainingUsage(prepared);
	}
}

function createRunAbortController(options: RunMcpAgentOptions): {
	cleanup: () => void;
	signal: AbortSignal;
} {
	const controller = new AbortController();
	const timeout = setTimeout(
		() => controller.abort(),
		options.timeoutMs ?? DEFAULT_MCP_AGENT_TIMEOUT_MS
	);
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
			controller.abort();
			clearTimeout(timeout);
			externalSignal?.removeEventListener("abort", abortFromExternalSignal);
		},
		signal: controller.signal,
	};
}

async function prepareMcpAgentRun(options: RunMcpAgentOptions) {
	const { conversationId, memoryUserId, principal, source } = options;
	const { accessibleWebsites, apiKey, organizationId, userId, website } =
		principal;
	const historyInput = options.historyInput ?? options.input;

	const [config, memoryCtx, businessContext] = await Promise.all([
		createMcpAgentConfig({
			billingCustomerId: principal.billingCustomerId,
			requestHeaders: principal.requestHeaders,
			apiKey,
			userId,
			timezone: options.timezone,
			chatId: conversationId,
			latestUserMessage: historyInput,
			modelOverride: options.modelOverride,
			memoryUserId,
			mutationMode: options.mutationMode,
			organizationId,
			accessibleWebsites,
			slackContext: options.slackContext,
			source,
			websiteDomain: website?.domain,
			websiteId: website?.id,
		}),
		isMemoryEnabled()
			? getMemoryContext(historyInput, memoryUserId, apiKey?.id ?? null)
			: Promise.resolve(null),
		loadOrganizationBusinessContext({
			organizationId,
			accessibleWebsites,
			websiteIds: website ? [website.id] : [],
			abortSignal: options.abortSignal,
		}),
	]);

	const ai = getAILogger();
	const capturedSteps: StepResult<ToolSet>[] = [];
	const agent = createConversationAgent(
		{ ...config, model: ai.wrap(config.model) },
		{
			onStepFinish: (step) => {
				capturedSteps.push(step);
				const toolNames = step.toolCalls.map((call) => call.toolName);
				if (toolNames.length > 0) {
					options.onToolEvent?.(toolNames);
				}
			},
			experimental_telemetry: {
				isEnabled: true,
				functionId: `databuddy.${source}.ask`,
				metadata: {
					source,
					authType: apiKey ? "api_key" : "session",
					timezone: options.timezone ?? "UTC",
					"tcc.conversational": "true",
					...(userId && { userId }),
					organizationId,
					"tcc.sessionId": conversationId,
				},
			},
		}
	);

	const messages = prependBackgroundContext(
		[...(options.history ?? []), { role: "user", content: options.input }],
		[businessContext, memoryCtx ? formatMemoryForPrompt(memoryCtx) : ""]
	);

	return {
		agent,
		capturedSteps,
		historyInput,
		messages,
		modelId: options.modelOverride ?? getDefaultAgentModelId(source),
		options,
		usageSettlementAttempted: false,
	};
}

async function trackPreparedUsage(
	prepared: Awaited<ReturnType<typeof prepareMcpAgentRun>>,
	usage: LanguageModelUsage
): Promise<void> {
	if (prepared.usageSettlementAttempted) {
		return;
	}
	// An uncertain charge must not be replayed by cleanup.
	prepared.usageSettlementAttempted = true;
	const { conversationId, principal, source } = prepared.options;
	await trackAgentUsageAndBill({
		usage: {
			...usage,
			...(prepared.capturedSteps.length > 0
				? { stepUsages: prepared.capturedSteps.map((step) => step.usage) }
				: {}),
		},
		modelId: prepared.modelId,
		source,
		organizationId: principal.organizationId,
		userId: principal.userId,
		chatId: conversationId,
		billingCustomerId: principal.billingCustomerId,
		billingAccess: principal.billingAccess,
	});
}

async function settleRemainingUsage(
	prepared: Awaited<ReturnType<typeof prepareMcpAgentRun>>
): Promise<void> {
	if (
		prepared.usageSettlementAttempted ||
		prepared.capturedSteps.length === 0
	) {
		return;
	}
	try {
		await trackPreparedUsage(
			prepared,
			aggregateStepUsage(prepared.capturedSteps)
		);
	} catch (error) {
		// Preserve the model error or consumer cancellation that entered cleanup.
		captureError(error, {
			agent_usage_billing_error: true,
			agent_source: prepared.options.source,
			agent_chat_id: prepared.options.conversationId,
		});
	}
}

function collectToolTrace(
	steps: readonly StepResult<ToolSet>[]
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
	{ historyInput, options }: Awaited<ReturnType<typeof prepareMcpAgentRun>>,
	answer: string
): void {
	if (
		options.persistConversation === false ||
		options.mutationMode === "dry-run" ||
		!asksToRemember(historyInput)
	) {
		return;
	}
	const { website } = options.principal;
	storeConversation(
		[
			{ role: "user", content: historyInput },
			{ role: "assistant", content: answer },
		],
		options.memoryUserId,
		options.principal.apiKey?.id ?? null,
		{
			...(website?.domain ? { domain: website.domain } : {}),
			metadata: { source: options.source },
			conversationId: options.conversationId,
			websiteId: website?.id,
		}
	);
}
