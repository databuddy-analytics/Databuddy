"use client";

import { useChat, useChatActions as useStoreChatActions } from "@ai-sdk-tools/store";
import type { UIMessage } from "ai";
import { useAgentChatTransport } from "./use-agent-chat";

export function useChatActions(chatId: string) {
    const transport = useAgentChatTransport();
    const { status } = useChat<UIMessage>({ id: chatId, transport });
    const { sendMessage, stop } = useStoreChatActions();

    return { sendMessage, stop, status };
}
