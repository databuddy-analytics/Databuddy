import { useChat } from "@ai-sdk-tools/store";
import type { UIMessage } from "ai";
import { useMemo } from "react";
import type { AgentStatus } from "../agent-atoms";
import { getStatusMessage, getToolMessage } from "../agent-commands";

type ChatStatusResult = {
	agentStatus: AgentStatus;
	currentToolCall: string | null;
	toolMessage: string | null;
	statusMessage: string | null;
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

export function useChatStatus(): ChatStatusResult {
	const { messages, status } = useChat<UIMessage>();

	return useMemo(() => {
		const isLoading = status === "streaming" || status === "submitted";
		const agentStatus: AgentStatus = isLoading ? "generating" : "idle";

		const defaultResult: ChatStatusResult = {
			agentStatus,
			currentToolCall: null,
			toolMessage: null,
			statusMessage: getStatusMessage(agentStatus),
			displayMessage: null,
			hasTextContent: false,
			isStreaming: isLoading,
		};

		if (messages.length === 0) {
			return { ...defaultResult, displayMessage: defaultResult.statusMessage };
		}

		const lastMessage = messages.at(-1);
		if (lastMessage?.role !== "assistant") {
			return { ...defaultResult, displayMessage: defaultResult.statusMessage };
		}

		const hasTextContent = Boolean(getTextContent(lastMessage).trim());
		const toolMessage = getToolMessage(null);
		const statusMessage = getStatusMessage(agentStatus);

		let displayMessage: string | null = null;
		if (!hasTextContent && isLoading) {
			displayMessage = toolMessage ?? statusMessage;
		}

		return {
			agentStatus,
			currentToolCall: null,
			toolMessage,
			statusMessage,
			displayMessage,
			hasTextContent,
			isStreaming: isLoading,
		};
	}, [messages, status]);
}
