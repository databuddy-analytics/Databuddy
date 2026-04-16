import { db, eq, inArray } from "@databuddy/db";
import { member, websites } from "@databuddy/db/schema";
import {
	type ApiKeyRow,
	getAccessibleWebsiteIds,
	hasGlobalAccess,
} from "./api-key";

export interface WebsiteSummary {
	createdAt: Date | null;
	domain: string | null;
	id: string;
	isPublic: boolean | null;
	name: string | null;
}

export interface AccessibleWebsitesAuth {
	apiKey: ApiKeyRow | null;
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

	if (authCtx.user?.role === "ADMIN") {
		return db
			.select(select)
			.from(websites)
			.orderBy((t) => t.createdAt);
	}

	if (authCtx.user) {
		const userMemberships = await db.query.member.findMany({
			where: eq(member.userId, authCtx.user.id),
			columns: { organizationId: true },
		});
		const orgIds = userMemberships.map((m) => m.organizationId);

		if (orgIds.length === 0) {
			return [];
		}

		return db
			.select(select)
			.from(websites)
			.where(inArray(websites.organizationId, orgIds))
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
				.where(eq(websites.organizationId, authCtx.apiKey.organizationId))
				.orderBy((t) => t.createdAt);
		}

		const ids = getAccessibleWebsiteIds(authCtx.apiKey);
		if (ids.length === 0) {
			return [];
		}
		return db
			.select(select)
			.from(websites)
			.where(inArray(websites.id, ids))
			.orderBy((t) => t.createdAt);
	}

	return [];
}
