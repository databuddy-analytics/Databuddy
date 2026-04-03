import type { ChatStatus, UIMessage } from "ai";
import { useMemo } from "react";
import { formatToolLabel } from "@/lib/tool-display";
import type { AgentStatus } from "../agent-atoms";

const TOOL_PREFIX_REGEX = /^tool-/;

interface ChatStatusResult {
	agentStatus: AgentStatus;
	currentToolCall: string | null;
	displayMessage: string | null;
	hasTextContent: boolean;
	isStreaming: boolean;
	toolMessage: string | null;
}

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

function findActiveToolName(message: UIMessage): string | null {
	if (!message.parts) {
		return null;
	}
	for (let i = message.parts.length - 1; i >= 0; i--) {
		const part = message.parts[i];
		if (part.type?.startsWith("tool-")) {
			const toolPart = part as {
				type: string;
				input?: Record<string, unknown>;
				output?: unknown;
			};
			const toolName = part.type.replace(TOOL_PREFIX_REGEX, "");
			if (!toolPart.output) {
				return formatToolLabel(toolName, toolPart.input ?? {});
			}
			return null;
		}
	}
	return null;
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
		const activeToolLabel = isLoading ? findActiveToolName(lastMessage) : null;

		let displayMessage: string | null = null;
		if (!hasTextContent && isLoading) {
			displayMessage = activeToolLabel;
		}

		return {
			agentStatus,
			currentToolCall: activeToolLabel,
			toolMessage: activeToolLabel,
			displayMessage,
			hasTextContent,
			isStreaming: isLoading,
		};
	}, [messages, status]);
}
