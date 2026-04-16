/** Token usage statistics */
export interface OpenAIUsage {
	cachedInputTokens?: number;
	inputTokens: number;
	outputTokens: number;
	reasoningTokens?: number;
	totalTokens: number;
	webSearchCount?: number;
}

/** Cost breakdown in USD */
export interface OpenAICost {
	inputCostUSD?: number;
	outputCostUSD?: number;
	totalCostUSD?: number;
}

/** Tool usage information */
export interface OpenAIToolInfo {
	availableTools?: string[];
	callCount: number;
	calledTools: string[];
	resultCount: number;
}

/** Error details */
export interface OpenAIErrorInfo {
	message: string;
	name: string;
	stack?: string;
}

/** Message content types */
export interface OpenAITextContent {
	text: string;
	type: "text";
}

export interface OpenAIToolCallContent {
	function: { name: string; arguments: string };
	id: string;
	type: "tool-call";
}

export type OpenAIMessageContent =
	| OpenAITextContent
	| OpenAIToolCallContent
	| { type: string; [key: string]: unknown };

/** A message in the conversation */
export interface OpenAIMessage {
	content: string | OpenAIMessageContent[];
	role: string;
}

/** Complete LLM call record */
export interface OpenAILLMCall {
	cost: OpenAICost;
	durationMs: number;
	error?: OpenAIErrorInfo;
	finishReason?: string;
	httpStatus?: number;
	input: OpenAIMessage[];
	model: string;
	output: OpenAIMessage[];
	provider: string;
	timestamp: Date;
	tools: OpenAIToolInfo;
	traceId: string;
	type: "generate" | "stream";
	usage: OpenAIUsage;
}

/** Function that sends LLM call data */
export type OpenAITransport = (call: OpenAILLMCall) => Promise<void> | void;

/** Tracker options */
export interface OpenAITrackerOptions {
	apiKey?: string;
	apiUrl?: string;
	computeCosts?: boolean;
	onError?: (call: OpenAILLMCall) => void;
	onSuccess?: (call: OpenAILLMCall) => void;
	privacyMode?: boolean;
	transport?: OpenAITransport;
}

/** Per-call options */
export interface OpenAICallOptions {
	computeCosts?: boolean;
	onError?: (call: OpenAILLMCall) => void;
	onSuccess?: (call: OpenAILLMCall) => void;
	privacyMode?: boolean;
	traceId?: string;
}
