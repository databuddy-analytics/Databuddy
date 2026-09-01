import {
	and,
	asc,
	count,
	desc,
	eq,
	ilike,
	isNotNull,
	isNull,
	or,
} from "@databuddy/db";
import { links } from "@databuddy/db/schema";
import { z } from "zod";
import { setTrackProperties } from "../middleware/track-mutation";
import { type Context, protectedProcedure, trackedProcedure } from "../orpc";
import { requireLinkAccess, requireOrganizationId } from "./link-access";
import {
	createLinkSchema,
	deleteLinkSchema,
	getLinkSchema,
	linkOutputSchema,
	listLinksPageOutputSchema,
	listLinksPageSchema,
	listLinksSchema,
	updateLinkSchema,
} from "./links.schemas";
import { LinkService, normalizeTargetDomain } from "../services/link-service";

// — query helpers stay in the router: they are shallow filters, not cache invariants.
const LINKS_LIST_MAX = 1000;
const ILIKE_PATTERN_CHARACTER_REGEX = /[\\%_]/g;

function buildLinkListConditions(
	input: {
		externalId?: string;
		folderId?: string | null;
		sourceId?: string;
		sourceOwnerId?: string;
		sourceType?: string;
		targetDomain?: string;
	},
	organizationId: string
) {
	const conditions = [
		eq(links.organizationId, organizationId),
		isNull(links.deletedAt),
	];
	if (input.externalId) {
		conditions.push(eq(links.externalId, input.externalId));
	}
	if (input.folderId !== undefined) {
		conditions.push(
			input.folderId === null
				? isNull(links.folderId)
				: eq(links.folderId, input.folderId)
		);
	}
	if (input.sourceType) {
		conditions.push(eq(links.sourceType, input.sourceType));
	}
	if (input.sourceId) {
		conditions.push(eq(links.sourceId, input.sourceId));
	}
	if (input.sourceOwnerId) {
		conditions.push(eq(links.sourceOwnerId, input.sourceOwnerId));
	}
	const targetDomain = normalizeTargetDomain(input.targetDomain);
	if (targetDomain) {
		conditions.push(eq(links.targetDomain, targetDomain));
	}
	return conditions;
}

function buildLinkSearchCondition(search: string | undefined) {
	const trimmed = search?.trim();
	if (!trimmed) {
		return;
	}
	const term = `%${trimmed.replace(ILIKE_PATTERN_CHARACTER_REGEX, "\\$&")}%`;
	return or(
		ilike(links.name, term),
		ilike(links.slug, term),
		ilike(links.targetUrl, term),
		ilike(links.externalId, term),
		ilike(links.sourceType, term),
		ilike(links.sourceId, term),
		ilike(links.sourceOwnerId, term),
		ilike(links.targetDomain, term)
	);
}

const linkSortOrder = {
	newest: [desc(links.createdAt), desc(links.id)],
	oldest: [asc(links.createdAt), asc(links.id)],
	"name-asc": [asc(links.name), desc(links.id)],
	"name-desc": [desc(links.name), desc(links.id)],
} as const;

async function getLinkOrThrow(context: Context, id: string) {
	const [link] = await context.db
		.select()
		.from(links)
		.where(and(eq(links.id, id), isNull(links.deletedAt)))
		.limit(1);
	if (!link) {
		const { rpcError } = await import("../errors");
		throw rpcError.notFound("link", id);
	}
	return link;
}

function createLinkService(context: Context): LinkService {
	return new LinkService({ db: context.db });
}

