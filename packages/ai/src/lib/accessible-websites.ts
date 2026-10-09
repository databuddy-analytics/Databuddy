import {
	type ApiKeyRow,
	getAccessibleWebsiteIds,
	hasKeyScope,
	hasWebsiteScope,
} from "@databuddy/api-keys/resolve";
import { and, db, eq, inArray, isNull } from "@databuddy/db";
import { member, organization, websites } from "@databuddy/db/schema";

export interface WebsiteSummary {
	createdAt: Date | null;
	domain: string | null;
	id: string;
	isPublic: boolean | null;
	name: string | null;
	organizationId: string;
	organizationName: string;
}

export function getOrganizationWebsites(
	organizationId: string,
	websiteIds?: string[]
): Promise<WebsiteSummary[]> {
	return db
		.select({
			id: websites.id,
			name: websites.name,
			domain: websites.domain,
			isPublic: websites.isPublic,
			createdAt: websites.createdAt,
			organizationId: organization.id,
			organizationName: organization.name,
		})
		.from(websites)
		.innerJoin(organization, eq(websites.organizationId, organization.id))
		.where(
			and(
				eq(websites.organizationId, organizationId),
				websiteIds && inArray(websites.id, websiteIds),
				isNull(websites.deletedAt)
			)
		)
		.orderBy((t) => t.createdAt);
}

export interface AccessibleWebsitesAuth {
	activeOrganizationId?: string | null;
	apiKey: ApiKeyRow | null;
	organizationId?: string | null;
	user: { id: string } | null;
}

export async function getAccessibleWebsites(
	authCtx: AccessibleWebsitesAuth
): Promise<WebsiteSummary[]> {
	const { apiKey, user } = authCtx;
	const organizationId = authCtx.organizationId ?? authCtx.activeOrganizationId;

	if (apiKey) {
		const keyOrganizationId = apiKey.organizationId;
		if (
			!keyOrganizationId ||
			(organizationId && organizationId !== keyOrganizationId)
		) {
			return [];
		}
		if (hasKeyScope(apiKey, "read:data")) {
			return getOrganizationWebsites(keyOrganizationId);
		}
		const ids = getAccessibleWebsiteIds(apiKey).filter((id) =>
			hasWebsiteScope(apiKey, id, "read:data")
		);
		return ids.length > 0
			? getOrganizationWebsites(keyOrganizationId, ids)
			: [];
	}

	if (!(user && organizationId)) {
		return [];
	}
	const [membership] = await db
		.select({ organizationId: member.organizationId })
		.from(member)
		.where(
			and(eq(member.userId, user.id), eq(member.organizationId, organizationId))
		)
		.limit(1);
	return membership ? getOrganizationWebsites(organizationId) : [];
}
