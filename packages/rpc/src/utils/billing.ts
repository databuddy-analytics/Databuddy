import { cacheNamespaces, cacheTags, cacheable } from "@databuddy/redis";
import { getAutumn } from "../lib/autumn-client";
import { logger } from "../lib/logger";
import { getMemberRole, getOrganizationOwnerId } from "./organization";

export interface BillingOwner {
	canUserUpgrade: boolean;
	customerId: string;
	isOrganization: boolean;
	planId: string;
}

export async function getBillingCustomerId(
	userId: string,
	organizationId?: string | null
): Promise<string> {
	if (!organizationId) {
		return userId;
	}
	const orgOwnerId = await getOrganizationOwnerId(organizationId);
	return orgOwnerId ?? userId;
}

export async function resolveBillingOwner(
	userId: string,
	organizationId: string | null | undefined
): Promise<BillingOwner> {
	let customerId = userId;
	let isOrganization = false;
	let canUserUpgrade = true;

	if (organizationId) {
		const [ownerId, role] = await Promise.all([
			getOrganizationOwnerId(organizationId),
			getMemberRole(userId, organizationId),
		]);

		if (ownerId) {
			customerId = ownerId;
			isOrganization = true;
			canUserUpgrade =
				ownerId === userId || role === "admin" || role === "owner";
		}
	}

	const customer = await getAutumn()
		.customers.getOrCreate({ customerId })
		.catch((error: unknown) => {
			logger.error({ error, customerId }, "Error resolving billing owner plan");
			throw error;
		});

	const subs = customer.subscriptions;
	const activeSub =
		subs.find((s) => s.status === "active" && s.addOn === false) ??
		subs.find((s) => s.status === "active");
	const planId = activeSub?.planId
		? String(activeSub.planId).toLowerCase()
		: "free";

	return { customerId, isOrganization, canUserUpgrade, planId };
}

export const getBillingOwner = cacheable(resolveBillingOwner, {
	expireInSec: 300,
	prefix: cacheNamespaces.billingOwner,
	staleWhileRevalidate: true,
	staleTime: 60,
	tags: (result, userId, organizationId) => {
		const tags = [
			cacheTags.billingOwner(userId),
			cacheTags.billingOwner(result.customerId),
		];
		if (organizationId) {
			tags.push(cacheTags.billingOwner(organizationId));
		}
		return tags;
	},
});
