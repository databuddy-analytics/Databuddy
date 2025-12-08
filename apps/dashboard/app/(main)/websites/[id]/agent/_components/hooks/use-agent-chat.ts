"use client";

import { useChat, useChatActions } from "@ai-sdk-tools/store";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { useSetAtom } from "jotai";
import { useParams } from "next/navigation";
import { useCallback, useRef } from "react";
import { agentInputAtom } from "../agent-atoms";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function useAgentChat() {
	const params = useParams();
	const chatId = params.chatId as string;
	const websiteId = params.id as string;
	const setInput = useSetAtom(agentInputAtom);

	const transport = new DefaultChatTransport({
		api: `${API_URL}/v1/agent/chat`,
		credentials: "include",
		prepareSendMessagesRequest({ messages }) {
			const lastMessage = messages.at(-1);
			if (!lastMessage) {
				throw new Error("No messages to send");
			}
			return {
				body: {
					id: chatId,
					websiteId,
					message: lastMessage,
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				},
			};
		},
	});

	const { messages, status } = useChat<UIMessage>({
		id: chatId,
		transport,
	});

	const {
		sendMessage: sdkSendMessage,
		reset: sdkReset,
		stop: sdkStop,
	} = useChatActions();

	const lastUserMessageRef = useRef<string>("");

	const sendMessage = useCallback(
		(
			content: string,
			metadata?: { agentChoice?: string; toolChoice?: string }
		) => {
			if (!content.trim()) {
				return;
			}

			lastUserMessageRef.current = content.trim();
			setInput("");

			sdkSendMessage({
				text: content.trim(),
				metadata,
			});
		},
		[sdkSendMessage, setInput]
	);

	const reset = useCallback(() => {
		sdkReset();
		setInput("");
		lastUserMessageRef.current = "";
	}, [sdkReset, setInput]);

	const stop = useCallback(() => {
		sdkStop();
	}, [sdkStop]);

	const retry = useCallback(() => {
		const lastUserMessage = lastUserMessageRef.current;
		if (!lastUserMessage) {
			return;
		}

		sdkSendMessage({
			text: lastUserMessage,
		});
	}, [sdkSendMessage]);

	const isLoading = status === "streaming" || status === "submitted";
	const hasError = status === "error";

	return {
		messages,
		status,
		isLoading,
		hasError,
		sendMessage,
		stop,
		reset,
		retry,
	};
}
