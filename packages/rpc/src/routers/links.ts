import {
	and,
	asc,
	count,
	desc,
	eq,
	ilike,
	isNotNull,
	isNull,
	isUniqueViolationFor,
	or,
	sql,
} from "@databuddy/db";
import { linkFolders, links } from "@databuddy/db/schema";
import {
	abandonCachedLinkMutation,
	beginCachedLinkMutation,
	type CachedLink,
	type CachedLinkMutationNext,
	finishCachedLinkMutation,
	invalidateAgentContextSnapshotsForOwner,
	setCachedLinkIfAbsent,
} from "@databuddy/redis";
import { isDeepLinkTarget } from "@databuddy/shared/constants/deep-link-apps";
import { randomUUIDv7 } from "bun";
import { customAlphabet } from "nanoid";
import { z } from "zod";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
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

type LinkRow = typeof links.$inferSelect;
type CacheableLink = Pick<
	LinkRow,
	| "id"
	| "targetUrl"
	| "expiresAt"
	| "expiredRedirectUrl"
	| "ogTitle"
	| "ogDescription"
	| "ogImageUrl"
	| "ogVideoUrl"
	| "iosUrl"
	| "androidUrl"
	| "deepLinkApp"
>;
interface LinkCacheMutation {
	id: string;
	slug: string;
	token: string;
}
type LinkCacheMutationRequest = Pick<LinkCacheMutation, "id" | "slug"> & {
	mode: "existing" | "new";
};

const generateLinkSlug = customAlphabet(
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
	8
);
const LINK_DB_STATEMENT_TIMEOUT_MS = 10_000;

function setLocalLinkStatementTimeout() {
	return sql.raw(
		`SET LOCAL statement_timeout = '${LINK_DB_STATEMENT_TIMEOUT_MS}ms'`
	);
}

function hasPostgresSqlState(error: unknown): boolean {
	const seen = new Set<object>();
	let current = error;

	while (typeof current === "object" && current !== null) {
		if (seen.has(current)) {
			return false;
		}
		seen.add(current);

		if (
			"code" in current &&
			typeof current.code === "string" &&
			current.code.length === 5 &&
			"severity" in current &&
			typeof current.severity === "string"
		) {
			return true;
		}

		current = "cause" in current ? current.cause : null;
	}

	return false;
}

function validateDeepLinkConfiguration(
	deepLinkApp: string | null | undefined,
	targetUrl: string
): void {
	if (!deepLinkApp) {
		return;
	}
	if (isDeepLinkTarget(deepLinkApp, targetUrl)) {
		return;
	}
	throw rpcError.badRequest(
		"Deep link URLs must use HTTPS and match the selected app"
	);
}

function normalizeNullableText(
	value: string | null | undefined
): string | null {
	if (value == null) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed || null;
}

function normalizeTargetDomain(
	value: string | null | undefined
): string | null {
	const trimmed = normalizeNullableText(value);
	if (!trimmed) {
		return null;
	}

	try {
		return new URL(
			trimmed.includes("://") ? trimmed : `https://${trimmed}`
		).hostname.toLowerCase();
	} catch {
		return trimmed.split("/")[0]?.toLowerCase() || null;
	}
}

function getTargetDomain(targetUrl: string): string | null {
	try {
		return new URL(targetUrl).hostname.toLowerCase();
	} catch {
		return null;
	}
}

async function validateFolderId(
	db: Context["db"],
	folderId: string | null | undefined,
	organizationId: string
): Promise<string | null> {
	const normalizedFolderId = folderId?.trim() || null;
	if (!normalizedFolderId) {
		return null;
	}

	const existing = await db
		.select({ id: linkFolders.id })
		.from(linkFolders)
		.where(
			and(
				eq(linkFolders.id, normalizedFolderId),
				eq(linkFolders.organizationId, organizationId),
				isNull(linkFolders.deletedAt)
			)
		)
		.limit(1);

	if (existing.length > 0) {
		return normalizedFolderId;
	}

	throw rpcError.badRequest("Link folder does not exist in this organization");
}

