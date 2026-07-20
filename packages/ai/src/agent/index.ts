import { resolveApiKey, type ApiKeyRow } from "@databuddy/api-keys/resolve";
import {
	appendToConversation,
	getConversationHistory,
	type ConversationMessage,
} from "../ai/mcp/conversation-store";
import {
	runMcpAgent,
	streamMcpAgentText,
	runMcpAgentWithTrace,
	type McpAgentToolTrace,
} from "../ai/mcp/run-agent";
import type { DatabuddyAgentSlackContext } from "../ai/mcp/slack-context";

export type { ConversationMessage } from "../ai/mcp/conversation-store";
export {
	DatabuddyAgentUserError,
	isDatabuddyAgentUserError,
	type DatabuddyAgentUserErrorCode,
} from "./errors";
export {
	classifySlackThreadReplyRelevance,
	type SlackThreadReplyMessage,
	type SlackThreadReplyRelevance,
	type SlackThreadReplyRelevanceInput,
} from "./slack-relevance";
export type {
	DatabuddyAgentSlackChannelHistoryResult,
	DatabuddyAgentSlackContext,
	DatabuddyAgentSlackMessage,
	DatabuddyAgentSlackThreadResult,
} from "../ai/mcp/slack-context";

export type DatabuddyAgentSource = "dashboard" | "mcp" | "slack";
export type DatabuddyAgentBillingMode = "bill" | "skip";
export type DatabuddyAgentMutationMode = "allow" | "dry-run";

export type DatabuddyAgentActor =
	| {
			apiKey: ApiKeyRow;
			requestHeaders?: Headers;
			type: "api_key";
			userId?: string | null;
	  }
	| {
			expectedOrganizationId?: string | null;
			requestHeaders?: Headers;
			secret: string;
			type: "api_key_secret";
			userId?: string | null;
	  }
	| {
			requestHeaders: Headers;
			type: "session";
			userId: string;
	  };

export interface DatabuddyAgentOptions {
	abortSignal?: AbortSignal;
	actor: DatabuddyAgentActor;
	billingMode?: DatabuddyAgentBillingMode;
	conversationId?: string;
	history?: ConversationMessage[];
	input: string;
	memoryUserId?: string | null;
	modelOverride?: string | null;
	mutationMode?: DatabuddyAgentMutationMode;
	persistConversation?: boolean;
	slackContext?: DatabuddyAgentSlackContext | null;
	source?: DatabuddyAgentSource;
	timeoutMs?: number;
	timezone?: string;
	websiteDomain?: string | null;
	websiteId?: string | null;
}

export interface DatabuddyAgentResult {
	answer: string;
	conversationId: string;
}

export type DatabuddyAgentToolTrace = McpAgentToolTrace;

export interface DatabuddyAgentTraceResult extends DatabuddyAgentResult {
	steps: number;
	toolCalls: DatabuddyAgentToolTrace[];
	usage: {
		inputTokens: number;
		outputTokens: number;
		totalTokens?: number;
	};
}

interface ResolvedAgentActor {
	apiKey: ApiKeyRow | null;
	requestHeaders: Headers;
	userId: string | null;
}

export async function askDatabuddyAgent(
	options: DatabuddyAgentOptions
): Promise<DatabuddyAgentResult> {
	const prepared = await prepareDatabuddyAgentCall(options);
	const answer = await runMcpAgent({
		apiKey: prepared.actor.apiKey,
		conversationId: prepared.conversationId,
		priorMessages: prepared.history,
		question: options.input,
		requestHeaders: prepared.actor.requestHeaders,
		abortSignal: options.abortSignal,
		billingMode: options.billingMode,
		memoryUserId: prepared.memoryUserId,
		mutationMode: options.mutationMode,
		slackContext: options.slackContext,
		source: prepared.source,
		modelOverride: options.modelOverride,
		storeMemory: options.persistConversation !== false,
		timeoutMs: options.timeoutMs,
		timezone: options.timezone,
		userId: prepared.actor.userId,
		websiteDomain: options.websiteDomain,
		websiteId: options.websiteId,
	});

	await persistAgentConversation(options, prepared, answer);

	return { answer, conversationId: prepared.conversationId };
}

