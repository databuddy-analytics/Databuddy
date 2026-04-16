"use client";

import { DefaultChatTransport } from "ai";
import { useAtomValue } from "jotai";
import { useParams } from "next/navigation";
import { useMemo, useRef } from "react";
import { agentThinkingAtom } from "../agent-atoms";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export function useAgentChatTransport(chatId: string) {
	const params = useParams();
	const websiteId = params.id as string;
	// Read the latest thinking preference at send time without churning the
	// transport instance whenever the user toggles it.
	const thinking = useAtomValue(agentThinkingAtom);
	const thinkingRef = useRef(thinking);
	thinkingRef.current = thinking;

	return useMemo(
		() =>
			new DefaultChatTransport({
				api: `${API_URL}/v1/agent/chat`,
				credentials: "include",
				prepareSendMessagesRequest({ messages }) {
					return {
						body: {
							id: chatId,
							websiteId,
							messages,
							timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
							thinking: thinkingRef.current,
						},
					};
				},
			}),
		[chatId, websiteId]
	);
}
