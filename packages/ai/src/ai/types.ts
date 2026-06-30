import type { UIMessage, UITool } from "ai";

export type UITools = Record<string, UITool>;

export interface ChatMessageMetadata {
	toolCall?: {
		toolName: string;
		toolParams: Record<string, unknown>;
	};
}

export type MessageDataParts = Record<string, unknown> & {
	aiComponent?: {
		type: string;
		[key: string]: unknown;
	};
	usage?: {
		inputTokens: number;
		outputTokens: number;
		totalTokens?: number;
	};
	toolChoice?: string;
	agentChoice?: string;
};

export type UIChatMessage = UIMessage<
	ChatMessageMetadata,
	MessageDataParts,
	UITools
>;
