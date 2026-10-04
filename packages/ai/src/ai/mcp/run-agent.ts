import {
	asksToRemember,
	formatMemoryForPrompt,
	getMemoryContext,
	isMemoryEnabled,
	storeConversation,
} from "../../lib/supermemory";
import type { ApiKeyRow } from "@databuddy/api-keys/resolve";
import { auth } from "@databuddy/auth";
import type { LanguageModelUsage, StepResult, ToolSet } from "ai";
import { createConversationAgent } from "../agents/conversation";
import { DatabuddyAgentUserError } from "../../agent/errors";
import { getAILogger } from "../../lib/ai-logger";
import { getAccessibleWebsites } from "../../lib/accessible-websites";
import { loadOrganizationBusinessContext } from "../../lib/organization-business-context";
import { matchesWebsiteDomain } from "../../lib/website-domain";
import { captureError, mergeWideEvent } from "../../lib/tracing";
import {
	getAgentBillingAccess,
	resolveAgentBillingCustomerId,
	trackAgentUsageAndBill,
} from "../agents/execution";
import { createMcpAgentConfig } from "../agents/mcp";
import { getDefaultAgentModelId } from "../config/models";
import type { AppMutationMode } from "../config/context";
import type { DatabuddyAgentSlackContext } from "./slack-context";

const DEFAULT_MCP_AGENT_TIMEOUT_MS = 45_000;
const EMPTY_ANSWER =
	"No answer was generated from the gathered evidence. Try a narrower question: one metric, one segment, or one time range.";
type AgentBillingMode = "bill" | "skip";

