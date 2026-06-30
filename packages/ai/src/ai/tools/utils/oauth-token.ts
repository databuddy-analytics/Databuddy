import { auth } from "@databuddy/auth";
import { and, db, eq, sql } from "@databuddy/db";
import { account, member } from "@databuddy/db/schema";

const ROLE_PRIORITY = sql`CASE ${member.role} WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END`;
const TOKEN_TTL_MS = 45 * 60 * 1000;
const NEGATIVE_TTL_MS = 5 * 60 * 1000;
const EXPIRY_SKEW_MS = 60 * 1000;
const MAX_CANDIDATES = 5;

interface TokenCandidate {
	accessToken: string | null;
	accessTokenExpiresAt: Date | null;
	providerAccountId: string;
	refreshToken: string | null;
	scope: string | null;
	userId: string;
}

function isExpired(candidate: TokenCandidate): boolean {
	return (
		candidate.accessTokenExpiresAt !== null &&
		candidate.accessTokenExpiresAt.getTime() <= Date.now() + EXPIRY_SKEW_MS
	);
}

interface ResolvedToken {
	expiresAt: Date | null;
	token: string;
}

async function resolveCandidateToken(
	providerId: string,
	candidate: TokenCandidate
): Promise<ResolvedToken | null> {
	if (candidate.accessToken && !isExpired(candidate)) {
		return {
			token: candidate.accessToken,
			expiresAt: candidate.accessTokenExpiresAt,
		};
	}
	if (!candidate.refreshToken) {
		return null;
	}
	try {
		const refreshed = await auth.api.getAccessToken({
			body: {
				providerId,
				accountId: candidate.providerAccountId,
				userId: candidate.userId,
			},
		});
		if (!refreshed.accessToken) {
			return null;
		}
		return {
			token: refreshed.accessToken,
			expiresAt: refreshed.accessTokenExpiresAt ?? null,
		};
	} catch {
		return null;
	}
}

async function resolveOAuthToken(
	providerId: string,
	organizationId: string,
	preferUserId?: string,
	requiredScope?: string
): Promise<ResolvedToken | null> {
	const preference = preferUserId
		? sql`CASE WHEN ${account.userId} = ${preferUserId} THEN 0 ELSE 1 END`
		: sql`0`;

	const candidates: TokenCandidate[] = await db
		.select({
			accessToken: account.accessToken,
			accessTokenExpiresAt: account.accessTokenExpiresAt,
			providerAccountId: account.accountId,
			refreshToken: account.refreshToken,
			scope: account.scope,
			userId: account.userId,
		})
		.from(account)
		.innerJoin(member, eq(member.userId, account.userId))
		.where(
			and(
				eq(member.organizationId, organizationId),
				eq(account.providerId, providerId)
			)
		)
		.orderBy(preference, ROLE_PRIORITY)
		.limit(MAX_CANDIDATES);

	for (const candidate of candidates) {
		if (requiredScope && !candidate.scope?.includes(requiredScope)) {
			continue;
		}
		const resolved = await resolveCandidateToken(providerId, candidate);
		if (resolved) {
			return resolved;
		}
	}

	return null;
}

export async function getOAuthToken(
	providerId: string,
	organizationId: string,
	preferUserId?: string,
	requiredScope?: string
): Promise<string | null> {
	const resolved = await resolveOAuthToken(
		providerId,
		organizationId,
		preferUserId,
		requiredScope
	);
	return resolved?.token ?? null;
}

export function createCachedTokenFn(
	providerId: string,
	organizationId: string,
	preferUserId?: string,
	requiredScope?: string
): () => Promise<string | null> {
	let cached: string | null | undefined;
	let expiresAt = 0;
	return async () => {
		if (cached !== undefined && Date.now() < expiresAt) {
			return cached;
		}
		const resolved = await resolveOAuthToken(
			providerId,
			organizationId,
			preferUserId,
			requiredScope
		);
		const now = Date.now();
		if (resolved) {
			const tokenLifetime = resolved.expiresAt
				? resolved.expiresAt.getTime() - now - EXPIRY_SKEW_MS
				: TOKEN_TTL_MS;
			cached = resolved.token;
			expiresAt = now + Math.max(0, Math.min(TOKEN_TTL_MS, tokenLifetime));
		} else {
			cached = null;
			expiresAt = now + NEGATIVE_TTL_MS;
		}
		return cached;
	};
}
