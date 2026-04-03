"use client";

import { useChat as useAiSdkChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useAgentChatTransport } from "@/app/(main)/websites/[id]/agent/_components/hooks/use-agent-chat";
import {
	getMessagesFromLocal,
	saveMessagesToLocal,
} from "@/app/(main)/websites/[id]/agent/_components/hooks/use-chat-db";

type ChatApi = ReturnType<typeof useAiSdkChat<UIMessage>>;
type SendArg = Parameters<ChatApi["sendMessage"]>[0];

interface PendingEntry {
	metadata?: unknown;
	text: string;
}

interface PendingQueueValue {
	messages: string[];
	removeAction: (index: number) => void;
}

const ChatContext = createContext<ChatApi | null>(null);
const PendingQueueContext = createContext<PendingQueueValue>({
	messages: [],
	removeAction: () => {},
});

/**
 * Queue-strategy wrapper around AI SDK's useChat.
 *
 * When the model is streaming/submitted and the user sends another text
 * message, we enqueue it. When the run finishes, only the latest queued
 * message is dispatched (Chat SDK "queue" strategy). All queued messages
 * are exposed for visual display.
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
	/** Set synchronously after `useChat`; used by the send queue. */
	const chatRef = useRef<ChatApi>(null as unknown as ChatApi);

	/** Empty on server and first client render so SSR HTML matches hydration; restored in useLayoutEffect. */
	const chat = useAiSdkChat<UIMessage>({
		id: chatId,
		messages: [],
		transport,
	});

	chatRef.current = chat;

	const [hasRestoredFromLocal, setHasRestoredFromLocal] = useState(false);

	useLayoutEffect(() => {
		const stored = getMessagesFromLocal(websiteId, chatId);
		if (stored.length > 0) {
			chatRef.current.setMessages(stored);
		}
		setHasRestoredFromLocal(true);
	}, [websiteId, chatId]);

	const [pendingTexts, setPendingTexts] = useState<string[]>([]);
	const pendingRef = useRef<PendingEntry[]>([]);
	const prevStatusRef = useRef(chat.status);

	const syncState = useCallback(() => {
		setPendingTexts(pendingRef.current.map((p) => p.text));
	}, []);

	const isBusy = (c: ChatApi) =>
		c.status === "submitted" || c.status === "streaming";

	const sendMessage = useCallback(
		(message?: SendArg) => {
			const c = chatRef.current;
			if (
				message != null &&
				typeof message === "object" &&
				"text" in message &&
				isBusy(c)
			) {
				const m = message as PendingEntry;
				pendingRef.current = [
					...pendingRef.current,
					{ text: m.text, metadata: m.metadata },
				];
				syncState();
				return Promise.resolve();
			}
			return c.sendMessage(message);
		},
		[syncState]
	);

	const clearQueue = useCallback(() => {
		pendingRef.current = [];
		syncState();
	}, [syncState]);

	const stop = useCallback(() => {
		clearQueue();
		return chatRef.current.stop();
	}, [clearQueue]);

	const removeAction = useCallback(
		(index: number) => {
			pendingRef.current = pendingRef.current.filter((_, i) => i !== index);
			syncState();
		},
		[syncState]
	);

	useEffect(() => {
		const prev = prevStatusRef.current;
		prevStatusRef.current = chat.status;

		if (
			(prev !== "streaming" && prev !== "submitted") ||
			(chat.status !== "ready" && chat.status !== "error")
		) {
			return;
		}
		const pending = pendingRef.current;
		if (pending.length === 0) {
			return;
		}
		const [next, ...rest] = pending;
		pendingRef.current = rest;
		syncState();
		chat
			.sendMessage(
				next.metadata === undefined
					? { text: next.text }
					: { text: next.text, metadata: next.metadata }
			)
			.catch(() => undefined);
	}, [chat.status, chat, syncState]);

	const chatValue = useMemo(
		(): ChatApi => ({ ...chat, sendMessage, stop }),
		[chat, sendMessage, stop]
	);

	const queueValue = useMemo(
		(): PendingQueueValue => ({ messages: pendingTexts, removeAction }),
		[pendingTexts, removeAction]
	);

	useEffect(() => {
		if (!hasRestoredFromLocal) {
			return;
		}
		saveMessagesToLocal(websiteId, chatId, chat.messages);
	}, [websiteId, chatId, chat.messages, hasRestoredFromLocal]);

	return (
		<ChatContext.Provider value={chatValue}>
			<PendingQueueContext.Provider value={queueValue}>
				{children}
			</PendingQueueContext.Provider>
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

export function useChatStatus() {
	const { status } = useChat();
	return status;
}

/** Returns the queued messages and a remove callback. */
export function usePendingQueue() {
	return useContext(PendingQueueContext);
}