function toCachedLink(link: CacheableLink): CachedLink {
	return {
		id: link.id,
		targetUrl: link.targetUrl,
		expiresAt: link.expiresAt?.toISOString() ?? null,
		expiredRedirectUrl: link.expiredRedirectUrl,
		ogTitle: link.ogTitle,
		ogDescription: link.ogDescription,
		ogImageUrl: link.ogImageUrl,
		ogVideoUrl: link.ogVideoUrl,
		iosUrl: link.iosUrl,
		androidUrl: link.androidUrl,
		deepLinkApp: link.deepLinkApp,
	};
}

function getErrorLogFields(error: unknown): {
	error_message: string;
	error_stack?: string;
} {
	if (error instanceof Error) {
		return {
			error_message: error.message,
			...(error.stack ? { error_stack: error.stack } : {}),
		};
	}

	return { error_message: String(error) };
}

function invalidateLinkAgentContext(organizationId: string): void {
	// The helper absorbs expected Redis failures; retain this guard for future errors.
	invalidateAgentContextSnapshotsForOwner(organizationId).catch((error) => {
		logger.error(
			{ organizationId, ...getErrorLogFields(error) },
			"Unexpected link agent-context invalidation failure"
		);
	});
}

async function abandonLinkCacheMutations(
	mutations: LinkCacheMutation[],
	reason: string
): Promise<void> {
	await Promise.all(
		mutations.map(async ({ id, slug, token }) => {
			try {
				if (await abandonCachedLinkMutation(slug, token)) {
					return;
				}
				logger.warn(
					{ linkId: id, slug },
					"Lost link cache mutation lease while abandoning mutation"
				);
			} catch (error) {
				logger.error(
					{ linkId: id, slug, reason, ...getErrorLogFields(error) },
					"Failed to abandon link cache mutation"
				);
			}
		})
	);
}

async function finishLinkCacheMutation(
	mutation: LinkCacheMutation,
	next: CachedLinkMutationNext,
	reason: string
): Promise<boolean> {
	const { id, slug, token } = mutation;
	try {
		if (await finishCachedLinkMutation(slug, token, next)) {
			return true;
		}
		logger.warn(
			{ linkId: id, slug, reason },
			"Lost link cache mutation lease before cache finalization"
		);
	} catch (error) {
		logger.error(
			{ linkId: id, slug, reason, ...getErrorLogFields(error) },
			"Failed to finalize link cache mutation"
		);
	}

	// The database outcome is confirmed before callers finalize a mutation. Clear
	// only this token's pending marker so redirects can read through to Postgres;
	// a newer cache owner or already-applied finalization is never overwritten.
	try {
		await abandonCachedLinkMutation(slug, token);
	} catch (error) {
		logger.error(
			{ linkId: id, slug, reason, ...getErrorLogFields(error) },
			"Failed to release link cache mutation after finalization failure"
		);
	}
	return false;
}

async function backfillLinkCache(
	slug: string,
	link: CacheableLink,
	reason: string
): Promise<void> {
	try {
		if (await setCachedLinkIfAbsent(slug, toCachedLink(link))) {
			return;
		}
		logger.warn(
			{ linkId: link.id, slug, reason },
			"Link cache backfill did not replace an existing entry"
		);
	} catch (error) {
		logger.error(
			{ linkId: link.id, slug, reason, ...getErrorLogFields(error) },
			"Failed to backfill link cache"
		);
	}
}

async function tombstoneLinkCacheMutations(
	mutations: LinkCacheMutation[],
	reason: string
): Promise<void> {
	await Promise.all(
		mutations.map((mutation) =>
			finishLinkCacheMutation(
				mutation,
				{ id: mutation.id, state: "tombstone" },
				reason
			)
		)
	);
}

async function beginLinkCacheMutations(
	requests: LinkCacheMutationRequest[]
): Promise<LinkCacheMutation[] | null> {
	const mutations: LinkCacheMutation[] = [];
	try {
		for (const request of [...requests].sort((left, right) =>
			left.slug.localeCompare(right.slug)
		)) {
			const started = await beginCachedLinkMutation(request.slug, request);
			if (started.state !== "acquired") {
				await abandonLinkCacheMutations(
					mutations,
					"another mutation already owns this slug"
				);
				return null;
			}
			mutations.push({
				id: request.id,
				slug: request.slug,
				token: started.token,
			});
		}
		return mutations;
	} catch (error) {
		await abandonLinkCacheMutations(
			mutations,
			"failed before the database mutation started"
		);
		throw error;
	}
}

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

