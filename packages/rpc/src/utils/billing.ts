import { and, db, eq, member } from "@databuddy/db";
import { cacheable } from "@databuddy/redis";
import { logger } from "@databuddy/shared/logger";

async function _getOrganizationOwnerId(
	organizationId: string
): Promise<string | null> {
	if (!organizationId) {
		return null;
	}
	try {
		const orgMember = await db.query.member.findFirst({
			where: and(
				eq(member.organizationId, organizationId),
				eq(member.role, "owner")
			),
			columns: { userId: true },
		});
		return orgMember?.userId || null;
	} catch (error) {
		logger.error(
			{
				error,
			},
			"[Billing Util] Error with _getOrganizationOwnerId"
		);
		return null;
	}
}

const getOrganizationOwnerId = cacheable(_getOrganizationOwnerId, {
	expireInSec: 300,
	prefix: "rpc:org_owner",
});

/**
 * Determines the customer ID for billing purposes.
 * If an organization is involved, it traces back to the organization's owner.
 * Otherwise, it defaults to the user's ID.
 * @returns The ID of the user or the organization owner.
 */
export async function getBillingCustomerId(
	userId: string,
	organizationId?: string | null
): Promise<string> {
	if (!organizationId) {
		return userId;
	}

	const orgOwnerId = await getOrganizationOwnerId(organizationId);
	return orgOwnerId || userId;
}
