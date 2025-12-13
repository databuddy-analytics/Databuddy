import type { ChatStatus, UIMessage } from "ai";
import { useMemo } from "react";
import type { AgentStatus } from "../agent-atoms";
import { getToolMessage } from "../agent-commands";

type ChatStatusResult = {
	agentStatus: AgentStatus;
	currentToolCall: string | null;
	toolMessage: string | null;
	displayMessage: string | null;
	hasTextContent: boolean;
	isStreaming: boolean;
};

function getTextContent(message: UIMessage): string {
	if (!message.parts) {
		return "";
	}
	return message.parts
		.filter(
			(part): part is { type: "text"; text: string } => part.type === "text"
		)
		.map((part) => part.text)
		.join("");
}

export function useChatStatus(
	messages: UIMessage[],
	status: ChatStatus
): ChatStatusResult {
	return useMemo(() => {
		const isLoading = status === "streaming" || status === "submitted";
		const agentStatus: AgentStatus = isLoading ? "generating" : "idle";

		const defaultResult: ChatStatusResult = {
			agentStatus,
			currentToolCall: null,
			toolMessage: null,
			displayMessage: null,
			hasTextContent: false,
			isStreaming: isLoading,
		};

		if (messages.length === 0) {
			return { ...defaultResult, displayMessage: null };
		}

		const lastMessage = messages.at(-1);
		if (lastMessage?.role !== "assistant") {
			return { ...defaultResult, displayMessage: null };
		}

		const hasTextContent = Boolean(getTextContent(lastMessage).trim());
		const toolMessage = getToolMessage(null);

		let displayMessage: string | null = null;
		if (!hasTextContent && isLoading) {
			displayMessage = toolMessage;
		}

		return {
			agentStatus,
			currentToolCall: null,
			toolMessage,
			displayMessage,
			hasTextContent,
			isStreaming: isLoading,
		};
	}, [messages, status]);
}
