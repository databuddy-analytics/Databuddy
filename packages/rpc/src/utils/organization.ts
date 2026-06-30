import { db } from "@databuddy/db";
import { cacheNamespaces, cacheable } from "@databuddy/redis";

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
		staleWhileRevalidate: true,
		staleTime: 60,
	}
);
