import type { ApiKeyRow } from "@databuddy/api-keys/resolve";

export type DatabuddyAgentSource = "dashboard" | "mcp" | "slack";
export type DatabuddyAgentBillingMode = "bill" | "skip";
export type DatabuddyAgentMutationMode = "allow" | "dry-run";
export type DatabuddyAgentUserErrorCode = "agent_credits_exhausted";

export declare class DatabuddyAgentUserError extends Error {
	readonly code: DatabuddyAgentUserErrorCode;
	readonly expose: true;
	constructor(options: {
		code: DatabuddyAgentUserErrorCode;
		message: string;
	});
}

export declare function isDatabuddyAgentUserError(
	error: unknown
): error is DatabuddyAgentUserError;

export interface ConversationMessage {
	content: string;
	role: "user" | "assistant";
}

export interface DatabuddyAgentSlackMessage {
	authorName?: string;
	text: string;
	threadTs?: string;
	ts?: string;
	userId?: string;
}

export interface DatabuddyAgentSlackThreadResult {
	channelId: string;
	hasMore?: boolean;
	messages: DatabuddyAgentSlackMessage[];
	threadTs: string;
}

export interface DatabuddyAgentSlackChannelHistoryResult {
	channelId: string;
	hasMore?: boolean;
	messages: DatabuddyAgentSlackMessage[];
}

export interface DatabuddyAgentSlackContext {
	readCurrentThread?: () => Promise<DatabuddyAgentSlackThreadResult>;
	readRecentChannelMessages?: (input: {
		limit?: number;
	}) => Promise<DatabuddyAgentSlackChannelHistoryResult>;
}

export interface SlackThreadReplyRelevanceInput {
	botUserId?: string;
	currentUserId?: string;
	text: string;
	threadMessages?: SlackThreadReplyMessage[];
	timeoutMs?: number;
}

export interface SlackThreadReplyMessage {
	authorName?: string;
	text: string;
	ts?: string;
	userId?: string;
}

export interface SlackThreadReplyRelevance {
	confidence: number;
	reason:
		| "bot_mentioned"
		| "direct_request"
		| "analytics_request"
		| "human_to_human"
		| "side_chatter"
		| "ambiguous";
	shouldReply: boolean;
}

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

export interface DatabuddyAgentToolTrace {
	index: number;
	input: unknown;
	name: string;
	output: unknown;
}

export interface DatabuddyAgentTraceResult extends DatabuddyAgentResult {
	steps: number;
	toolCalls: DatabuddyAgentToolTrace[];
	usage: {
		inputTokens: number;
		outputTokens: number;
		totalTokens?: number;
	};
}

export declare function askDatabuddyAgent(
	options: DatabuddyAgentOptions
): Promise<DatabuddyAgentResult>;

export declare function traceDatabuddyAgent(
	options: DatabuddyAgentOptions
): Promise<DatabuddyAgentTraceResult>;

export declare function streamDatabuddyAgent(
	options: DatabuddyAgentOptions
): AsyncGenerator<string>;

export declare function classifySlackThreadReplyRelevance(
	input: SlackThreadReplyRelevanceInput
): Promise<SlackThreadReplyRelevance | null>;
