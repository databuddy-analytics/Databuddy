"use client";

import { Provider as ChatProvider, createChatStore } from "@ai-sdk-tools/store";
import type { UIMessage } from "ai";
import { useMemo } from "react";

type ChatProviderWrapperProps = {
	chatId: string;
	initialMessages: UIMessage[];
	children: React.ReactNode;
};

export function ChatProviderWrapper({
	chatId,
	initialMessages,
	children,
}: ChatProviderWrapperProps) {
	// Create store with chat ID and messages properly associated
	const store = useMemo(() => {
		const newStore = createChatStore<UIMessage>();
		if (initialMessages.length > 0) {
			newStore.getState().setNewChat(chatId, initialMessages);
		} else {
			newStore.getState().setId(chatId);
		}
		return newStore;
	}, [chatId, initialMessages]);

	return <ChatProvider store={store}>{children}</ChatProvider>;
}
