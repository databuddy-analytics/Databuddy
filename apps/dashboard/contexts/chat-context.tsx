"use client";

import { useChat as useAiSdkChat } from "@ai-sdk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useAgentChatTransport } from "@/components/agent/hooks/use-agent-chat";
import { orpc } from "@/lib/orpc";

type ChatApi = ReturnType<typeof useAiSdkChat<UIMessage>>;
type SendArg = Parameters<ChatApi["sendMessage"]>[0];

interface PendingQueueValue {
	messages: string[];
	removeAction: (index: number) => void;
}

interface ChatLoadingValue {
	isEmpty: boolean;
	isRestoring: boolean;
	persistedUserMessageIds: ReadonlySet<string>;
}

const ChatContext = createContext<ChatApi | null>(null);
const PendingQueueContext = createContext<PendingQueueValue>({
	messages: [],
	removeAction: () => {},
});
const ChatLoadingContext = createContext<ChatLoadingValue>({
	isRestoring: false,
	isEmpty: true,
	persistedUserMessageIds: new Set(),
});

const isBusy = (c: ChatApi) =>
	c.status === "submitted" || c.status === "streaming";

export function ChatProvider({
	chatId,
	websiteId,
	children,
}: {
	chatId: string;
	websiteId: string;
	children: React.ReactNode;
}) {
	const transport = useAgentChatTransport(chatId, websiteId);
	const queryClient = useQueryClient();
	const chatRef = useRef<ChatApi>(null as unknown as ChatApi);

	const { data: storedChat, isFetched } = useQuery({
		...orpc.agentChats.get.queryOptions({ input: { id: chatId } }),
		refetchOnWindowFocus: false,
		staleTime: Number.POSITIVE_INFINITY,
	});

	const chat = useAiSdkChat<UIMessage>({
		id: chatId,
		messages: [],
		transport,
		resume: Boolean(storedChat?.activeStreamId),
	});

	chatRef.current = chat;

	const [hasRestored, setHasRestored] = useState(false);
	const [persistedUserMessageIds, setPersistedUserMessageIds] = useState<
		ReadonlySet<string>
	>(() => new Set());

	useEffect(() => {
		if (hasRestored || !isFetched) {
			return;
		}

		const ids = new Set<string>();
		if (storedChat?.messages && storedChat.messages.length > 0) {
			const persisted = storedChat.messages as UIMessage[];
			for (const [idx, msg] of persisted.entries()) {
				if (msg.role === "user") {
					ids.add(msg.id || `msg-${idx}`);
				}
			}
			chatRef.current.setMessages(persisted);
		}
		setPersistedUserMessageIds(ids);
		setHasRestored(true);
	}, [hasRestored, isFetched, storedChat]);

	const pendingRef = useRef<string[]>([]);
	const [pendingTexts, setPendingTexts] = useState<string[]>([]);
	const prevStatusRef = useRef(chat.status);

	const syncQueue = useCallback(() => {
		setPendingTexts([...pendingRef.current]);
	}, []);

	const sendMessage = useCallback(
		(message?: SendArg) => {
			const c = chatRef.current;
			if (
				message &&
				typeof message === "object" &&
				"text" in message &&
				typeof message.text === "string" &&
				isBusy(c)
			) {
				pendingRef.current = [...pendingRef.current, message.text];
				syncQueue();
				return Promise.resolve();
			}
			return c.sendMessage(message);
		},
		[syncQueue]
	);

	const stop = useCallback(() => {
		pendingRef.current = [];
		syncQueue();
		return chatRef.current.stop();
	}, [syncQueue]);

	const removeAction = useCallback(
		(index: number) => {
			pendingRef.current = pendingRef.current.filter((_, i) => i !== index);
			syncQueue();
		},
		[syncQueue]
	);

	useEffect(() => {
		const prev = prevStatusRef.current;
		prevStatusRef.current = chat.status;

		const justFinished =
			(prev === "streaming" || prev === "submitted") &&
			(chat.status === "ready" || chat.status === "error");

		if (!justFinished) {
			return;
		}

		queryClient.invalidateQueries({
			queryKey: orpc.agentChats.list.key({ input: { websiteId } }),
		});
		queryClient.invalidateQueries({
			queryKey: orpc.agentChats.get.key({ input: { id: chatId } }),
		});

		const [next, ...rest] = pendingRef.current;
		if (next === undefined) {
			return;
		}
		pendingRef.current = rest;
		syncQueue();
		chat.sendMessage({ text: next }).catch(() => undefined);
	}, [chat.status, chat, syncQueue, queryClient, websiteId]);

	const chatValue = useMemo(
		(): ChatApi => ({ ...chat, sendMessage, stop }),
		[chat, sendMessage, stop]
	);

	const queueValue = useMemo(
		(): PendingQueueValue => ({ messages: pendingTexts, removeAction }),
		[pendingTexts, removeAction]
	);

	const loadingValue = useMemo(
		(): ChatLoadingValue => ({
			isRestoring: !hasRestored,
			isEmpty:
				isFetched &&
				(!storedChat?.messages || storedChat.messages.length === 0),
			persistedUserMessageIds,
		}),
		[hasRestored, isFetched, storedChat, persistedUserMessageIds]
	);

	return (
		<ChatContext.Provider value={chatValue}>
			<ChatLoadingContext.Provider value={loadingValue}>
				<PendingQueueContext.Provider value={queueValue}>
					{children}
				</PendingQueueContext.Provider>
			</ChatLoadingContext.Provider>
		</ChatContext.Provider>
	);
}

export function useChat() {
	const chat = useContext(ChatContext);
	if (!chat) {
		throw new Error("useChat must be used within a `ChatProvider`");
	}
	return chat;
}

export function useChatSafe() {
	return useContext(ChatContext);
}

export function usePendingQueue() {
	return useContext(PendingQueueContext);
}

export function useChatLoading() {
	return useContext(ChatLoadingContext);
}
