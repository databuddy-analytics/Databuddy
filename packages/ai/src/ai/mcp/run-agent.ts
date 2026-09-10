import {
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
type AgentBillingMode = "bill" | "skip";

export interface RunMcpAgentOptions {
	abortSignal?: AbortSignal;
	apiKey: ApiKeyRow | null;
	billingMode?: AgentBillingMode;
	conversationId?: string;
	memoryUserId?: string | null;
	modelOverride?: string | null;
	mutationMode?: AppMutationMode;
	onToolEvent?: (toolNames: string[]) => void;
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

		await trackPreparedUsage(prepared, result.totalUsage);

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
	const session =
		!options.apiKey && mcpUserId
			? await auth.api.getSession({ headers: options.requestHeaders })
			: null;
	const organizationId = options.apiKey
		? options.apiKey.organizationId
		: session?.user.id === mcpUserId
			? (session?.session.activeOrganizationId ?? null)
			: null;
	const accessibleWebsites = await getAccessibleWebsites({
		apiKey: options.apiKey,
		organizationId,
		user: session?.user.id === mcpUserId ? session.user : null,
	});
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
				"You've used your Databunny allowance for this month. Add more usage, upgrade, or wait for the monthly reset.",
		});
	}

	const [config, memoryCtx, businessContext] = await Promise.all([
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
				accessibleWebsites,
				slackContext: options.slackContext,
				source,
				websiteDomain: options.websiteDomain,
				websiteId: options.websiteId,
			})
		),
		isMemoryEnabled()
			? getMemoryContext(options.question, memoryUserId, apiKeyId, {
					websiteId: options.websiteId ?? undefined,
				})
			: Promise.resolve(null),
		loadOrganizationBusinessContext({
			organizationId,
			accessibleWebsites,
			websiteIds: options.websiteId ? [options.websiteId] : [],
			abortSignal: options.abortSignal,
		}),
	]);

	const memoryBlock = memoryCtx ? formatMemoryForPrompt(memoryCtx) : "";

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
				metadata: mcpTelemetryMetadata,
			},
		}
	);

	const contextBlock = [businessContext, memoryBlock]
		.filter(Boolean)
		.join("\n\n");
	const questionContent = contextBlock
		? `<context>\n${contextBlock}\n</context>\n\n${options.question}`
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
