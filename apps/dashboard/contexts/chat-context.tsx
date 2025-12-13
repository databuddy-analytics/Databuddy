"use client";

import { useChat as useAiSdkChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { createContext, useContext } from "react";
import { useAgentChatTransport } from "@/app/(main)/websites/[id]/agent/_components/hooks/use-agent-chat";

type ChatContextType = ReturnType<typeof useAiSdkChat<UIMessage>>;

const ChatContext = createContext<ChatContextType | null>(null);

export function ChatProvider({
	chatId,
	initialMessages,
	children,
}: {
	chatId: string;
	initialMessages: UIMessage[];
	children: React.ReactNode;
}) {
	const transport = useAgentChatTransport(chatId);
	const chat = useAiSdkChat<UIMessage>({
		id: chatId,
		transport,
		messages: initialMessages,
	});

	return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

export function useChat() {
	const chat = useContext(ChatContext);

	if (!chat) {
		throw new Error("useChat must be used within a `ChatProvider`");
	}

	return chat;
}

export function useChatStatus() {
	const { status } = useChat();
	return status;
}
