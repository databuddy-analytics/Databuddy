"use client";

import { publicConfig } from "@databuddy/env/public";

import { DefaultChatTransport, type UIMessage } from "ai";
import { useAtomValue } from "jotai";
import { useMemo, useRef } from "react";
import { normalizeAIComponentMessages } from "@/lib/ai-components/message-parts";
import {
	agentMentionsAtom,
	agentThinkingAtom,
	agentTierAtom,
} from "../agent-atoms";

const API_URL = publicConfig.urls.api;

export function useAgentChatTransport(
	chatId: string,
	organizationId: string | null,
	defaultWebsiteId?: string
) {
	const thinking = useAtomValue(agentThinkingAtom);
	const tier = useAtomValue(agentTierAtom);
	const mentions = useAtomValue(agentMentionsAtom);
	const thinkingRef = useRef(thinking);
	const tierRef = useRef(tier);
	const mentionsRef = useRef(mentions);
	thinkingRef.current = thinking;
	tierRef.current = tier;
	mentionsRef.current = mentions;

	return useMemo(
		() =>
			new DefaultChatTransport({
				api: `${API_URL}/v1/agent/chat`,
				credentials: "include",
				prepareSendMessagesRequest({ messages }) {
					const normalizedMessages = normalizeAIComponentMessages(
						messages as UIMessage[]
					);
					return {
						body: {
							id: chatId,
							organizationId,
							websiteId: defaultWebsiteId,
							mentions: mentionsRef.current.map((m) => m.id),
							messages: normalizedMessages,
							timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
							thinking: thinkingRef.current,
							tier: tierRef.current,
						},
					};
				},
				prepareReconnectToStreamRequest({ id }) {
					return {
						api: `${API_URL}/v1/agent/chat/${id}/stream`,
						credentials: "include",
					};
				},
			}),
		[chatId, organizationId, defaultWebsiteId]
	);
}
