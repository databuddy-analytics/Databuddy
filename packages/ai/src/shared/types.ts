/** Token usage statistics */
export interface Usage {
	cacheCreationInputTokens?: number;
	cachedInputTokens?: number;
	inputTokens: number;
	outputTokens: number;
	reasoningTokens?: number;
	totalTokens: number;
	webSearchCount?: number;
}

/** Cost breakdown in USD */
export interface Cost {
	inputCostUSD?: number;
	outputCostUSD?: number;
	totalCostUSD?: number;
}

/** Tool usage information */
export interface ToolInfo {
	availableTools?: string[];
	callCount: number;
	calledTools: string[];
	resultCount: number;
}

/** Error details for failed calls */
export interface ErrorInfo {
	message: string;
	name: string;
	stack?: string;
}

/** Text content in a message */
export interface TextContent {
	text: string;
	type: "text";
}

/** Reasoning/thinking content from models like o1 */
export interface ReasoningContent {
	text: string;
	type: "reasoning";
}

/** Tool/function call content */
export interface ToolCallContent {
	function: { name: string; arguments: string };
	id: string;
	type: "tool-call";
}

/** Tool result content */
export interface ToolResultContent {
	isError?: boolean;
	output: unknown;
	toolCallId: string;
	toolName: string;
	type: "tool-result";
}

/** File attachment content */
export interface FileContent {
	file: string;
	mediaType: string;
	type: "file";
}

/** Image attachment content */
export interface ImageContent {
	image: string;
	mediaType: string;
	type: "image";
}

/** Web search source reference */
export interface SourceContent {
	id: string;
	sourceType: string;
	title: string;
	type: "source";
	url: string;
}

/** Union of all possible message content types */
export type MessageContent =
	| TextContent
	| ReasoningContent
	| ToolCallContent
	| ToolResultContent
	| FileContent
	| ImageContent
	| SourceContent
	| { type: string; [key: string]: unknown };

/** A message in the conversation */
export interface Message {
	content: string | MessageContent[];
	role: string;
}

/** Complete LLM call record */
export interface LLMCall {
	cost: Cost;
	durationMs: number;
	error?: ErrorInfo;
	finishReason?: string;
	httpStatus?: number;
	input: Message[];
	model: string;
	output: Message[];
	provider: string;
	timestamp: Date;
	tools: ToolInfo;
	traceId: string;
	type: "generate" | "stream" | "embedding";
	usage: Usage;
}

/** Function that sends LLM call data */
export type Transport = (call: LLMCall) => Promise<void> | void;

/** Base tracker options */
export interface TrackerOptions {
	apiKey?: string;
	apiUrl?: string;
	computeCosts?: boolean;
	maxContentSize?: number;
	onError?: (call: LLMCall) => void;
	onSuccess?: (call: LLMCall) => void;
	privacyMode?: boolean;
	transport?: Transport;
}

/** Per-call tracking options */
export interface CallOptions {
	computeCosts?: boolean;
	onError?: (call: LLMCall) => void;
	onSuccess?: (call: LLMCall) => void;
	privacyMode?: boolean;
	traceId?: string;
	transport?: Transport;
}
