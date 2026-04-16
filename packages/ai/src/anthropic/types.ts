/** Token usage statistics */
export interface AnthropicUsage {
	cacheCreationInputTokens?: number;
	cachedInputTokens?: number;
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	webSearchCount?: number;
}

/** Raw Anthropic API usage format */
export interface AnthropicRawUsage {
	cache_creation_input_tokens?: number;
	cache_read_input_tokens?: number;
	input_tokens?: number;
	output_tokens?: number;
	server_tool_use?: { web_search_requests?: number };
}

/** Cost breakdown in USD */
export interface AnthropicCost {
	inputCostUSD?: number;
	outputCostUSD?: number;
	totalCostUSD?: number;
}

/** Tool usage information */
export interface AnthropicToolInfo {
	availableTools?: string[];
	callCount: number;
	calledTools: string[];
	resultCount: number;
}

/** Error details */
export interface AnthropicErrorInfo {
	message: string;
	name: string;
	stack?: string;
}

/** Message content types */
export interface AnthropicTextContent {
	text: string;
	type: "text";
}

export interface AnthropicToolCallContent {
	function: { name: string; arguments: string };
	id: string;
	type: "tool-call";
}

export interface AnthropicToolResultContent {
	output: unknown;
	toolCallId: string;
	toolName: string;
	type: "tool-result";
}

export type AnthropicMessageContent =
	| AnthropicTextContent
	| AnthropicToolCallContent
	| AnthropicToolResultContent
	| { type: string; [key: string]: unknown };

/** A message in the conversation */
export interface AnthropicMessage {
	content: string | AnthropicMessageContent[];
	role: string;
}

/** Complete LLM call record */
export interface AnthropicLLMCall {
	cost: AnthropicCost;
	durationMs: number;
	error?: AnthropicErrorInfo;
	finishReason?: string;
	httpStatus?: number;
	input: AnthropicMessage[];
	model: string;
	output: AnthropicMessage[];
	provider: string;
	timestamp: Date;
	tools: AnthropicToolInfo;
	traceId: string;
	type: "generate" | "stream";
	usage: AnthropicUsage;
}

/** Function that sends LLM call data */
export type AnthropicTransport = (
	call: AnthropicLLMCall
) => Promise<void> | void;

/** Tracker options */
export interface AnthropicTrackerOptions {
	apiKey?: string;
	apiUrl?: string;
	computeCosts?: boolean;
	onError?: (call: AnthropicLLMCall) => void;
	onSuccess?: (call: AnthropicLLMCall) => void;
	privacyMode?: boolean;
	transport?: AnthropicTransport;
}

/** Per-call options */
export interface AnthropicCallOptions {
	computeCosts?: boolean;
	onError?: (call: AnthropicLLMCall) => void;
	onSuccess?: (call: AnthropicLLMCall) => void;
	privacyMode?: boolean;
	traceId?: string;
}
