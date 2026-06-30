import {
	type ApiKeyRow,
	getAccessibleWebsiteIds,
	hasGlobalAccess,
} from "@databuddy/api-keys/resolve";
import { and, db, eq, inArray, isNull } from "@databuddy/db";
import { member, websites } from "@databuddy/db/schema";

export interface WebsiteSummary {
	createdAt: Date | null;
	domain: string | null;
	id: string;
	isPublic: boolean | null;
	name: string | null;
}

export interface AccessibleWebsitesAuth {
	activeOrganizationId?: string | null;
	apiKey: ApiKeyRow | null;
	organizationId?: string | null;
	user: { id: string; role?: string } | null;
}

export async function getAccessibleWebsites(
	authCtx: AccessibleWebsitesAuth
): Promise<WebsiteSummary[]> {
	const select = {
		id: websites.id,
		name: websites.name,
		domain: websites.domain,
		isPublic: websites.isPublic,
		createdAt: websites.createdAt,
	};
	const organizationId = authCtx.organizationId ?? authCtx.activeOrganizationId;

	if (organizationId) {
		if (authCtx.apiKey) {
			if (authCtx.apiKey.organizationId !== organizationId) {
				return [];
			}
		} else if (authCtx.user) {
			const [membership] = await db
				.select({ organizationId: member.organizationId })
				.from(member)
				.where(
					and(
						eq(member.userId, authCtx.user.id),
						eq(member.organizationId, organizationId)
					)
				)
				.limit(1);
			if (!membership) {
				return [];
			}
		} else {
			return [];
		}

		return db
			.select(select)
			.from(websites)
			.where(
				and(
					eq(websites.organizationId, organizationId),
					isNull(websites.deletedAt)
				)
			)
			.orderBy((t) => t.createdAt);
	}

	if (authCtx.apiKey) {
		if (hasGlobalAccess(authCtx.apiKey)) {
			if (!authCtx.apiKey.organizationId) {
				return [];
			}
			return db
				.select(select)
				.from(websites)
				.where(
					and(
						eq(websites.organizationId, authCtx.apiKey.organizationId),
						isNull(websites.deletedAt)
					)
				)
				.orderBy((t) => t.createdAt);
		}

		const ids = getAccessibleWebsiteIds(authCtx.apiKey);
		if (ids.length === 0) {
			return [];
		}
		return db
			.select(select)
			.from(websites)
			.where(and(inArray(websites.id, ids), isNull(websites.deletedAt)))
			.orderBy((t) => t.createdAt);
	}

	return [];
}
