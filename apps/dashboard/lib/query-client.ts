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
	const message = err.message || "Unknown error";
	toast.error(message);
	trackError(message, {
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
]);

function isPersistableQuery(query: Query): boolean {
	if (query.state.status !== "success") {
		return false;
	}
	const [head] = query.queryKey;
	if (Array.isArray(head)) {
		return PERSISTED_ROUTERS.has(String(head[0]));
	}
	return head === "auth";
}

export function makeQueryPersister() {
	return createSyncStoragePersister({
		storage: typeof window === "undefined" ? undefined : window.localStorage,
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
	if (typeof window === "undefined") {
		return null;
	}
	return window.localStorage.getItem(PERSIST_OWNER_KEY);
}

export function writePersistedCacheOwner(userId: string) {
	if (typeof window === "undefined") {
		return;
	}
	window.localStorage.setItem(PERSIST_OWNER_KEY, userId);
}

export function clearPersistedQueryCache() {
	if (typeof window === "undefined") {
		return;
	}
	window.localStorage.removeItem(PERSIST_KEY);
	window.localStorage.removeItem(PERSIST_OWNER_KEY);
}
