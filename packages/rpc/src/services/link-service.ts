import { and, eq, isNull, isUniqueViolationFor } from "@databuddy/db";
import { linkFolders, links } from "@databuddy/db/schema";
import {
	abandonCachedLinkMutation as redisAbandon,
	beginCachedLinkMutation as redisBegin,
	type CachedLink,
	type CachedLinkMutationNext,
	finishCachedLinkMutation as redisFinish,
	invalidateAgentContextSnapshotsForOwner,
	setCachedLinkIfAbsentOrNotFound as redisSetIfAbsentOrNotFound,
} from "@databuddy/redis";
import { isDeepLinkTarget } from "@databuddy/shared/constants/deep-link-apps";
import { getErrorLogFields } from "@databuddy/shared/evlog-fields";
import { randomUUIDv7 } from "bun";
import { customAlphabet } from "nanoid";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
import type { Context } from "../orpc";

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
	organizationId: string;
	slug: string;
	token: string;
}
type LinkCacheMutationRequest = Pick<
	LinkCacheMutation,
	"id" | "organizationId" | "slug"
> & { mode: "existing" | "new" };

function hasPostgresSqlState(error: unknown): boolean {
	const seen = new Set<object>();
	let current: unknown = error;
	while (typeof current === "object" && current !== null) {
		if (seen.has(current as object)) {
			return false;
		}
		seen.add(current as object);
		if (
			"code" in (current as Record<string, unknown>) &&
			typeof (current as Record<string, unknown>).code === "string" &&
			((current as Record<string, unknown>).code as string).length === 5 &&
			"severity" in (current as Record<string, unknown>) &&
			typeof (current as Record<string, unknown>).severity === "string"
		) {
			return true;
		}
		current =
			"cause" in (current as Record<string, unknown>)
				? (current as Record<string, unknown>).cause
				: null;
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

export function normalizeNullableText(
	value: string | null | undefined
): string | null {
	if (value == null) {
		return null;
	}
	const trimmed = value.trim();
	return trimmed || null;
}

export function normalizeTargetDomain(
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

const generateLinkSlug = customAlphabet(
	"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
	8
);

export interface LinkServiceDeps {
	db: Context["db"];
}

export class LinkService {
	private db: Context["db"];

	constructor(deps: LinkServiceDeps) {
		this.db = deps.db;
	}

	// — cache helpers (locality: all lease handling co-located) —
	private async abandonLinkCacheMutations(
		mutations: LinkCacheMutation[],
		reason: string
	): Promise<void> {
		await Promise.all(
			mutations.map(async ({ id, organizationId, slug, token }) => {
				try {
					if (await redisAbandon(slug, token)) {
						return;
					}
					logger.warn(
						{ linkId: id, organizationId, slug },
						"Lost link cache mutation lease while abandoning mutation"
					);
				} catch (error) {
					logger.error(
						{
							linkId: id,
							organizationId,
							slug,
							reason,
							...getErrorLogFields(error),
						},
						"Failed to abandon link cache mutation"
					);
				}
			})
		);
	}

	private async finishLinkCacheMutation(
		mutation: LinkCacheMutation,
		next: CachedLinkMutationNext,
		reason: string
	): Promise<boolean> {
		const { id, organizationId, slug, token } = mutation;
		try {
			if (await redisFinish(slug, token, next)) {
				return true;
			}
			logger.warn(
				{ linkId: id, organizationId, slug, reason },
				"Lost link cache mutation lease before cache finalization"
			);
		} catch (error) {
			logger.error(
				{
					linkId: id,
					organizationId,
					slug,
					reason,
					...getErrorLogFields(error),
				},
				"Failed to finalize link cache mutation"
			);
		}
		try {
			await redisAbandon(slug, token);
		} catch (error) {
			logger.error(
				{
					linkId: id,
					organizationId,
					slug,
					reason,
					...getErrorLogFields(error),
				},
				"Failed to release link cache mutation after finalization failure"
			);
		}
		return false;
	}

	private async backfillLinkCache(
		slug: string,
		link: CacheableLink & { organizationId: string },
		reason: string
	): Promise<void> {
		try {
			if (await redisSetIfAbsentOrNotFound(slug, toCachedLink(link))) {
				return;
			}
			logger.warn(
				{ linkId: link.id, organizationId: link.organizationId, slug, reason },
				"Link cache backfill did not replace an existing entry"
			);
		} catch (error) {
			logger.error(
				{
					linkId: link.id,
					organizationId: link.organizationId,
					slug,
					reason,
					...getErrorLogFields(error),
				},
				"Failed to backfill link cache"
			);
		}
	}

	private async tombstoneLinkCacheMutations(
		mutations: LinkCacheMutation[],
		reason: string
	): Promise<void> {
		await Promise.all(
			mutations.map((m) =>
				this.finishLinkCacheMutation(
					m,
					{ id: m.id, state: "tombstone" },
					reason
				)
			)
		);
	}

	private async beginLinkCacheMutations(
		requests: LinkCacheMutationRequest[]
	): Promise<LinkCacheMutation[] | null> {
		const mutations: LinkCacheMutation[] = [];
		try {
			for (const request of [...requests].sort((a, b) =>
				a.slug.localeCompare(b.slug)
			)) {
				const started = await redisBegin(request.slug, request);
				if (started.state !== "acquired") {
					await this.abandonLinkCacheMutations(
						mutations,
						"another mutation already owns this slug"
					);
					return null;
				}
				mutations.push({
					id: request.id,
					organizationId: request.organizationId,
					slug: request.slug,
					token: started.token,
				});
			}
			return mutations;
		} catch (error) {
			await this.abandonLinkCacheMutations(
				mutations,
				"failed before the database mutation started"
			);
			throw error;
		}
	}

	private invalidateLinkAgentContext(organizationId: string): void {
		invalidateAgentContextSnapshotsForOwner(organizationId).catch((error) => {
			logger.error(
				{ organizationId, ...getErrorLogFields(error) },
				"Unexpected link agent-context invalidation failure"
			);
		});
	}

	async getLinkOrThrow(id: string): Promise<LinkRow> {
		const [link] = await this.db
			.select()
			.from(links)
			.where(and(eq(links.id, id), isNull(links.deletedAt)))
			.limit(1);
		if (!link) {
			throw rpcError.notFound("link", id);
		}
		return link;
	}

	async create(input: {
		organizationId: string;
		createdBy?: string;
		getCreatedBy?: () => Promise<string>;
		name: string;
		targetUrl: string;
		slug?: string;
		folderId?: string | null;
		expiresAt?: string | Date | null;
		expiredRedirectUrl?: string | null;
		ogTitle?: string | null;
		ogDescription?: string | null;
		ogImageUrl?: string | null;
		ogVideoUrl?: string | null;
		iosUrl?: string | null;
		androidUrl?: string | null;
		externalId?: string | null;
		sourceType?: string | null;
		sourceId?: string | null;
		sourceOwnerId?: string | null;
		targetDomain?: string | null;
		deepLinkApp?: string | null;
	}): Promise<LinkRow> {
		validateDeepLinkConfiguration(input.deepLinkApp, input.targetUrl);
		const resolvedFolderId = await validateFolderId(
			this.db,
			input.folderId,
			input.organizationId
		);
		const targetDomain =
			normalizeTargetDomain(input.targetDomain) ??
			getTargetDomain(input.targetUrl);
		let createdBy: string;
		if (input.getCreatedBy) {
			createdBy = await input.getCreatedBy();
		} else if (input.createdBy) {
			createdBy = input.createdBy;
		} else {
			throw rpcError.internal("createdBy or getCreatedBy required");
		}

		const slugsToTry = input.slug
			? [input.slug]
			: Array.from({ length: 10 }, () => generateLinkSlug());

		for (const slug of slugsToTry) {
			const linkId = randomUUIDv7();
			let cacheMutations: LinkCacheMutation[] = [];
			if (input.slug) {
				let started: LinkCacheMutation[] | null;
				try {
					started = await this.beginLinkCacheMutations([
						{
							id: linkId,
							mode: "new",
							organizationId: input.organizationId,
							slug,
						},
					]);
				} catch (error) {
					logger.error(
						{ slug, linkId, ...getErrorLogFields(error) },
						"Failed to begin link cache mutation before create"
					);
					throw rpcError.serviceUnavailable(
						1,
						"Link cache is temporarily unavailable; retry this custom slug"
					);
				}
				if (!started) {
					throw rpcError.conflict(
						"This slug is already taken or is being updated"
					);
				}
				cacheMutations = started;
			}
			const [cacheMutation] = cacheMutations;
			let finalizedFailure = false;
			try {
				const [newLink] = await this.db
					.insert(links)
					.values({
						id: linkId,
						slug,
						organizationId: input.organizationId,
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
				if (!newLink) {
					await this.abandonLinkCacheMutations(
						cacheMutations,
						"create returned no persisted link"
					);
					finalizedFailure = true;
					throw rpcError.internal("Failed to create link");
				}
				const publishCache = cacheMutation
					? this.finishLinkCacheMutation(
							cacheMutation,
							{ link: toCachedLink(newLink), state: "link" },
							"create persisted"
						)
					: this.backfillLinkCache(
							slug,
							newLink as CacheableLink & { organizationId: string },
							"create bypassed cache lease"
						);
				publishCache.catch((error) => {
					logger.error(
						{ slug, linkId, ...getErrorLogFields(error) },
						"Failed to publish created link to cache"
					);
				});
				this.invalidateLinkAgentContext(input.organizationId);
				return newLink;
			} catch (error) {
				if (isUniqueViolationFor(error, "links_slug_unique")) {
					await this.abandonLinkCacheMutations(
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
					await this.abandonLinkCacheMutations(
						cacheMutations,
						"create failed with a definitive PostgreSQL error"
					);
					throw error;
				}
				let persistedLink: LinkRow | undefined;
				try {
					[persistedLink] = await this.db
						.select()
						.from(links)
						.where(eq(links.id, linkId))
						.limit(1);
				} catch (reconciliationError) {
					logger.error(
						{ slug, linkId, ...getErrorLogFields(reconciliationError) },
						"Failed to reconcile uncertain link create"
					);
					throw rpcError.serviceUnavailable(
						1,
						"Link creation outcome is still being reconciled"
					);
				}
				if (persistedLink) {
					if (cacheMutation) {
						await this.finishLinkCacheMutation(
							cacheMutation,
							{ link: toCachedLink(persistedLink), state: "link" },
							"create reconciled after ambiguous database error"
						);
					} else {
						await this.backfillLinkCache(
							slug,
							persistedLink as CacheableLink & { organizationId: string },
							"create reconciled after cache bypass"
						);
					}
					this.invalidateLinkAgentContext(input.organizationId);
					return persistedLink;
				}
				logger.error(
					{ slug, linkId, ...getErrorLogFields(error) },
					"Link create failed with an uncertain persistence outcome"
				);
				throw rpcError.serviceUnavailable(
					1,
					"Link creation outcome is still being reconciled"
				);
			}
		}
		throw rpcError.internal("Failed to generate unique slug");
	}

	async update(
		link: LinkRow,
		input: {
			name?: string;
			targetUrl?: string;
			slug?: string;
			folderId?: string | null;
			expiresAt?: string | Date | null;
			expiredRedirectUrl?: string | null;
			ogTitle?: string | null;
			ogDescription?: string | null;
			ogImageUrl?: string | null;
			ogVideoUrl?: string | null;
			iosUrl?: string | null;
			androidUrl?: string | null;
			externalId?: string | null;
			sourceType?: string | null;
			sourceId?: string | null;
			sourceOwnerId?: string | null;
			targetDomain?: string | null;
			deepLinkApp?: string | null;
		}
	): Promise<LinkRow> {
		if (input.targetUrl !== undefined || input.deepLinkApp !== undefined) {
			validateDeepLinkConfiguration(
				input.deepLinkApp === undefined ? link.deepLinkApp : input.deepLinkApp,
				input.targetUrl ?? link.targetUrl
			);
		}
		let resolvedFolderId: string | null | undefined;
		if (input.folderId !== undefined) {
			resolvedFolderId = await validateFolderId(
				this.db,
				input.folderId,
				link.organizationId
			);
		}
		const {
			expiresAt,
			folderId,
			sourceType,
			sourceId,
			sourceOwnerId,
			targetDomain,
			...updates
		} = input as Record<string, unknown> & typeof input;
		const oldSlug = link.slug;
		const nextSlug = (updates as { slug?: string }).slug ?? oldSlug;
		const nextTargetDomain =
			targetDomain === undefined
				? input.targetUrl
					? getTargetDomain(input.targetUrl)
					: undefined
				: normalizeTargetDomain(targetDomain);

		const cacheMutationRequests: LinkCacheMutationRequest[] = [
			{
				id: link.id,
				mode: "existing",
				organizationId: link.organizationId,
				slug: oldSlug,
			},
		];
		if (nextSlug !== oldSlug) {
			cacheMutationRequests.push({
				id: link.id,
				mode: "new",
				organizationId: link.organizationId,
				slug: nextSlug,
			});
		}
		let cacheMutations: LinkCacheMutation[] | null;
		try {
			cacheMutations = await this.beginLinkCacheMutations(
				cacheMutationRequests
			);
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
		const oldCacheMutation = cacheMutations.find((m) => m.slug === oldSlug);
		if (!oldCacheMutation) {
			await this.abandonLinkCacheMutations(
				cacheMutations,
				"missing old-slug cache mutation before update"
			);
			throw rpcError.internal("Failed to begin link cache mutation");
		}
		let finalizedFailure = false;
		try {
			const [updatedLink] = await this.db
				.update(links)
				.set({
					...(updates as Record<string, unknown>),
					folderId:
						resolvedFolderId === undefined ? undefined : resolvedFolderId,
					sourceType:
						sourceType === undefined
							? undefined
							: normalizeNullableText(sourceType as string | null),
					sourceId:
						sourceId === undefined
							? undefined
							: normalizeNullableText(sourceId as string | null),
					sourceOwnerId:
						sourceOwnerId === undefined
							? undefined
							: normalizeNullableText(sourceOwnerId as string | null),
					targetDomain: nextTargetDomain,
					expiresAt:
						expiresAt === undefined
							? undefined
							: expiresAt
								? new Date(expiresAt as string)
								: null,
					updatedAt: new Date(),
				})
				.where(eq(links.id, link.id))
				.returning();
			if (!updatedLink) {
				await this.tombstoneLinkCacheMutations(
					cacheMutations,
					"update did not return a persisted link"
				);
				finalizedFailure = true;
				throw rpcError.notFound("link", link.id);
			}
			const cachedLink = toCachedLink(updatedLink);
			if (nextSlug === oldSlug) {
				await this.finishLinkCacheMutation(
					oldCacheMutation,
					{ link: cachedLink, state: "link" },
					"update persisted"
				);
			} else {
				const newCacheMutation = cacheMutations.find(
					(m) => m.slug === nextSlug
				);
				if (newCacheMutation) {
					await Promise.all([
						this.finishLinkCacheMutation(
							oldCacheMutation,
							{ id: link.id, state: "tombstone" },
							"update renamed link"
						),
						this.finishLinkCacheMutation(
							newCacheMutation,
							{ link: cachedLink, state: "link" },
							"update renamed link"
						),
					]);
				} else {
					await this.tombstoneLinkCacheMutations(
						cacheMutations,
						"update persisted without a new-slug cache mutation"
					);
				}
			}
			this.invalidateLinkAgentContext(link.organizationId);
			return updatedLink;
		} catch (error) {
			if (isUniqueViolationFor(error, "links_slug_unique")) {
				await this.abandonLinkCacheMutations(
					cacheMutations,
					"update failed because the new slug already exists"
				);
				throw rpcError.conflict("This slug is already taken");
			}
			if (finalizedFailure) {
				throw error;
			}
			if (hasPostgresSqlState(error)) {
				await this.abandonLinkCacheMutations(
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
	}

	async delete(link: LinkRow): Promise<{ success: true }> {
		let cacheMutations: LinkCacheMutation[] | null;
		try {
			cacheMutations = await this.beginLinkCacheMutations([
				{
					id: link.id,
					mode: "existing",
					organizationId: link.organizationId,
					slug: link.slug,
				},
			]);
		} catch (error) {
			logger.error(
				{ slug: link.slug, linkId: link.id, ...getErrorLogFields(error) },
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
			const deleted = await this.db
				.delete(links)
				.where(eq(links.id, link.id))
				.returning({ id: links.id });
			if (deleted.length === 0) {
				await this.tombstoneLinkCacheMutations(
					cacheMutations,
					"delete did not remove a persisted link"
				);
				finalizedFailure = true;
				throw rpcError.notFound("link", link.id);
			}
			await this.tombstoneLinkCacheMutations(
				cacheMutations,
				"delete persisted"
			);
		} catch (error) {
			if (finalizedFailure) {
				throw error;
			}
			if (hasPostgresSqlState(error)) {
				await this.abandonLinkCacheMutations(
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
		this.invalidateLinkAgentContext(link.organizationId);
		return { success: true };
	}
}