export async function traceDatabuddyAgent(
	options: DatabuddyAgentOptions
): Promise<DatabuddyAgentTraceResult> {
	const prepared = await prepareDatabuddyAgentCall(options);
	const result = await runMcpAgentWithTrace({
		apiKey: prepared.actor.apiKey,
		abortSignal: options.abortSignal,
		conversationId: prepared.conversationId,
		billingMode: options.billingMode,
		modelOverride: options.modelOverride,
		memoryUserId: prepared.memoryUserId,
		mutationMode: options.mutationMode,
		priorMessages: prepared.history,
		question: options.input,
		requestHeaders: prepared.actor.requestHeaders,
		source: prepared.source,
		slackContext: options.slackContext,
		storeMemory: options.persistConversation !== false,
		timeoutMs: options.timeoutMs,
		timezone: options.timezone,
		userId: prepared.actor.userId,
		websiteDomain: options.websiteDomain,
		websiteId: options.websiteId,
	});

	await persistAgentConversation(options, prepared, result.answer);

	return {
		answer: result.answer,
		conversationId: prepared.conversationId,
		steps: result.steps,
		toolCalls: result.toolCalls,
		usage: {
			inputTokens: result.usage.inputTokens ?? 0,
			outputTokens: result.usage.outputTokens ?? 0,
			...(result.usage.totalTokens === undefined
				? {}
				: { totalTokens: result.usage.totalTokens }),
		},
	};
}

export async function* streamDatabuddyAgent(
	options: DatabuddyAgentOptions
): AsyncGenerator<string> {
	const prepared = await prepareDatabuddyAgentCall(options);
	let answer = "";

	for await (const chunk of streamMcpAgentText({
		apiKey: prepared.actor.apiKey,
		abortSignal: options.abortSignal,
		conversationId: prepared.conversationId,
		billingMode: options.billingMode,
		memoryUserId: prepared.memoryUserId,
		priorMessages: prepared.history,
		question: options.input,
		requestHeaders: prepared.actor.requestHeaders,
		source: prepared.source,
		slackContext: options.slackContext,
		modelOverride: options.modelOverride,
		mutationMode: options.mutationMode,
		storeMemory: options.persistConversation !== false,
		timeoutMs: options.timeoutMs,
		timezone: options.timezone,
		userId: prepared.actor.userId,
		websiteDomain: options.websiteDomain,
		websiteId: options.websiteId,
	})) {
		answer += chunk;
		yield chunk;
	}

	await persistAgentConversation(options, prepared, answer);
}

async function prepareDatabuddyAgentCall(options: DatabuddyAgentOptions) {
	const actor = await resolveDatabuddyAgentActor(options.actor);
	const conversationId = options.conversationId ?? crypto.randomUUID();
	const memoryUserId = options.memoryUserId ?? actor.userId;
	const history =
		options.history ??
		(await getConversationHistory(conversationId, memoryUserId, actor.apiKey));

	return {
		actor,
		conversationId,
		history: history.length > 0 ? history : undefined,
		memoryUserId,
		source: options.source ?? "mcp",
	};
}

async function resolveDatabuddyAgentActor(
	actor: DatabuddyAgentActor
): Promise<ResolvedAgentActor> {
	if (actor.type === "session") {
		return {
			apiKey: null,
			requestHeaders: actor.requestHeaders,
			userId: actor.userId,
		};
	}

	if (actor.type === "api_key") {
		return {
			apiKey: actor.apiKey,
			requestHeaders: actor.requestHeaders ?? new Headers(),
			userId: "userId" in actor ? (actor.userId ?? null) : actor.apiKey.userId,
		};
	}

	const requestHeaders =
		actor.requestHeaders ?? createApiKeyHeaders(actor.secret);
	const result = await resolveApiKey(requestHeaders);
	if (!result.key) {
		throw new Error(`Databuddy API key is ${result.outcome}.`);
	}
	if (
		actor.expectedOrganizationId &&
		result.key.organizationId !== actor.expectedOrganizationId
	) {
		throw new Error("Databuddy API key does not belong to this organization.");
	}

	return {
		apiKey: result.key,
		requestHeaders,
		userId: "userId" in actor ? (actor.userId ?? null) : result.key.userId,
	};
}

async function persistAgentConversation(
	options: DatabuddyAgentOptions,
	prepared: Awaited<ReturnType<typeof prepareDatabuddyAgentCall>>,
	answer: string
): Promise<void> {
	if (options.persistConversation === false) {
		return;
	}

	await appendToConversation(
		prepared.conversationId,
		prepared.memoryUserId,
		prepared.actor.apiKey,
		options.input,
		answer.trim() || "No response generated.",
		prepared.history
	);
}

function createApiKeyHeaders(secret: string): Headers {
	return new Headers({ Authorization: `Bearer ${secret}` });
}
