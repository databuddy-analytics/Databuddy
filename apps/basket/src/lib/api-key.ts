import type { InferSelectModel } from "@databuddy/db";
import { apikey, db, eq } from "@databuddy/db";
import { cacheable } from "@databuddy/redis";
import { keys } from "@databuddy/rpc/src/routers/apikeys";
import { hasScope, isExpired } from "keypal";

export type ApiKeyRow = InferSelectModel<typeof apikey>;
export type ApiScope = ApiKeyRow["scopes"][number];
interface Metadata {
	resources?: Record<string, string[]>;
}

const getMeta = (key: ApiKeyRow): Metadata => (key.metadata as Metadata) ?? {};

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

export function extractSecret(headers: Headers): string | null {
	const xApiKey = headers.get("x-api-key")?.trim();
	if (xApiKey) {
		return xApiKey || null;
	}

	const auth = headers.get("authorization");
	if (auth?.toLowerCase().startsWith("bearer ")) {
		return auth.slice(7).trim() || null;
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

function collectScopes(key: ApiKeyRow, resource?: string): ApiScope[] {
	const scopes = new Set<ApiScope>(key.scopes);
	const resources = getMeta(key).resources;

	if (resources) {
		for (const s of resources.global ?? []) {
			scopes.add(s as ApiScope);
		}
		if (resource && resources[resource]) {
			for (const s of resources[resource]) {
				scopes.add(s as ApiScope);
			}
		}
	}

	return [...scopes];
}

export function hasKeyScope(
	key: ApiKeyRow | null,
	scope: ApiScope,
	resource?: string
): boolean {
	if (!key) {
		return false;
	}
	return hasScope(collectScopes(key, resource), scope);
}
