import { db, sql } from "@databuddy/db";
import { cacheNamespaces, cacheable } from "@databuddy/redis";

export const ORGANIZATION_LOOKUP_TIMEOUT_MS = 5000;
export const ORGANIZATION_STATEMENT_TIMEOUT_MS = ORGANIZATION_LOOKUP_TIMEOUT_MS;

function withOrganizationStatementTimeout<T>(
	query: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>
): Promise<T> {
	return db.transaction(async (tx) => {
		await tx.execute(
			sql`SELECT set_config('statement_timeout', ${String(ORGANIZATION_STATEMENT_TIMEOUT_MS)}, true)`
		);
		return query(tx);
	});
}

export const getOrganizationOwnerId = cacheable(
	async (organizationId: string): Promise<string | null> => {
		if (!organizationId) {
			return null;
		}
		const orgMember = await withOrganizationStatementTimeout((tx) =>
			tx.query.member.findFirst({
				where: { organizationId, role: "owner" },
				columns: { userId: true },
			})
		);
		return orgMember?.userId ?? null;
	},
	{
		expireInSec: 300,
		prefix: cacheNamespaces.organizationOwner,
		queryTimeoutMs: ORGANIZATION_LOOKUP_TIMEOUT_MS,
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);

export const getMemberRole = cacheable(
	async (userId: string, organizationId: string): Promise<string | null> => {
		const row = await withOrganizationStatementTimeout((tx) =>
			tx.query.member.findFirst({
				where: { organizationId, userId },
				columns: { role: true },
			})
		);
		return row?.role ?? null;
	},
	{
		expireInSec: 300,
		prefix: cacheNamespaces.memberRole,
		queryTimeoutMs: ORGANIZATION_LOOKUP_TIMEOUT_MS,
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);
