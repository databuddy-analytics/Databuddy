import type { ApiKeyRow } from "@databuddy/api-keys/resolve";
import { ratelimit } from "@databuddy/redis/rate-limit";
import { db } from "@databuddy/db";
import type { LanguageModelUsage } from "ai";
import {
	type AgentBillingAccess,
	getAgentBillingAccess,
	resolveAgentBillingCustomerId,
} from "../ai/agents/execution";
import type { AgentSource } from "../ai/config/models";
import {
	appendToConversation,
	getConversationHistory,
	type ConversationMessage,
} from "../ai/mcp/conversation-store";
import {
	type McpAgentToolTrace,
	type RunMcpAgentOptions,
	runMcpAgent,
	runMcpAgentWithTrace,
	streamMcpAgentText,
} from "../ai/mcp/run-agent";
import type { DatabuddyAgentSlackContext } from "../ai/mcp/slack-context";
import {
	getAccessibleWebsites,
	getOrganizationWebsites,
	type WebsiteSummary,
} from "../lib/accessible-websites";
import { mergeWideEvent } from "../lib/tracing";
import { matchesWebsiteDomain } from "../lib/website-domain";
import { AgentError } from "./errors";
import {
	ComponentStreamSplitter,
	componentToPlainText,
	splitAgentText,
} from "./render";

export type { ConversationMessage } from "../ai/mcp/conversation-store";
export { AgentError, toAgentErrorResponse } from "./errors";
export {
	classifySlackThreadReplyRelevance,
	type SlackThreadReplyRelevance,
	type SlackThreadReplyRelevanceInput,
} from "./slack-relevance";
export type {
	DatabuddyAgentSlackChannelHistoryResult,
	DatabuddyAgentSlackContext,
	DatabuddyAgentSlackMessage,
	DatabuddyAgentSlackThreadResult,
} from "../ai/mcp/slack-context";

export type DatabuddyAgentSource = AgentSource;
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
			activeOrganizationId: string | null;
			requestHeaders: Headers;
			type: "session";
			userId: string;
	  };

interface AgentRequestInput {
	actor: DatabuddyAgentActor;
	billingMode?: DatabuddyAgentBillingMode;
	organizationId?: string | null;
	rateLimit?: "agent:ask" | "agent:chat";
	websiteDomain?: string | null;
	websiteId?: string | null;
}

export interface AgentPrincipal {
	accessibleWebsites: WebsiteSummary[];
	apiKey: ApiKeyRow | null;
	billingAccess?: AgentBillingAccess;
	billingCustomerId: string | null;
	organizationId: string;
	requestHeaders: Headers;
	userId: string | null;
	website: WebsiteSummary | null;
}

export type DatabuddyAgentOptions = (
	| AgentRequestInput
	| { principal: AgentPrincipal }
) & {
	abortSignal?: AbortSignal;
	conversationId?: string;
	history?: ConversationMessage[];
	historyInput?: string;
	input: string;
	memoryUserId?: string | null;
	modelOverride?: string | null;
	mutationMode?: DatabuddyAgentMutationMode;
	onToolEvent?: (toolNames: string[]) => void;
	/** Streaming only: called once after completion and usage settlement. */
	onToolTrace?: (trace: DatabuddyAgentToolTrace[]) => void;
	output?: "markdown";
	persistConversation?: boolean;
	slackContext?: DatabuddyAgentSlackContext | null;
	source?: DatabuddyAgentSource;
	timeoutMs?: number;
	timezone?: string;
};

export interface DatabuddyAgentResult {
	answer: string;
	conversationId: string;
}

export type DatabuddyAgentToolTrace = McpAgentToolTrace;

export interface DatabuddyAgentTraceResult extends DatabuddyAgentResult {
	steps: number;
	toolCalls: DatabuddyAgentToolTrace[];
	usage: LanguageModelUsage;
}

const AGENT_RATE_LIMIT_PER_MINUTE = 30;

