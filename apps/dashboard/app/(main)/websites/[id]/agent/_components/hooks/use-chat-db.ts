import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { orpc } from "@/lib/orpc";

const LAST_CHAT_PREFIX = "databunny-last-chat";

function lastChatKey(websiteId: string): string {
	return `${LAST_CHAT_PREFIX}:${websiteId}`;
}

function safeGetItem(key: string): string | null {
	try {
		return typeof localStorage === "undefined"
			? null
			: localStorage.getItem(key);
	} catch {
		return null;
	}
}

function safeSetItem(key: string, value: string): void {
	try {
		if (typeof localStorage !== "undefined") {
			localStorage.setItem(key, value);
		}
	} catch {
		// Ignore quota or security errors
	}
}

function safeRemoveItem(key: string): void {
	try {
		if (typeof localStorage !== "undefined") {
			localStorage.removeItem(key);
		}
	} catch {
		// Ignore
	}
}

/**
 * "Last opened chat" pointer is kept in localStorage so the agent index page
 * can navigate instantly without waiting on a server round trip. The chat
 * data itself lives on the server.
 */
export function getLastChatId(websiteId: string): string | null {
	return safeGetItem(lastChatKey(websiteId));
}

export function setLastChatId(websiteId: string, chatId: string): void {
	if (!chatId || typeof chatId !== "string" || chatId.trim() === "") {
		return;
	}
	safeSetItem(lastChatKey(websiteId), chatId);
}

export function clearLastChatId(websiteId: string): void {
	safeRemoveItem(lastChatKey(websiteId));
}

export function useChatList(websiteId: string) {
	const queryClient = useQueryClient();

	const { data, isLoading } = useQuery({
		...orpc.agentChats.list.queryOptions({ input: { websiteId } }),
	});

	const invalidate = useCallback(() => {
		queryClient.invalidateQueries({
			queryKey: orpc.agentChats.list.key({ input: { websiteId } }),
		});
	}, [queryClient, websiteId]);

	const deleteMutation = useMutation({
		...orpc.agentChats.delete.mutationOptions(),
		onSuccess: invalidate,
	});

	const renameMutation = useMutation({
		...orpc.agentChats.rename.mutationOptions(),
		onSuccess: (_data, variables) => {
			invalidate();
			queryClient.invalidateQueries({
				queryKey: orpc.agentChats.get.key({ input: { id: variables.id } }),
			});
		},
	});

	const removeChat = useCallback(
		(chatId: string) => deleteMutation.mutate({ id: chatId }),
		[deleteMutation]
	);

	const renameChat = useCallback(
		(chatId: string, title: string) =>
			renameMutation.mutate({ id: chatId, title }),
		[renameMutation]
	);

	return useMemo(
		() => ({
			chats: data ?? [],
			isLoading,
			refresh: invalidate,
			removeChat,
			renameChat,
		}),
		[data, isLoading, invalidate, removeChat, renameChat]
	);
}
