import { and, db, eq, member } from "@databuddy/db";
import { cacheable } from "@databuddy/redis";
import { Autumn as autumn } from "autumn-js";
import { logger } from "../lib/logger";

export interface BillingOwner {
	customerId: string;
	isOrganization: boolean;
	canUserUpgrade: boolean;
	planId: string;
}

const _getOrganizationOwnerId = async (
	organizationId: string
): Promise<string | null> => {
	if (!organizationId) return null;
	try {
		const orgMember = await db.query.member.findFirst({
			where: and(
				eq(member.organizationId, organizationId),
				eq(member.role, "owner")
			),
			columns: { userId: true },
		});
		return orgMember?.userId ?? null;
	} catch (error) {
		logger.error({ error }, "Error resolving organization owner");
		return null;
	}
};

export const getOrganizationOwnerId = cacheable(_getOrganizationOwnerId, {
	expireInSec: 300,
	prefix: "rpc:org_owner",
});

export async function getBillingCustomerId(
	userId: string,
	organizationId?: string | null
): Promise<string> {
	if (!organizationId) return userId;
	const orgOwnerId = await getOrganizationOwnerId(organizationId);
	return orgOwnerId ?? userId;
}

export async function getBillingOwner(
	userId: string,
	organizationId: string | null | undefined
): Promise<BillingOwner> {
	let customerId = userId;
	let isOrganization = false;
	let canUserUpgrade = true;

	if (organizationId) {
		const [orgOwnerResult, currentUserMember] = await Promise.all([
			db
				.select({ ownerId: member.userId })
				.from(member)
				.where(
					and(
						eq(member.organizationId, organizationId),
						eq(member.role, "owner")
					)
				)
				.limit(1),
			db
				.select({ role: member.role })
				.from(member)
				.where(
					and(
						eq(member.organizationId, organizationId),
						eq(member.userId, userId)
					)
				)
				.limit(1),
		]);

		const orgOwner = orgOwnerResult.at(0);
		if (orgOwner) {
			customerId = orgOwner.ownerId;
			isOrganization = true;
			const role = currentUserMember.at(0)?.role;
			canUserUpgrade =
				orgOwner.ownerId === userId || role === "admin" || role === "owner";
		}
	}

	let planId = "free";
	try {
		const customerResult = await autumn.customers.get(customerId);
		const customer = customerResult.data;

		if (customer) {
			const activeProduct = customer.products?.find(
				(p) => p.status === "active"
			);
			if (activeProduct?.id) {
				planId = String(activeProduct.id).toLowerCase();
			}
		}
	} catch {
		planId = "free";
	}

	return { customerId, isOrganization, canUserUpgrade, planId };
}
