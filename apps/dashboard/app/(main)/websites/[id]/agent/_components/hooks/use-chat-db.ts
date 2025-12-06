import { useCallback, useEffect, useMemo, useState } from "react";

type ChatRecord = {
	id: string;
	websiteId: string;
	title: string;
	updatedAt: string;
};

const DB_NAME = "databunny-agent";
const DB_VERSION = 1;
const STORE_NAME = "chats";

const getDb = async (): Promise<IDBDatabase | null> => {
	if (typeof indexedDB === "undefined") {
		return null;
	}

	return await new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
				store.createIndex("websiteId", "websiteId", { unique: false });
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
		request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
	});

const listChats = async (websiteId: string): Promise<ChatRecord[]> => {
	const db = await getDb();
	if (!db) {
		return [];
	}

	const records = await new Promise<ChatRecord[]>((resolve, reject) => {
		const tx = db.transaction(STORE_NAME, "readonly");
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

	await runStoreRequest(db, "readwrite", (store) => store.put(chat));
};

const deleteChat = async (chatId: string) => {
	const db = await getDb();
	if (!db) {
		return;
	}

	await runStoreRequest(db, "readwrite", (store) => store.delete(chatId));
};

export function useChatList(websiteId: string) {
	const [chats, setChats] = useState<ChatRecord[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	const refresh = useCallback(async () => {
		setIsLoading(true);
		try {
			const records = await listChats(websiteId);
			setChats(records);
		} catch {
			setChats([]);
		} finally {
			setIsLoading(false);
		}
	}, [websiteId]);

	const removeChat = useCallback(
		async (chatId: string) => {
			await deleteChat(chatId);
			await refresh();
		},
		[refresh]
	);

	const saveChat = useCallback(
		async (chat: Omit<ChatRecord, "updatedAt"> & { updatedAt?: string }) => {
			await upsertChat({
				...chat,
				websiteId,
				updatedAt: chat.updatedAt ?? new Date().toISOString(),
			});
			await refresh();
		},
		[refresh, websiteId]
	);

	useEffect(() => {
		refresh();
	}, [refresh]);

	return useMemo(
		() => ({
			chats,
			isLoading,
			removeChat,
			refresh,
			saveChat,
		}),
		[chats, isLoading, refresh, removeChat, saveChat]
	);
}
