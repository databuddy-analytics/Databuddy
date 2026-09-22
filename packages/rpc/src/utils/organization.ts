import { db } from "@databuddy/db";
import { cacheNamespaces, cacheable } from "@databuddy/redis";

const ORGANIZATION_LOOKUP_TIMEOUT_MS = 5000;

export const getOrganizationOwnerId = cacheable(
	async (organizationId: string): Promise<string | null> => {
		if (!organizationId) {
			return null;
		}
		const orgMember = await db.query.member.findFirst({
			where: { organizationId, role: "owner" },
			columns: { userId: true },
		});
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
		const row = await db.query.member.findFirst({
			where: { organizationId, userId },
			columns: { role: true },
		});
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