export async function prepareAgentRequest(
	input: AgentRequestInput
): Promise<AgentPrincipal> {
	const { actor } = input;
	const apiKey = actor.type === "api_key" ? actor.apiKey : null;
	const userId = actor.userId ?? apiKey?.userId ?? null;
	if (
		apiKey &&
		input.organizationId &&
		input.organizationId !== apiKey.organizationId
	) {
		throw new AgentError(
			"access_denied",
			"The API key does not belong to this organization."
		);
	}
	const organizationId =
		input.organizationId ??
		apiKey?.organizationId ??
		(actor.type === "session" ? actor.activeOrganizationId : null);
	if (!organizationId) {
		throw new AgentError("workspace_required");
	}

	if (actor.type === "session") {
		if (organizationId !== actor.activeOrganizationId) {
			throw new AgentError(
				"access_denied",
				"Switch to this organization before asking Databuddy."
			);
		}
		const membership = await db.query.member.findFirst({
			where: { organizationId, userId: actor.userId },
			columns: { id: true },
		});
		if (!membership) {
			throw new AgentError(
				"access_denied",
				"You are not a member of this organization."
			);
		}
	}

	if (input.rateLimit) {
		const caller = actor.userId ?? `apikey:${apiKey?.id}`;
		const limit = await ratelimit(
			`${input.rateLimit}:${caller}:${organizationId}`,
			AGENT_RATE_LIMIT_PER_MINUTE,
			60
		);
		if (!limit.success) {
			throw new AgentError("rate_limited");
		}
	}

	const billed = input.billingMode !== "skip";
	mergeWideEvent({ agent_billing_mode: billed ? "bill" : "skip" });
	const [accessibleWebsites, billing] = await Promise.all([
		actor.type === "session"
			? getOrganizationWebsites(organizationId)
			: getAccessibleWebsites({ apiKey, organizationId, user: null }),
		billed
			? resolveAgentBillingCustomerId({ apiKey, organizationId, userId }).then(
					async (customerId) => ({
						customerId,
						access: await getAgentBillingAccess(customerId),
					})
				)
			: null,
	]);
	const website = selectRequestedWebsite(accessibleWebsites, input);
	if (billing && !billing.access.allowed) {
		mergeWideEvent({ agent_rejected: "out_of_credits" });
		throw new AgentError("agent_credits_exhausted");
	}

	return {
		accessibleWebsites,
		apiKey,
		billingAccess: billing?.access,
		billingCustomerId: billing?.customerId ?? null,
		organizationId,
		requestHeaders: actor.requestHeaders ?? new Headers(),
		userId,
		website,
	};
}

function selectRequestedWebsite(
	websites: WebsiteSummary[],
	{ websiteDomain, websiteId }: AgentRequestInput
): WebsiteSummary | null {
	if (!(websiteId || websiteDomain)) {
		return null;
	}
	const match = websites.find(
		(site) =>
			(!websiteId || site.id === websiteId) &&
			(!websiteDomain || matchesWebsiteDomain(site.domain, websiteDomain))
	);
	if (!match) {
		throw new AgentError(
			"access_denied",
			"Website is not accessible in this organization"
		);
	}
	return match;
}

export async function askDatabuddyAgent(
	options: DatabuddyAgentOptions
): Promise<DatabuddyAgentResult> {
	const run = await prepareDatabuddyAgentCall(options);
	const answer = renderAnswer(await runMcpAgent(run), run.output);

	await persistAgentConversation(run, answer);

	return { answer, conversationId: run.conversationId };
}

export async function traceDatabuddyAgent(
	options: DatabuddyAgentOptions
): Promise<DatabuddyAgentTraceResult> {
	const run = await prepareDatabuddyAgentCall(options);
	const result = await runMcpAgentWithTrace(run);
	const answer = renderAnswer(result.answer, run.output);

	await persistAgentConversation(run, answer);

	return {
		answer,
		conversationId: run.conversationId,
		steps: result.steps,
		toolCalls: result.toolCalls,
		usage: result.usage,
	};
}

export async function* streamDatabuddyAgent(
	options: DatabuddyAgentOptions
): AsyncGenerator<string> {
	const run = await prepareDatabuddyAgentCall(options);
	const splitter =
		run.output === "markdown"
			? new ComponentStreamSplitter(componentToPlainText)
			: null;
	let answer = "";

	for await (const chunk of streamMcpAgentText(run)) {
		const text = splitter ? splitter.push(chunk) : chunk;
		if (text) {
			answer += text;
			yield text;
		}
	}
	const tail = splitter?.flush().text;
	if (tail) {
		answer += tail;
		yield tail;
	}

	await persistAgentConversation(run, answer);
}

function renderAnswer(answer: string, output: "markdown" | undefined): string {
	return output === "markdown"
		? splitAgentText(answer, componentToPlainText).text
		: answer;
}

async function prepareDatabuddyAgentCall(
	options: DatabuddyAgentOptions
): Promise<RunMcpAgentOptions> {
	const principal =
		"principal" in options
			? options.principal
			: await prepareAgentRequest(options);
	const conversationId = options.conversationId ?? crypto.randomUUID();
	const memoryUserId = options.memoryUserId ?? principal.userId;
	// Slack threads belong to the integration; personal memory stays speaker-scoped.
	const conversationUserId =
		options.source === "slack" && principal.apiKey ? null : memoryUserId;
	const history =
		options.history ??
		(await getConversationHistory(
			conversationId,
			conversationUserId,
			principal.apiKey
		));

	return {
		...options,
		conversationId,
		conversationUserId,
		history: history.length > 0 ? history : undefined,
		memoryUserId,
		principal,
		source: options.source ?? "mcp",
	};
}

async function persistAgentConversation(
	run: RunMcpAgentOptions,
	answer: string
): Promise<void> {
	if (run.persistConversation === false) {
		return;
	}

	await appendToConversation(
		run.conversationId,
		run.conversationUserId,
		run.principal.apiKey,
		run.historyInput ?? run.input,
		answer.trim(),
		run.history
	);
}
