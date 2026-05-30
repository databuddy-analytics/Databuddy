import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { orpc } from "@/lib/orpc";

const LAST_CHAT_PREFIX = "databunny-last-chat";

function lastChatKey(scopeKey: string): string {
	return `${LAST_CHAT_PREFIX}:${scopeKey}`;
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
	} catch {}
}

function safeRemoveItem(key: string): void {
	try {
		if (typeof localStorage !== "undefined") {
			localStorage.removeItem(key);
		}
	} catch {}
}

export function getLastChatId(scopeKey: string): string | null {
	return safeGetItem(lastChatKey(scopeKey));
}

export function setLastChatId(scopeKey: string, chatId: string): void {
	if (!chatId || typeof chatId !== "string" || chatId.trim() === "") {
		return;
	}
	safeSetItem(lastChatKey(scopeKey), chatId);
}

export function clearLastChatId(scopeKey: string): void {
	safeRemoveItem(lastChatKey(scopeKey));
}

export function useChatList(organizationId: string | null | undefined) {
	const queryClient = useQueryClient();

	const { data, isLoading } = useQuery({
		...orpc.agentChats.list.queryOptions({
			input: { organizationId },
		}),
		enabled: Boolean(organizationId),
	});

	const invalidate = useCallback(() => {
		if (!organizationId) {
			return;
		}
		queryClient.invalidateQueries({
			queryKey: orpc.agentChats.list.key({ input: { organizationId } }),
		});
	}, [queryClient, organizationId]);

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
