import { useCallback, useMemo, useSyncExternalStore } from"react";

interface ChatRecord {
	id: string;
	websiteId: string;
	title: string;
	updatedAt: string;
}

interface ChatListState {
	chats: ChatRecord[];
	isLoading: boolean;
}

const DB_NAME ="databunny-agent";
const DB_VERSION = 1;
const STORE_NAME ="chats";

const getDb = async (): Promise<IDBDatabase | null> => {
	if (typeof indexedDB ==="undefined") {
		return null;
	}

	return await new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				const store = db.createObjectStore(STORE_NAME, { keyPath:"id" });
				store.createIndex("websiteId","websiteId", { unique: false });
			}
		};

		request.onerror = () => {
			reject(request.error ?? new Error("Failed to open IndexedDB"));
		};

		request.onsuccess = () => {
			resolve(request.result);
		};
	});
};

const runStoreRequest = async <T>(
	db: IDBDatabase,
	mode: IDBTransactionMode,
	callback: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> =>
	await new Promise((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, mode);
		const store = tx.objectStore(STORE_NAME);
		const request = callback(store);

		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(request.error ?? new Error("IndexedDB request failed"));
	});

const listChats = async (websiteId: string): Promise<ChatRecord[]> => {
	const db = await getDb();
	if (!db) {
		return [];
	}

	const records = await new Promise<ChatRecord[]>((resolve, reject) => {
		const tx = db.transaction(STORE_NAME,"readonly");
		const store = tx.objectStore(STORE_NAME);
		const index = store.index("websiteId");
		const request = index.getAll(websiteId);

		request.onsuccess = () => {
			resolve(request.result ?? []);
		};
		request.onerror = () =>
			reject(request.error ?? new Error("Failed to read chats"));
	});

	return records.sort(
		(a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
	);
};

const upsertChat = async (chat: ChatRecord) => {
	const db = await getDb();
	if (!db) {
		return;
	}

	await runStoreRequest(db,"readwrite", (store) => store.put(chat));
};

const deleteChat = async (chatId: string) => {
	const db = await getDb();
	if (!db) {
		return;
	}

	await runStoreRequest(db,"readwrite", (store) => store.delete(chatId));
};

const chatListCache = new Map<string, ChatListState>();
const chatListSubscribers = new Map<string, Set<() => void>>();

function notifySubscribers(websiteId: string) {
	const subscribers = chatListSubscribers.get(websiteId);
	if (subscribers) {
		for (const callback of subscribers) {
			callback();
		}
	}
}

async function refreshChatList(websiteId: string) {
	chatListCache.set(websiteId, {
		chats: chatListCache.get(websiteId)?.chats ?? [],
		isLoading: true,
	});
	notifySubscribers(websiteId);

	try {
		const records = await listChats(websiteId);
		chatListCache.set(websiteId, { chats: records, isLoading: false });
	} catch {
		chatListCache.set(websiteId, { chats: [], isLoading: false });
	}
	notifySubscribers(websiteId);
}

function subscribeToChatList(websiteId: string, callback: () => void) {
	let subscribers = chatListSubscribers.get(websiteId);
	if (!subscribers) {
		subscribers = new Set();
		chatListSubscribers.set(websiteId, subscribers);
		// Initial fetch when first subscriber joins
		refreshChatList(websiteId);
	}
	subscribers.add(callback);

	return () => {
		subscribers.delete(callback);
		if (subscribers.size === 0) {
			chatListSubscribers.delete(websiteId);
		}
	};
}

function getChatListSnapshot(websiteId: string): ChatListState {
	return chatListCache.get(websiteId) ?? { chats: [], isLoading: true };
}

export function useChatList(websiteId: string) {
	const subscribe = useCallback(
		(callback: () => void) => subscribeToChatList(websiteId, callback),
		[websiteId]
	);

	const getSnapshot = useCallback(
		() => getChatListSnapshot(websiteId),
		[websiteId]
	);

	const getServerSnapshot = useCallback(
		(): ChatListState => ({ chats: [], isLoading: true }),
		[]
	);

	const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

	const refresh = useCallback(() => {
		refreshChatList(websiteId);
	}, [websiteId]);

	const removeChat = useCallback(
		async (chatId: string) => {
			await deleteChat(chatId);
			await refreshChatList(websiteId);
		},
		[websiteId]
	);

	const saveChat = useCallback(
		async (chat: Omit<ChatRecord,"updatedAt"> & { updatedAt?: string }) => {
			await upsertChat({
				...chat,
				websiteId,
				updatedAt: chat.updatedAt ?? new Date().toISOString(),
			});
			await refreshChatList(websiteId);
		},
		[websiteId]
	);

	return useMemo(
		() => ({
			chats: state.chats,
			isLoading: state.isLoading,
			removeChat,
			refresh,
			saveChat,
		}),
		[state.chats, state.isLoading, refresh, removeChat, saveChat]
	);
}