export interface RunMcpAgentOptions {
	abortSignal?: AbortSignal;
	apiKey: ApiKeyRow | null;
	billingMode?: AgentBillingMode;
	conversationId?: string;
	historyInput?: string;
	memoryUserId?: string | null;
	modelOverride?: string | null;
	mutationMode?: AppMutationMode;
	onToolEvent?: (toolNames: string[]) => void;
	/** Called once after a stream completes and its usage has been settled. */
	onToolTrace?: (trace: McpAgentToolTrace[]) => void;
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
		if (options.storeMemory !== false) {
			storePreparedConversation(prepared, answer);
		}

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
		if (options.storeMemory !== false) {
			storePreparedConversation(prepared, answer);
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
		if (options.storeMemory !== false) {
			storePreparedConversation(prepared, answer);
		}
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
	const sessionId = options.conversationId ?? crypto.randomUUID();
	const historyInput = options.historyInput ?? options.question;
	const mcpUserId = options.userId ?? options.apiKey?.userId ?? null;
	const memoryUserId = options.memoryUserId ?? mcpUserId;
	const session =
		!options.apiKey && mcpUserId
			? await auth.api.getSession({ headers: options.requestHeaders })
			: null;
	const organizationId = options.apiKey
		? options.apiKey.organizationId
		: session?.user.id === mcpUserId
			? (session?.session.activeOrganizationId ?? null)
			: null;
	const [accessibleWebsites, billingCustomerId] = await Promise.all([
		getAccessibleWebsites({
			apiKey: options.apiKey,
			organizationId,
			user: session?.user.id === mcpUserId ? session.user : null,
		}),
		options.billingMode === "skip"
			? Promise.resolve(null)
			: resolveAgentBillingCustomerId({
					userId: mcpUserId,
					apiKey: options.apiKey,
					organizationId,
				}),
	]);
	const websiteDomain = options.websiteDomain;
	// A caller-supplied site must not bind another organization's brief or tools.
	if (
		(options.websiteId &&
			!accessibleWebsites.some((site) => site.id === options.websiteId)) ||
		(websiteDomain &&
			!accessibleWebsites.some(
				(site) =>
					matchesWebsiteDomain(site.domain, websiteDomain) &&
					(!options.websiteId || site.id === options.websiteId)
			))
	) {
		throw new Error("Website is not accessible in this organization");
	}
	const source = options.source ?? "mcp";
	const selectedModelId =
		options.modelOverride ?? getDefaultAgentModelId(source);

	const apiKeyId = options.apiKey?.id ?? null;

	mergeWideEvent({
		agent_billing_mode: options.billingMode === "skip" ? "skip" : "bill",
	});

	const billingAccess =
		options.billingMode === "skip"
			? undefined
			: await getAgentBillingAccess(billingCustomerId);
	if (billingAccess && !billingAccess.allowed) {
		throw new DatabuddyAgentUserError({
			code: "agent_credits_exhausted",
			message:
				"You've used your Databunny allowance for this month. Add more usage, upgrade, or wait for the monthly reset.",
		});
	}

	const [config, memoryCtx, businessContext] = await Promise.all([
		createMcpAgentConfig({
			billingCustomerId,
			requestHeaders: options.requestHeaders,
			apiKey: options.apiKey,
			userId: mcpUserId,
			timezone: options.timezone,
			chatId: sessionId,
			latestUserMessage: historyInput,
			modelOverride: options.modelOverride,
			memoryUserId,
			mutationMode: options.mutationMode,
			organizationId,
			accessibleWebsites,
			slackContext: options.slackContext,
			source,
			websiteDomain: options.websiteDomain,
			websiteId: options.websiteId,
		}),
		isMemoryEnabled()
			? getMemoryContext(historyInput, memoryUserId, apiKeyId)
			: Promise.resolve(null),
		loadOrganizationBusinessContext({
			organizationId,
			accessibleWebsites,
			websiteIds: options.websiteId ? [options.websiteId] : [],
			abortSignal: options.abortSignal,
		}),
	]);

	const memoryBlock = memoryCtx ? formatMemoryForPrompt(memoryCtx) : "";

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
					authType: options.apiKey ? "api_key" : "session",
					timezone: options.timezone ?? "UTC",
					"tcc.conversational": "true",
					...(mcpUserId && { userId: mcpUserId }),
					...(options.apiKey?.organizationId && {
						organizationId: options.apiKey.organizationId,
					}),
					"tcc.sessionId": sessionId,
				},
			},
		}
	);

	const contextBlock = [businessContext, memoryBlock]
		.filter(Boolean)
		.join("\n\n");
	const questionContent = contextBlock
		? `<context>\n${contextBlock}\n</context>\n\n${options.question}`
		: options.question;

	const messages = [
		...(options.priorMessages ?? []),
		{ role: "user" as const, content: questionContent },
	];

	return {
		agent,
		apiKeyId,
		billingCustomerId,
		billingAccess,
		capturedSteps,
		historyInput,
		usageSettlementAttempted: false,
		memoryUserId,
		mcpUserId,
		messages,
		modelId: selectedModelId,
		mutationMode: options.mutationMode,
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
	if (prepared.usageSettlementAttempted) {
		return;
	}
	// An uncertain charge must not be replayed by cleanup.
	prepared.usageSettlementAttempted = true;
	await trackAgentUsageAndBill({
		usage: {
			...usage,
			...(prepared.capturedSteps.length > 0
				? { stepUsages: prepared.capturedSteps.map((step) => step.usage) }
				: {}),
		},
		modelId: prepared.modelId,
		source: prepared.source,
		organizationId: prepared.organizationId,
		userId: prepared.mcpUserId,
		chatId: prepared.sessionId,
		billingCustomerId: prepared.billingCustomerId,
		billingAccess: prepared.billingAccess,
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
			agent_source: prepared.source,
			agent_chat_id: prepared.sessionId,
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
	prepared: Awaited<ReturnType<typeof prepareMcpAgentRun>>,
	answer: string
): void {
	if (
		prepared.mutationMode === "dry-run" ||
		!asksToRemember(prepared.historyInput)
	) {
		return;
	}
	storeConversation(
		[
			{ role: "user", content: prepared.historyInput },
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
