import { db, eq, type InferSelectModel } from "@databuddy/db";
import { apikey } from "@databuddy/db/schema";
import { cacheable, redis } from "@databuddy/redis";
import {
	createKeys,
	hasAllScopes,
	hasAnyScope,
	hasScope,
	isExpired,
} from "keypal";

export type ApiKeyRow = InferSelectModel<typeof apikey>;
export type { ApiScope } from "./scopes";

interface KeyMetadata {
	resources?: Record<string, string[]>;
}

export const keys = createKeys({ prefix: "dbdy_", length: 48 });

export type ApiKeyResolveOutcome =
	| "ok"
	| "missing"
	| "invalid"
	| "disabled"
	| "revoked"
	| "expired";

type CachedResolveResult =
	| { outcome: "ok"; key: ApiKeyRow }
	| {
			outcome: Exclude<ApiKeyResolveOutcome, "ok" | "missing">;
			key: null;
	  };

const getCachedApiKeyByHash = cacheable(
	async (keyHash: string): Promise<CachedResolveResult> => {
		const key = await db.query.apikey.findFirst({
			where: eq(apikey.keyHash, keyHash),
		});
		if (!key) {
			return { outcome: "invalid", key: null };
		}
		if (!key.enabled) {
			return { outcome: "disabled", key: null };
		}
		if (key.revokedAt) {
			return { outcome: "revoked", key: null };
		}
		if (isExpired(key.expiresAt?.toISOString() ?? null)) {
			return { outcome: "expired", key: null };
		}
		return { outcome: "ok", key };
	},
	{
		expireInSec: 30,
		prefix: "api-key-by-hash",
	}
);

const LAST_USED_DEBOUNCE_SEC = 300;

export async function markApiKeyUsed(keyId: string): Promise<void> {
	try {
		const lockKey = `api-key:last-used-lock:${keyId}`;
		const acquired = await redis.set(
			lockKey,
			"1",
			"EX",
			LAST_USED_DEBOUNCE_SEC,
			"NX"
		);
		if (!acquired) {
			return;
		}
		await db
			.update(apikey)
			.set({ lastUsedAt: new Date() })
			.where(eq(apikey.id, keyId));
	} catch {
		// best-effort — failure must not break the auth path
	}
}

function isValidFormat(token: string): boolean {
	return token.startsWith("dbdy_") && token.length >= 10 && token.length <= 200;
}

export function isApiKeyPresent(headers: Headers): boolean {
	const xApiKey = headers.get("x-api-key");
	const auth = headers.get("authorization");
	return Boolean(xApiKey || auth?.toLowerCase().startsWith("bearer "));
}

export function extractSecret(headers: Headers): string | null {
	const xApiKey = headers.get("x-api-key")?.trim();
	if (xApiKey && isValidFormat(xApiKey)) {
		return xApiKey;
	}

	const auth = headers.get("authorization");
	if (auth?.toLowerCase().startsWith("bearer ")) {
		const token = auth.slice(7).trim();
		if (token && isValidFormat(token)) {
			return token;
		}
	}

	return null;
}

export interface ResolveApiKeyResult {
	key: ApiKeyRow | null;
	outcome: ApiKeyResolveOutcome;
	prefix?: string;
	start?: string;
}

export async function resolveApiKey(
	headers: Headers
): Promise<ResolveApiKeyResult> {
	const secret = extractSecret(headers);
	if (!secret) {
		if (isApiKeyPresent(headers)) {
			return { key: null, outcome: "invalid" };
		}
		return { key: null, outcome: "missing" };
	}
	const keyHash = keys.hashKey(secret);
	const result = await getCachedApiKeyByHash(keyHash);
	const prefix = secret.split("_")[0];
	const start = secret.slice(0, 8);
	if (result.outcome === "ok") {
		markApiKeyUsed(result.key.id).catch(() => undefined);
		return { key: result.key, outcome: "ok", prefix, start };
	}
	return { key: null, outcome: result.outcome, prefix, start };
}

export async function getApiKeyFromHeader(
	headers: Headers
): Promise<ApiKeyRow | null> {
	const result = await resolveApiKey(headers);
	return result.key;
}

// ── Scope helpers ──────────────────────────────────────────────

function getMeta(key: ApiKeyRow): KeyMetadata {
	return (key.metadata as KeyMetadata) ?? {};
}

/**
 * Collects all effective scopes for an API key, merging top-level scopes
 * with per-resource scopes from metadata.
 */
export function collectScopes(key: ApiKeyRow, resource?: string): string[] {
	const scopes = new Set<string>(key.scopes);
	const resources = getMeta(key).resources;

	if (resources) {
		for (const s of resources.global ?? []) {
			scopes.add(s);
		}
		if (resource && resources[resource]) {
			for (const s of resources[resource]) {
				scopes.add(s);
			}
		}
	}

	return [...scopes];
}

export function getEffectiveScopes(
	key: ApiKeyRow | null,
	resource?: string
): string[] {
	if (!key) {
		return [];
	}
	return collectScopes(key, resource);
}

export function hasKeyScope(
	key: ApiKeyRow | null,
	scope: string,
	resource?: string
): boolean {
	if (!key) {
		return false;
	}
	return hasScope(collectScopes(key, resource), scope);
}

export function hasKeyAnyScope(
	key: ApiKeyRow | null,
	scopes: string[],
	resource?: string
): boolean {
	if (!key) {
		return false;
	}
	return hasAnyScope(collectScopes(key, resource), scopes);
}

export function hasKeyAllScopes(
	key: ApiKeyRow | null,
	scopes: string[],
	resource?: string
): boolean {
	if (!key) {
		return false;
	}
	return hasAllScopes(collectScopes(key, resource), scopes);
}

// ── Website-specific helpers ───────────────────────────────────

export function hasWebsiteScope(
	key: ApiKeyRow | null,
	websiteId: string,
	required: string
): boolean {
	return hasKeyScope(key, required, `website:${websiteId}`);
}

export function hasWebsiteAnyScope(
	key: ApiKeyRow | null,
	websiteId: string,
	scopes: string[]
): boolean {
	return hasKeyAnyScope(key, scopes, `website:${websiteId}`);
}

export function hasWebsiteAllScopes(
	key: ApiKeyRow | null,
	websiteId: string,
	scopes: string[]
): boolean {
	return hasKeyAllScopes(key, scopes, `website:${websiteId}`);
}

export function resolveEffectiveScopesForWebsite(
	key: ApiKeyRow | null,
	websiteId: string
): Set<string> {
	return new Set(getEffectiveScopes(key, `website:${websiteId}`));
}

export function hasGlobalAccess(key: ApiKeyRow | null): boolean {
	if (!key) {
		return false;
	}
	const resources = getMeta(key).resources;
	return Boolean(resources?.global?.length);
}

export function getAccessibleWebsiteIds(key: ApiKeyRow | null): string[] {
	if (!key) {
		return [];
	}
	const resources = getMeta(key).resources;
	if (!resources) {
		return [];
	}
	return Object.keys(resources)
		.filter((k) => k.startsWith("website:"))
		.map((k) => k.slice(8));
}
