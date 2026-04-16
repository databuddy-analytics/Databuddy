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
import { useAgentChatTransport } from "@/app/(main)/websites/[id]/agent/_components/hooks/use-agent-chat";
import { orpc } from "@/lib/orpc";

type ChatApi = ReturnType<typeof useAiSdkChat<UIMessage>>;
type SendArg = Parameters<ChatApi["sendMessage"]>[0];

interface PendingQueueValue {
	messages: string[];
	removeAction: (index: number) => void;
}

interface ChatLoadingValue {
	/** Initial mount: server fetch in flight, messages not yet hydrated. */
	isRestoring: boolean;
}

const ChatContext = createContext<ChatApi | null>(null);
const PendingQueueContext = createContext<PendingQueueValue>({
	messages: [],
	removeAction: () => {},
});
const ChatLoadingContext = createContext<ChatLoadingValue>({
	isRestoring: false,
});

const isBusy = (c: ChatApi) =>
	c.status === "submitted" || c.status === "streaming";

/**
 * Queue-strategy wrapper around AI SDK's useChat.
 *
 * - Restores prior messages from the server (`agentChats.get`) on mount.
 * - Persists messages on the server via the agent route's onFinish handler.
 * - When the model is streaming/submitted and the user sends another text
 *   message, the wrapper enqueues it and dispatches the next one once the
 *   run finishes (Chat SDK "queue" strategy).
 */
export function ChatProvider({
	chatId,
	websiteId,
	children,
}: {
	chatId: string;
	websiteId: string;
	children: React.ReactNode;
}) {
	const transport = useAgentChatTransport(chatId);
	const queryClient = useQueryClient();
	/** Set synchronously after `useChat`; used by the send queue. */
	const chatRef = useRef<ChatApi>(null as unknown as ChatApi);

	/** Empty initial state — restored from the server below once the query lands. */
	const chat = useAiSdkChat<UIMessage>({
		id: chatId,
		messages: [],
		transport,
	});

	chatRef.current = chat;

	const { data: storedChat, isFetched } = useQuery({
		...orpc.agentChats.get.queryOptions({ input: { id: chatId } }),
		// The streaming response is the source of truth; never refetch on focus.
		refetchOnWindowFocus: false,
		staleTime: Number.POSITIVE_INFINITY,
	});

	const [hasRestored, setHasRestored] = useState(false);

	useEffect(() => {
		if (hasRestored || !isFetched) {
			return;
		}
		if (storedChat?.messages && storedChat.messages.length > 0) {
			chatRef.current.setMessages(storedChat.messages as UIMessage[]);
		}
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

		// Refresh the sidebar list (new chat appears, title updates).
		queryClient.invalidateQueries({
			queryKey: orpc.agentChats.list.key({ input: { websiteId } }),
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
		}),
		[hasRestored]
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

export function usePendingQueue() {
	return useContext(PendingQueueContext);
}

export function useChatLoading() {
	return useContext(ChatLoadingContext);
}