async function getLinkOrThrow(context: Context, id: string): Promise<LinkRow> {
	const [link] = await context.db
		.select()
		.from(links)
		.where(and(eq(links.id, id), isNull(links.deletedAt)))
		.limit(1);

	if (!link) {
		throw rpcError.notFound("link", id);
	}

	return link;
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
			let rows: LinkRow[];
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

			validateDeepLinkConfiguration(input.deepLinkApp, input.targetUrl);
			const createdBy = await workspace.getCreatedBy();
			const resolvedFolderId = await validateFolderId(
				context.db,
				input.folderId,
				organizationId
			);
			const targetDomain =
				normalizeTargetDomain(input.targetDomain) ??
				getTargetDomain(input.targetUrl);

			const slugsToTry = input.slug
				? [input.slug]
				: Array.from({ length: 10 }, () => generateLinkSlug());

			for (const slug of slugsToTry) {
				const linkId = randomUUIDv7();
				let cacheMutations: LinkCacheMutation[] | null;
				try {
					cacheMutations = await beginLinkCacheMutations([
						{ id: linkId, mode: "new", slug },
					]);
				} catch (error) {
					logger.error(
						{ slug, linkId, ...getErrorLogFields(error) },
						"Failed to begin link cache mutation before create"
					);
					if (input.slug) {
						throw rpcError.serviceUnavailable(
							1,
							"Link cache is temporarily unavailable; retry this custom slug"
						);
					}
					// PostgreSQL's unique constraint is authoritative for generated
					// slugs. A cache outage must not make random-slug creation
					// unavailable; redirects read through to PG on cache misses.
					cacheMutations = [];
				}

				if (!cacheMutations) {
					if (input.slug) {
						throw rpcError.conflict(
							"This slug is already taken or is being updated"
						);
					}
					continue;
				}

				const [cacheMutation] = cacheMutations;

				let finalizedFailure = false;
				try {
					const newLink = await context.db.transaction(async (tx) => {
						await tx.execute(setLocalLinkStatementTimeout());
						const [created] = await tx
							.insert(links)
							.values({
								id: linkId,
								slug,
								organizationId,
								createdBy,
								folderId: resolvedFolderId,
								name: input.name,
								targetUrl: input.targetUrl,
								targetDomain,
								sourceType: normalizeNullableText(input.sourceType),
								sourceId: normalizeNullableText(input.sourceId),
								sourceOwnerId: normalizeNullableText(input.sourceOwnerId),
								expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
								expiredRedirectUrl: input.expiredRedirectUrl ?? null,
								ogTitle: input.ogTitle ?? null,
								ogDescription: input.ogDescription ?? null,
								ogImageUrl: input.ogImageUrl ?? null,
								ogVideoUrl: input.ogVideoUrl ?? null,
								iosUrl: input.iosUrl ?? null,
								androidUrl: input.androidUrl ?? null,
								externalId: input.externalId ?? null,
								deepLinkApp: input.deepLinkApp ?? null,
							})
							.returning();
						return created;
					});

					if (!newLink) {
						await abandonLinkCacheMutations(
							cacheMutations,
							"create returned no persisted link"
						);
						finalizedFailure = true;
						throw rpcError.internal("Failed to create link");
					}

					if (cacheMutation) {
						await finishLinkCacheMutation(
							cacheMutation,
							{ link: toCachedLink(newLink), state: "link" },
							"create persisted"
						);
					} else {
						await backfillLinkCache(
							slug,
							newLink,
							"create bypassed cache lease"
						);
					}
					invalidateLinkAgentContext(organizationId);

					return newLink;
				} catch (error) {
					if (isUniqueViolationFor(error, "links_slug_unique")) {
						await abandonLinkCacheMutations(
							cacheMutations,
							"create failed because the slug already exists"
						);
						if (input.slug) {
							throw rpcError.conflict("This slug is already taken");
						}
						continue;
					}
					if (finalizedFailure) {
						throw error;
					}
					if (hasPostgresSqlState(error)) {
						await abandonLinkCacheMutations(
							cacheMutations,
							"create failed with a definitive PostgreSQL error"
						);
						throw error;
					}

					let persistedLink: LinkRow | undefined;
					try {
						persistedLink = await context.db.transaction(async (tx) => {
							await tx.execute(setLocalLinkStatementTimeout());
							const [persisted] = await tx
								.select()
								.from(links)
								.where(eq(links.id, linkId))
								.limit(1);
							return persisted;
						});
					} catch (reconciliationError) {
						logger.error(
							{
								slug,
								linkId,
								...getErrorLogFields(reconciliationError),
							},
							"Failed to reconcile uncertain link create"
						);
						throw rpcError.serviceUnavailable(
							1,
							"Link creation outcome is still being reconciled"
						);
					}

					if (persistedLink) {
						if (cacheMutation) {
							await finishLinkCacheMutation(
								cacheMutation,
								{ link: toCachedLink(persistedLink), state: "link" },
								"create reconciled after ambiguous database error"
							);
						} else {
							await backfillLinkCache(
								slug,
								persistedLink,
								"create reconciled after cache bypass"
							);
						}
						invalidateLinkAgentContext(organizationId);
						return persistedLink;
					}

					logger.error(
						{ slug, linkId, ...getErrorLogFields(error) },
						"Link create failed with an uncertain persistence outcome"
					);
					// A separate read that does not see the row cannot prove an in-flight
					// COMMIT rolled back. Keep the short lease so no negative read-through
					// can outlive a late commit, and tell the caller to retry.
					throw rpcError.serviceUnavailable(
						1,
						"Link creation outcome is still being reconciled"
					);
				}
			}

			throw rpcError.internal("Failed to generate unique slug");
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

			if (input.targetUrl !== undefined || input.deepLinkApp !== undefined) {
				validateDeepLinkConfiguration(
					input.deepLinkApp === undefined
						? link.deepLinkApp
						: input.deepLinkApp,
					input.targetUrl ?? link.targetUrl
				);
			}

			let resolvedFolderId: string | null | undefined;
			if (input.folderId !== undefined) {
				resolvedFolderId = await validateFolderId(
					context.db,
					input.folderId,
					link.organizationId
				);
			}

			const {
				id,
				expiresAt,
				folderId,
				sourceType,
				sourceId,
				sourceOwnerId,
				targetDomain,
				...updates
			} = input;
			const oldSlug = link.slug;
			const nextSlug = updates.slug ?? oldSlug;
			const nextTargetDomain =
				targetDomain === undefined
					? input.targetUrl
						? getTargetDomain(input.targetUrl)
						: undefined
					: normalizeTargetDomain(targetDomain);

			const cacheMutationRequests: LinkCacheMutationRequest[] = [
				{ id: link.id, mode: "existing", slug: oldSlug },
			];
			if (nextSlug !== oldSlug) {
				cacheMutationRequests.push({
					id: link.id,
					mode: "new",
					slug: nextSlug,
				});
			}

			let cacheMutations: LinkCacheMutation[] | null;
			try {
				cacheMutations = await beginLinkCacheMutations(cacheMutationRequests);
			} catch (error) {
				logger.error(
					{ slug: oldSlug, linkId: link.id, ...getErrorLogFields(error) },
					"Failed to begin link cache mutation before update"
				);
				throw rpcError.internal("Failed to update cache. Link not updated.");
			}

			if (!cacheMutations) {
				logger.warn(
					{ linkId: link.id, oldSlug, nextSlug },
					"Link cache mutation conflicts with an in-progress or stale cache entry"
				);
				throw rpcError.conflict(
					"This link is currently being updated. Retry the request."
				);
			}

			const oldCacheMutation = cacheMutations.find(
				(mutation) => mutation.slug === oldSlug
			);
			if (!oldCacheMutation) {
				await abandonLinkCacheMutations(
					cacheMutations,
					"missing old-slug cache mutation before update"
				);
				throw rpcError.internal("Failed to begin link cache mutation");
			}

			let finalizedFailure = false;
			try {
				const updatedLink = await context.db.transaction(async (tx) => {
					await tx.execute(setLocalLinkStatementTimeout());
					const [updated] = await tx
						.update(links)
						.set({
							...updates,
							folderId:
								resolvedFolderId === undefined ? undefined : resolvedFolderId,
							sourceType:
								sourceType === undefined
									? undefined
									: normalizeNullableText(sourceType),
							sourceId:
								sourceId === undefined
									? undefined
									: normalizeNullableText(sourceId),
							sourceOwnerId:
								sourceOwnerId === undefined
									? undefined
									: normalizeNullableText(sourceOwnerId),
							targetDomain: nextTargetDomain,
							expiresAt:
								expiresAt === undefined
									? undefined
									: expiresAt
										? new Date(expiresAt)
										: null,
							updatedAt: new Date(),
						})
						.where(eq(links.id, id))
						.returning();
					return updated;
				});

				if (!updatedLink) {
					await tombstoneLinkCacheMutations(
						cacheMutations,
						"update did not return a persisted link"
					);
					finalizedFailure = true;
					throw rpcError.notFound("link", input.id);
				}

				const cachedLink = toCachedLink(updatedLink);
				if (nextSlug === oldSlug) {
					await finishLinkCacheMutation(
						oldCacheMutation,
						{ link: cachedLink, state: "link" },
						"update persisted"
					);
				} else {
					const newCacheMutation = cacheMutations.find(
						(mutation) => mutation.slug === nextSlug
					);
					if (newCacheMutation) {
						await Promise.all([
							finishLinkCacheMutation(
								oldCacheMutation,
								{ id: link.id, state: "tombstone" },
								"update renamed link"
							),
							finishLinkCacheMutation(
								newCacheMutation,
								{ link: cachedLink, state: "link" },
								"update renamed link"
							),
						]);
					} else {
						await tombstoneLinkCacheMutations(
							cacheMutations,
							"update persisted without a new-slug cache mutation"
						);
					}
				}

				invalidateLinkAgentContext(link.organizationId);

				return updatedLink;
			} catch (error) {
				if (isUniqueViolationFor(error, "links_slug_unique")) {
					await abandonLinkCacheMutations(
						cacheMutations,
						"update failed because the new slug already exists"
					);
					throw rpcError.conflict("This slug is already taken");
				}
				if (finalizedFailure) {
					throw error;
				}
				if (hasPostgresSqlState(error)) {
					await abandonLinkCacheMutations(
						cacheMutations,
						"update failed with a definitive PostgreSQL error"
					);
					throw error;
				}
				logger.error(
					{ linkId: link.id, oldSlug, nextSlug, ...getErrorLogFields(error) },
					"Link update failed with an uncertain persistence outcome"
				);
				throw rpcError.serviceUnavailable(
					1,
					"Link update outcome is still being reconciled"
				);
			}
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

			let cacheMutations: LinkCacheMutation[] | null;
			try {
				cacheMutations = await beginLinkCacheMutations([
					{ id: link.id, mode: "existing", slug: link.slug },
				]);
			} catch (error) {
				logger.error(
					{ slug: link.slug, linkId: input.id, ...getErrorLogFields(error) },
					"Failed to begin link cache mutation before delete"
				);
				throw rpcError.internal("Failed to update cache. Link not deleted.");
			}

			if (!cacheMutations) {
				logger.warn(
					{ slug: link.slug, linkId: link.id },
					"Link cache mutation conflicts with an in-progress or stale cache entry"
				);
				throw rpcError.conflict(
					"This link is currently being updated. Retry the request."
				);
			}

			let finalizedFailure = false;
			try {
				const deleted = await context.db.transaction(async (tx) => {
					await tx.execute(setLocalLinkStatementTimeout());
					return tx
						.delete(links)
						.where(eq(links.id, input.id))
						.returning({ id: links.id });
				});
				if (deleted.length === 0) {
					await tombstoneLinkCacheMutations(
						cacheMutations,
						"delete did not remove a persisted link"
					);
					finalizedFailure = true;
					throw rpcError.notFound("link", input.id);
				}

				await tombstoneLinkCacheMutations(cacheMutations, "delete persisted");
			} catch (error) {
				if (finalizedFailure) {
					throw error;
				}
				if (hasPostgresSqlState(error)) {
					await abandonLinkCacheMutations(
						cacheMutations,
						"delete failed with a definitive PostgreSQL error"
					);
					throw error;
				}
				logger.error(
					{ slug: link.slug, linkId: link.id, ...getErrorLogFields(error) },
					"Link delete failed with an uncertain persistence outcome"
				);
				throw rpcError.serviceUnavailable(
					1,
					"Link deletion outcome is still being reconciled"
				);
			}
			invalidateLinkAgentContext(link.organizationId);

			return { success: true };
		}),
};
