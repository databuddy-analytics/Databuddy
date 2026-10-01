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

const websiteSummaryColumns = {
	id: websites.id,
	name: websites.name,
	domain: websites.domain,
	isPublic: websites.isPublic,
	createdAt: websites.createdAt,
	organizationId: organization.id,
	organizationName: organization.name,
};

function selectWebsiteSummaries() {
	return db
		.select(websiteSummaryColumns)
		.from(websites)
		.innerJoin(organization, eq(websites.organizationId, organization.id));
}

export function getOrganizationWebsites(
	organizationId: string
): Promise<WebsiteSummary[]> {
	return selectWebsiteSummaries()
		.where(
			and(
				eq(websites.organizationId, organizationId),
				isNull(websites.deletedAt)
			)
		)
		.orderBy((t) => t.createdAt);
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
	const organizationId = authCtx.organizationId ?? authCtx.activeOrganizationId;

	if (organizationId) {
		if (authCtx.apiKey) {
			if (authCtx.apiKey.organizationId !== organizationId) {
				return [];
			}
			if (!hasKeyScope(authCtx.apiKey, "read:data")) {
				const ids = getAccessibleWebsiteIds(authCtx.apiKey).filter((id) =>
					hasWebsiteScope(authCtx.apiKey, id, "read:data")
				);
				if (ids.length === 0) {
					return [];
				}
				return selectWebsiteSummaries()
					.where(
						and(
							eq(websites.organizationId, organizationId),
							inArray(websites.id, ids),
							isNull(websites.deletedAt)
						)
					)
					.orderBy((t) => t.createdAt);
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

		return getOrganizationWebsites(organizationId);
	}

	if (authCtx.apiKey) {
		if (hasKeyScope(authCtx.apiKey, "read:data")) {
			if (!authCtx.apiKey.organizationId) {
				return [];
			}
			return getOrganizationWebsites(authCtx.apiKey.organizationId);
		}

		const ids = getAccessibleWebsiteIds(authCtx.apiKey).filter((id) =>
			hasWebsiteScope(authCtx.apiKey, id, "read:data")
		);
		if (ids.length === 0 || !authCtx.apiKey.organizationId) {
			return [];
		}
		return selectWebsiteSummaries()
			.where(
				and(
					eq(websites.organizationId, authCtx.apiKey.organizationId),
					inArray(websites.id, ids),
					isNull(websites.deletedAt)
				)
			)
			.orderBy((t) => t.createdAt);
	}

	return [];
}
