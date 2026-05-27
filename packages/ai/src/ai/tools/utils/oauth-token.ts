import { db, eq, and, sql } from "@databuddy/db";
import { account, member } from "@databuddy/db/schema";

const ROLE_PRIORITY = sql`CASE ${member.role} WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`;
const TOKEN_TTL_MS = 45 * 60 * 1000;

export async function getOAuthToken(
	providerId: string,
	organizationId: string,
	preferUserId?: string
): Promise<string | null> {
	if (preferUserId) {
		const [preferred] = await db
			.select({ accessToken: account.accessToken })
			.from(account)
			.innerJoin(member, eq(member.userId, account.userId))
			.where(
				and(
					eq(account.userId, preferUserId),
					eq(account.providerId, providerId),
					eq(member.organizationId, organizationId)
				)
			)
			.limit(1);

		if (preferred?.accessToken) {
			return preferred.accessToken;
		}
	}

	const [fallback] = await db
		.select({ accessToken: account.accessToken })
		.from(account)
		.innerJoin(member, eq(member.userId, account.userId))
		.where(
			and(
				eq(member.organizationId, organizationId),
				eq(account.providerId, providerId)
			)
		)
		.orderBy(ROLE_PRIORITY)
		.limit(1);

	return fallback?.accessToken ?? null;
}

export function createCachedTokenFn(
	providerId: string,
	organizationId: string,
	preferUserId?: string
): () => Promise<string | null> {
	let cached: string | null | undefined;
	let cachedAt = 0;
	const NEGATIVE_TTL_MS = 5 * 60 * 1000;
	return async () => {
		const age = Date.now() - cachedAt;
		const ttl = cached ? TOKEN_TTL_MS : NEGATIVE_TTL_MS;
		if (cached !== undefined && age < ttl) {
			return cached;
		}
		const token = await getOAuthToken(providerId, organizationId, preferUserId);
		cached = token;
		cachedAt = Date.now();
		return token;
	};
}
