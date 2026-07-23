import { trackError } from "@databuddy/sdk";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import {
	MutationCache,
	type Query,
	QueryCache,
	QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { isAbortError } from "@/lib/is-abort-error";
import { getUserFacingErrorMessage } from "@/lib/user-facing-error";

const SILENCED_ERROR_CODES = new Set([
	"UNAUTHORIZED",
	"AUTH_REQUIRED",
	"FORBIDDEN",
]);

const SILENCED_MESSAGE_FRAGMENTS = [
	"authentication",
	"unauthorized",
	"unauthenticated",
	"401",
	"forbidden",
	"invite-only",
];

function isSilencedError(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	const rpcError = error as {
		data?: { code?: string; message?: string };
		code?: string;
		message?: string;
	};

	const errorCode = rpcError.data?.code ?? rpcError.code;
	if (errorCode && SILENCED_ERROR_CODES.has(errorCode)) {
		return true;
	}

	const errorMessage = (
		rpcError.data?.message ??
		rpcError.message ??
		String(error)
	).toLowerCase();

	return SILENCED_MESSAGE_FRAGMENTS.some((fragment) =>
		errorMessage.includes(fragment)
	);
}

function reportError(error: unknown) {
	const err = error instanceof Error ? error : new Error(String(error));
	const internalMessage = err.message || "Unknown error";
	toast.error(getUserFacingErrorMessage(error));
	trackError(internalMessage, {
		stack: err.stack,
		error_type: err.name,
		cause: err.cause ? String(err.cause) : undefined,
	});
}

export function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 1000 * 60 * 2,
				gcTime: 1000 * 60 * 5,
				refetchOnWindowFocus: false,
				refetchOnMount: true,
				refetchOnReconnect: true,
				retry: 1,
				retryDelay: (attemptIndex: number) =>
					Math.min(1000 * 2 ** attemptIndex, 30_000),
			},
			mutations: {
				retry: false,
			},
		},
		queryCache: new QueryCache({
			onError: (error, query) => {
				if (isAbortError(error) || isSilencedError(error)) {
					return;
				}
				if (query.queryKey[0] === "og-preview") {
					return;
				}
				reportError(error);
			},
		}),
		mutationCache: new MutationCache({
			onError: (error, _variables, _context, mutation) => {
				if (
					isAbortError(error) ||
					isSilencedError(error) ||
					mutation.meta?.suppressGlobalErrorToast
				) {
					return;
				}
				reportError(error);
			},
		}),
	});
}

let browserQueryClient: QueryClient | undefined;

export function getQueryClient() {
	if (typeof window === "undefined") {
		return makeQueryClient();
	}
	if (!browserQueryClient) {
		browserQueryClient = makeQueryClient();
	}
	return browserQueryClient;
}

const PERSIST_KEY = "db-query-cache";
const PERSIST_OWNER_KEY = "db-query-cache-owner";

const PERSISTED_ROUTERS = new Set([
	"organizations",
	"websites",
	"uptime",
	"preferences",
	"insights",
]);

const PERSISTED_FLAT_KEYS = new Set(["auth", "insights"]);

function isPersistableQuery(query: Query): boolean {
	if (query.state.status !== "success") {
		return false;
	}
	const [head] = query.queryKey;
	if (Array.isArray(head)) {
		return PERSISTED_ROUTERS.has(String(head[0]));
	}
	return PERSISTED_FLAT_KEYS.has(String(head));
}

function safeLocalStorage(): Storage | undefined {
	if (typeof window === "undefined") {
		return;
	}
	try {
		return window.localStorage;
	} catch {
		return;
	}
}

function makeOwnerScopedStorage(userId: string): Storage | undefined {
	const storage = safeLocalStorage();
	if (!storage) {
		return;
	}

	const ensureOwner = () => {
		const owner = storage.getItem(PERSIST_OWNER_KEY);
		if (owner === userId) {
			return true;
		}
		storage.removeItem(PERSIST_KEY);
		storage.removeItem(PERSIST_OWNER_KEY);
		storage.setItem(PERSIST_OWNER_KEY, userId);
		return false;
	};

	return {
		get length() {
			return storage.length;
		},
		clear: () => {
			storage.removeItem(PERSIST_KEY);
			storage.removeItem(PERSIST_OWNER_KEY);
		},
		getItem: (key: string) => {
			if (key === PERSIST_KEY && !ensureOwner()) {
				return null;
			}
			return storage.getItem(key);
		},
		key: (index: number) => storage.key(index),
		removeItem: (key: string) => storage.removeItem(key),
		setItem: (key: string, value: string) => {
			if (key === PERSIST_KEY) {
				ensureOwner();
			}
			storage.setItem(key, value);
		},
	};
}

export function makeQueryPersister(userId?: string) {
	return createSyncStoragePersister({
		storage: userId ? makeOwnerScopedStorage(userId) : undefined,
		key: PERSIST_KEY,
	});
}

export const persistOptions = {
	maxAge: 1000 * 60 * 60 * 24,
	buster: "v1",
	dehydrateOptions: {
		shouldDehydrateQuery: isPersistableQuery,
	},
};

export function readPersistedCacheOwner(): string | null {
	try {
		return safeLocalStorage()?.getItem(PERSIST_OWNER_KEY) ?? null;
	} catch {
		return null;
	}
}

export function writePersistedCacheOwner(userId: string) {
	try {
		safeLocalStorage()?.setItem(PERSIST_OWNER_KEY, userId);
	} catch {}
}

export function clearPersistedQueryCache() {
	try {
		const storage = safeLocalStorage();
		storage?.removeItem(PERSIST_KEY);
		storage?.removeItem(PERSIST_OWNER_KEY);
	} catch {}
}
