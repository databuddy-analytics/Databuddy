/**
 * Content types for input/output arrays
 */
export type MessageContent =
	| { type: "text"; text: string }
	| { type: "reasoning"; text: string }
	| { type: "tool-call"; id: string; function: { name: string; arguments: string } }
	| { type: "tool-result"; toolCallId: string; toolName: string; output: unknown; isError?: boolean }
	| { type: "file"; file: string; mediaType: string }
	| { type: "image"; image: string; mediaType: string }
	| { type: "source"; sourceType: string; id: string; url: string; title: string };

/**
 * Message format for input/output
 */
export interface AIMessage {
	role: string;
	content: string | MessageContent[];
}

/**
 * Token usage from AI model calls
 */
export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
	cachedInputTokens?: number;
	cacheCreationInputTokens?: number;
	reasoningTokens?: number;
	webSearchCount?: number;
}

/**
 * Cost breakdown from TokenLens
 */
export interface TokenCost {
	inputTokenCostUSD?: number;
	outputTokenCostUSD?: number;
	totalTokenCostUSD?: number;
}

/**
 * Tool call information
 */
export interface ToolCallInfo {
	toolCallCount: number;
	toolResultCount: number;
	toolCallNames: string[];
	availableTools?: string[];
}

/**
 * Error information for failed AI calls
 */
export interface AIError {
	name: string;
	message: string;
	stack?: string;
}

/**
 * Complete AI call log entry
 */
export interface AICall {
	timestamp: Date;
	traceId: string;
	type: "generate" | "stream";
	model: string;
	provider: string;
	finishReason?: string;
	input: AIMessage[];
	output: AIMessage[];
	usage: TokenUsage;
	cost: TokenCost;
	tools: ToolCallInfo;
	error?: AIError;
	durationMs: number;
	httpStatus?: number;
	params?: Record<string, unknown>;
}

/**
 * Transport function for sending log entries
 */
export type Transport = (call: AICall) => Promise<void> | void;

/**
 * Configuration options for Databuddy LLM tracking
 */
export interface DatabuddyLLMOptions {
	/**
	 * API endpoint for sending logs (should include /llm path)
	 * @default process.env.DATABUDDY_API_URL or 'https://basket.databuddy.cc/llm'
	 */
	apiUrl?: string;
	/**
	 * API key for authentication
	 * @default process.env.DATABUDDY_API_KEY
	 */
	apiKey?: string;
	/**
	 * Client/Website ID for tracking
	 * @default process.env.DATABUDDY_CLIENT_ID
	 */
	clientId?: string;
	/**
	 * Custom transport function to send log entries
	 * If provided, overrides default HTTP transport
	 */
	transport?: Transport;
	/**
	 * Whether to compute costs using TokenLens
	 * @default true
	 */
	computeCosts?: boolean;
	/**
	 * Privacy mode - when true, input/output content is not captured
	 * @default false
	 */
	privacyMode?: boolean;
	/**
	 * Maximum size for input/output content in bytes
	 * @default 1048576 (1MB)
	 */
	maxContentSize?: number;
	/**
	 * Called on successful AI calls
	 */
	onSuccess?: (call: AICall) => void;
	/**
	 * Called on failed AI calls
	 */
	onError?: (call: AICall) => void;
}

/**
 * Configuration options for tracking individual models
 */
export interface TrackOptions {
	/**
	 * Transport function to send log entries
	 * If not provided, uses the transport from DatabuddyLLM instance
	 */
	transport?: Transport;
	/**
	 * Trace ID to link related calls together
	 */
	traceId?: string;
	/**
	 * Client ID for this specific call (overrides instance-level clientId)
	 */
	clientId?: string;
	/**
	 * Whether to compute costs using TokenLens
	 * @default true
	 */
	computeCosts?: boolean;
	/**
	 * Privacy mode - when true, input/output content is not captured
	 * @default false
	 */
	privacyMode?: boolean;
	/**
	 * Called on successful AI calls
	 */
	onSuccess?: (call: AICall) => void;
	/**
	 * Called on failed AI calls
	 */
	onError?: (call: AICall) => void;
}
