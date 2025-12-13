"use client";

import { DefaultChatTransport } from "ai";
import { useParams } from "next/navigation";
import { useMemo } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function useAgentChatTransport(chatId: string) {
	const params = useParams();
	const websiteId = params.id as string;

	return useMemo(
		() =>
			new DefaultChatTransport({
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
			}),
		[chatId, websiteId]
	);
}