export const linksRouter = {
	list: protectedProcedure
		.route({
			method: "POST",
			path: "/links/list",
			tags: ["Links"],
			summary: "List links",
			description:
				"Returns up to the 1000 most recent links for the organization. Optional organizationId defaults to the active organization from the session. Use the paginated endpoint for larger organizations. Requires read:links scope.",
			spec: (s) => ({ ...s, "x-required-scopes": ["read:links"] as const }),
		})
		.input(listLinksSchema)
		.output(z.array(linkOutputSchema))
		.handler(async ({ context, input }) => {
			const organizationId = requireOrganizationId(
				input.organizationId ?? context.organizationId
			);
			await requireLinkAccess(context, organizationId, "read");
			const conditions = buildLinkListConditions(input, organizationId);
			return context.db
				.select()
				.from(links)
				.where(and(...conditions))
				.orderBy(desc(links.createdAt))
				.limit(LINKS_LIST_MAX);
		}),

	paginated: protectedProcedure
		.route({
			method: "POST",
			path: "/links/paginated",
			tags: ["Links"],
			summary: "List links (paginated)",
			description:
				"Returns a page of links for the organization with server-side search, sort, type filter, and offset pagination. Set includeTotal only when an exact filtered count is needed. Requires read:links scope.",
			spec: (s) => ({ ...s, "x-required-scopes": ["read:links"] as const }),
		})
		.input(listLinksPageSchema)
		.output(listLinksPageOutputSchema)
		.handler(async ({ context, input }) => {
			const organizationId = requireOrganizationId(
				input.organizationId ?? context.organizationId
			);
			await requireLinkAccess(context, organizationId, "read");
			const conditions = buildLinkListConditions(input, organizationId);
			if (input.type === "short") {
				conditions.push(isNull(links.deepLinkApp));
			} else if (input.type === "deep") {
				conditions.push(isNotNull(links.deepLinkApp));
			}
			const matches = buildLinkSearchCondition(input.search);
			if (matches) {
				conditions.push(matches);
			}
			const where = and(...conditions);
			const pageQuery = context.db
				.select()
				.from(links)
				.where(where)
				.orderBy(...linkSortOrder[input.sort])
				.limit(input.limit + 1)
				.offset(input.offset);
			let rows: (typeof links.$inferSelect)[];
			let total: number | undefined;
			if (input.includeTotal) {
				const [page, [summary]] = await Promise.all([
					pageQuery,
					context.db.select({ total: count() }).from(links).where(where),
				]);
				rows = page;
				total = summary?.total ?? 0;
			} else {
				rows = await pageQuery;
			}
			const hasMore = rows.length > input.limit;
			return {
				items: hasMore ? rows.slice(0, input.limit) : rows,
				hasMore,
				...(total === undefined ? {} : { total }),
			};
		}),

	get: protectedProcedure
		.route({
			method: "POST",
			path: "/links/get",
			tags: ["Links"],
			summary: "Get link",
			description:
				"Returns a single link by id; the organization is resolved from the link. Requires read:links scope.",
			spec: (s) => ({ ...s, "x-required-scopes": ["read:links"] as const }),
		})
		.input(getLinkSchema)
		.output(linkOutputSchema)
		.handler(async ({ context, input }) => {
			const link = await getLinkOrThrow(context, input.id);
			await requireLinkAccess(context, link.organizationId, "read");
			return link;
		}),

	create: trackedProcedure
		.route({
			method: "POST",
			path: "/links/create",
			tags: ["Links"],
			summary: "Create link",
			description: "Creates a new short link. Requires write:links scope.",
			spec: (s) => ({ ...s, "x-required-scopes": ["write:links"] as const }),
		})
		.input(createLinkSchema)
		.output(linkOutputSchema)
		.handler(async ({ context, input }) => {
			setTrackProperties({
				has_expiry: !!input.expiresAt,
				has_og: !!(input.ogTitle || input.ogImageUrl),
			});
			const organizationId = requireOrganizationId(
				input.organizationId?.trim() || context.organizationId
			);
			const workspace = await requireLinkAccess(
				context,
				organizationId,
				"create"
			);
			const createdBy = await workspace.getCreatedBy();
			const service = createLinkService(context);
			return service.create({
				organizationId,
				createdBy,
				name: input.name,
				targetUrl: input.targetUrl,
				slug: input.slug,
				folderId: input.folderId,
				expiresAt: input.expiresAt ?? null,
				expiredRedirectUrl: input.expiredRedirectUrl ?? null,
				ogTitle: input.ogTitle ?? null,
				ogDescription: input.ogDescription ?? null,
				ogImageUrl: input.ogImageUrl ?? null,
				ogVideoUrl: input.ogVideoUrl ?? null,
				iosUrl: input.iosUrl ?? null,
				androidUrl: input.androidUrl ?? null,
				externalId: input.externalId ?? null,
				sourceType: input.sourceType ?? null,
				sourceId: input.sourceId ?? null,
				sourceOwnerId: input.sourceOwnerId ?? null,
				targetDomain: input.targetDomain ?? null,
				deepLinkApp: input.deepLinkApp ?? null,
			});
		}),

	update: trackedProcedure
		.route({
			method: "POST",
			path: "/links/update",
			tags: ["Links"],
			summary: "Update link",
			description: "Updates an existing link. Requires write:links scope.",
			spec: (s) => ({ ...s, "x-required-scopes": ["write:links"] as const }),
		})
		.input(updateLinkSchema)
		.output(linkOutputSchema)
		.handler(async ({ context, input }) => {
			const link = await getLinkOrThrow(context, input.id);
			await requireLinkAccess(context, link.organizationId, "update");
			const service = createLinkService(context);
			// Pass only updatable fields; id is used to fetch the row.
			const { id: _id, ...updates } = input;
			return service.update(link, updates);
		}),

	delete: trackedProcedure
		.route({
			method: "POST",
			path: "/links/delete",
			tags: ["Links"],
			summary: "Delete link",
			description: "Deletes a link by id. Requires write:links scope.",
			spec: (s) => ({ ...s, "x-required-scopes": ["write:links"] as const }),
		})
		.input(deleteLinkSchema)
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			const link = await getLinkOrThrow(context, input.id);
			await requireLinkAccess(context, link.organizationId, "delete");
			const service = createLinkService(context);
			return service.delete(link);
		}),
};
