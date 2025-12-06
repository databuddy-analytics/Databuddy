import type { UIMessage, UITool } from "ai";

export type UITools = Record<string, UITool>;

export type ChatMessageMetadata = {
	toolCall?: {
		toolName: string;
		toolParams: Record<string, unknown>;
	};
};

export type MessageDataParts = Record<string, unknown> & {
	toolChoice?: string;
	agentChoice?: string;
};

export type UIChatMessage = UIMessage<
	ChatMessageMetadata,
	MessageDataParts,
	UITools
>;
