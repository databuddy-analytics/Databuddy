import { db, eq, type InferSelectModel } from "@databuddy/db";
import { apikey } from "@databuddy/db/schema";
import { cacheable } from "@databuddy/redis";
import {
	createKeys,
	hasAllScopes,
	hasAnyScope,
	hasScope,
	isExpired,
} from "keypal";

export type ApiKeyRow = InferSelectModel<typeof apikey>;
export type ApiScope = ApiKeyRow["scopes"][number];

interface KeyMetadata {
	resources?: Record<string, string[]>;
}

export const keys = createKeys({ prefix: "dbdy_", length: 48 });

const getCachedApiKeyByHash = cacheable(
	async (keyHash: string): Promise<ApiKeyRow | null> => {
		const key = await db.query.apikey.findFirst({
			where: eq(apikey.keyHash, keyHash),
		});
		return key ?? null;
	},
	{
		expireInSec: 60,
		prefix: "api-key-by-hash",
		staleWhileRevalidate: true,
		staleTime: 30,
	}
);

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

export async function getApiKeyFromHeader(
	headers: Headers
): Promise<ApiKeyRow | null> {
	const secret = extractSecret(headers);
	if (!secret) {
		return null;
	}

	const keyHash = keys.hashKey(secret);
	const key = await getCachedApiKeyByHash(keyHash);

	if (!key?.enabled || key.revokedAt || isExpired(key.expiresAt)) {
		return null;
	}

	return key;
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
