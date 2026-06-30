import { websitesApi } from "@databuddy/auth";
import {
	cacheable,
	getAgentContextSnapshotKey,
	getRedisCache,
} from "@databuddy/redis";
import { enrichAgentContext } from "../config/enrich-context";
import {
	getMemoryContext,
	isMemoryEnabled,
	type MemoryContext,
} from "../../lib/supermemory";
import { captureError } from "../../lib/tracing";

const PERM_TTL_SEC = 60;
const PERM_KEY_PREFIX = "cacheable:agent:perm:website-read";
const AGENT_CONTEXT_SNAPSHOT_TTL_SEC = 24 * 60 * 60;
const AGENT_CONTEXT_SNAPSHOT_STALE_AFTER_MS = 15 * 60 * 1000;
const AGENT_CONTEXT_SNAPSHOT_GET_TIMEOUT_MS = 150;
const MEMORY_RECALL_RE =
	/\b(remember|memory|memories|preference|preferences|previous conversation|earlier conversation|last time|as before|same as before|what did i (tell|say)|what do you know about me|my usual|saved memory)\b/i;

const EMPTY_MEMORY: MemoryContext = {
	staticProfile: [],
	dynamicProfile: [],
	relevantMemories: [],
};

interface AgentContextSnapshot {
	context: string;
	refreshedAt: string;
}

export interface AgentContextSnapshotResult {
	context: string;
	source: "error" | "hit" | "miss" | "stale";
}

const snapshotRefreshes = new Map<string, Promise<void>>();

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return Promise.race([
		promise,
		new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new Error("Agent snapshot timeout")), ms);
		}),
	]).finally(() => {
		if (timer) {
			clearTimeout(timer);
		}
	});
}

function parseSnapshot(value: string | null): AgentContextSnapshot | null {
	if (!value) {
		return null;
	}
	try {
		const parsed = JSON.parse(value) as unknown;
		if (!(parsed && typeof parsed === "object")) {
			return null;
		}
		const snapshot = parsed as Record<string, unknown>;
		if (typeof snapshot.context !== "string") {
			return null;
		}
		if (typeof snapshot.refreshedAt !== "string") {
			return null;
		}
		return {
			context: snapshot.context,
			refreshedAt: snapshot.refreshedAt,
		};
	} catch {
		return null;
	}
}

function shouldRefreshSnapshot(snapshot: AgentContextSnapshot): boolean {
	const refreshedAt = Date.parse(snapshot.refreshedAt);
	return (
		Number.isNaN(refreshedAt) ||
		Date.now() - refreshedAt > AGENT_CONTEXT_SNAPSHOT_STALE_AFTER_MS
	);
}

function refreshAgentContextSnapshot(
	key: string,
	opts: { userId: string; websiteId: string; organizationId: string | null }
): void {
	if (snapshotRefreshes.has(key)) {
		return;
	}

	const work = (async () => {
		const context = await enrichAgentContext(opts);
		const redis = getRedisCache();
		const value = JSON.stringify({
			context,
			refreshedAt: new Date().toISOString(),
		} satisfies AgentContextSnapshot);
		await redis.setex(key, AGENT_CONTEXT_SNAPSHOT_TTL_SEC, value);
	})()
		.catch((err) => {
			captureError(err, {
				agent_context_snapshot_refresh_error: true,
				agent_snapshot_key: key,
			});
		})
		.finally(() => {
			snapshotRefreshes.delete(key);
		});

	snapshotRefreshes.set(key, work);
}

export async function checkWebsiteReadPermissionCached(
	userId: string,
	organizationId: string,
	headers: Headers
): Promise<boolean> {
	const key = `${PERM_KEY_PREFIX}:${userId}:${organizationId}`;
	const redis = getRedisCache();
	try {
		const hit = await redis.get(key);
		if (hit === "1") {
			return true;
		}
		if (hit === "0") {
			return false;
		}
	} catch {
		// fall through to uncached check
	}
	const result = await websitesApi.hasPermission({
		headers,
		body: { organizationId, permissions: { website: ["read"] } },
	});
	try {
		await redis.setex(key, PERM_TTL_SEC, result.success ? "1" : "0");
	} catch {
		// best-effort cache write
	}
	return result.success;
}

const getMemoryContextInner = async (
	query: string,
	userId: string,
	websiteId: string
): Promise<MemoryContext> => {
	if (!(isMemoryEnabled() && query)) {
		return EMPTY_MEMORY;
	}
	const result = await getMemoryContext(query, userId, null, { websiteId });
	return result ?? EMPTY_MEMORY;
};

export const getMemoryContextCached = cacheable(getMemoryContextInner, {
	expireInSec: 60,
	prefix: "agent:memory",
	staleTime: 15,
	staleWhileRevalidate: true,
});

export function shouldLoadMemoryContext(query: string): boolean {
	const normalized = query.trim();
	if (!isMemoryEnabled() || normalized.length === 0) {
		return false;
	}
	return MEMORY_RECALL_RE.test(normalized);
}

export async function getAgentContextSnapshot(
	userId: string,
	websiteId: string,
	organizationId: string | null
): Promise<AgentContextSnapshotResult> {
	const key = getAgentContextSnapshotKey(userId, websiteId, organizationId);
	try {
		const redis = getRedisCache();
		const cached = await withTimeout(
			redis.get(key),
			AGENT_CONTEXT_SNAPSHOT_GET_TIMEOUT_MS
		);
		const snapshot = parseSnapshot(cached);
		if (snapshot) {
			if (shouldRefreshSnapshot(snapshot)) {
				refreshAgentContextSnapshot(key, { userId, websiteId, organizationId });
				return { context: snapshot.context, source: "stale" };
			}
			return { context: snapshot.context, source: "hit" };
		}
		refreshAgentContextSnapshot(key, { userId, websiteId, organizationId });
		return { context: "", source: "miss" };
	} catch {
		refreshAgentContextSnapshot(key, { userId, websiteId, organizationId });
		return { context: "", source: "error" };
	}
}
