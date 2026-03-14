import {
	type ApiKeyRow,
	collectScopes,
	keys,
} from "@databuddy/api-keys/resolve";
import { API_SCOPES } from "@databuddy/api-keys/scopes";
import { websitesApi } from "@databuddy/auth";
import { apikey, desc, eq } from "@databuddy/db";
import { invalidateCacheableKey } from "@databuddy/redis";
import { ORPCError } from "@orpc/server";
import {
	ApiKeyErrorCode,
	hasAllScopes,
	hasAnyScope,
	hasScope,
	isExpired,
} from "keypal";
import { z } from "zod";
import type { Context } from "../orpc";
import { protectedProcedure, publicProcedure } from "../orpc";

type ApiKey = ApiKeyRow;
interface Metadata {
	resources?: Record<string, string[]>;
	tags?: string[];
	description?: string;
	lastUsedAt?: string;
}

const scopeEnum = z.enum(API_SCOPES);
const resourcesSchema = z.record(z.string(), z.array(scopeEnum));
const rateLimitSchema = z.object({
	enabled: z.boolean().optional(),
	max: z.number().int().positive().nullable().optional(),
	window: z.number().int().positive().nullable().optional(),
});

const apiKeyOutputSchema = z.object({
	id: z.string(),
	name: z.string(),
	prefix: z.string(),
	start: z.string(),
	type: z.enum(["user", "sdk", "automation"]),
	enabled: z.boolean(),
	scopes: z.array(z.string()),
	tags: z.array(z.string()),
	expiresAt: z.string().nullable(),
	revokedAt: z.nullable(z.coerce.date()),
	lastUsedAt: z.string().nullable(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

const apiKeyFullOutputSchema = apiKeyOutputSchema.extend({
	description: z.string().nullable().optional(),
	resources: z.record(z.string(), z.array(z.string())).optional(),
	rateLimit: z
		.object({
			enabled: z.boolean(),
			max: z.number().int().positive().nullable(),
			window: z.number().int().positive().nullable(),
		})
		.optional(),
});

const apiKeyCreateOutputSchema = z.object({
	id: z.string(),
	secret: z.string(),
	prefix: z.string(),
	start: z.string(),
});

const successOutputSchema = z.object({ success: z.literal(true) });

const verifyValidOutputSchema = z.object({
	valid: z.literal(true),
	keyId: z.string(),
	ownerId: z.string().nullable(),
	scopes: z.array(z.string()),
});

const verifyErrorOutputSchema = z.object({
	valid: z.literal(false),
	error: z.string(),
	errorCode: z.string(),
	scopes: z.array(z.string()).optional(),
	matched: z.array(z.string()).optional(),
	missing: z.array(z.string()).optional(),
});

const verifyOutputSchema = z.discriminatedUnion("valid", [
	verifyValidOutputSchema,
	verifyErrorOutputSchema,
]);

const getMeta = (key: ApiKey): Metadata => (key.metadata as Metadata) ?? {};

async function verifyOrganizationAccess(
	ctx: Pick<Context, "headers" | "user">,
	organizationId: string
) {
	if (ctx.user?.role === "ADMIN") {
		return;
	}
	try {
		const { success } = await websitesApi.hasPermission({
			headers: ctx.headers,
			body: {
				organizationId,
				permissions: { website: ["configure"] },
			},
		});

		if (!success) {
			throw new ORPCError("FORBIDDEN", {
				message: "Missing organization permissions",
			});
		}
	} catch (error) {
		// If it's already an ORPCError, re-throw it
		if (error instanceof ORPCError) {
			throw error;
		}
		// Otherwise, treat permission check failures as FORBIDDEN
		throw new ORPCError("FORBIDDEN", {
			message: "Missing organization permissions",
		});
	}
}

async function getKeyWithAuth(ctx: Context, id: string) {
	const key = await ctx.db.query.apikey.findFirst({ where: eq(apikey.id, id) });
	if (!key) {
		throw new ORPCError("NOT_FOUND", { message: "API key not found" });
	}
	if (!key.organizationId) {
		throw new ORPCError("NOT_FOUND", {
			message: "API key not found",
		});
	}
	await verifyOrganizationAccess(ctx, key.organizationId);
	return key;
}

function mapKey(key: ApiKey, full = false) {
	const meta = getMeta(key);
	return {
		id: key.id,
		name: key.name,
		prefix: key.prefix,
		start: key.start,
		type: key.type,
		enabled: key.enabled,
		scopes: collectScopes(key),
		tags: meta.tags ?? [],
		expiresAt: key.expiresAt,
		revokedAt: key.revokedAt,
		lastUsedAt: meta.lastUsedAt ?? null,
		createdAt: key.createdAt,
		updatedAt: key.updatedAt,
		...(full && {
			description: meta.description ?? null,
			resources: meta.resources ?? {},
			rateLimit: {
				enabled: key.rateLimitEnabled,
				max: key.rateLimitMax,
				window: key.rateLimitTimeWindow,
			},
		}),
	};
}

export const apikeysRouter = {
	list: protectedProcedure
		.route({
			method: "POST",
			path: "/apikeys/list",
			tags: ["API Keys"],
			summary: "List API keys",
			description:
				"Returns API keys for the organization. Requires website configure permission.",
		})
		.input(z.object({ organizationId: z.string() }))
		.output(z.array(apiKeyOutputSchema))
		.handler(async ({ context, input }) => {
			await verifyOrganizationAccess(context, input.organizationId);
			const rows = await context.db
				.select()
				.from(apikey)
				.where(eq(apikey.organizationId, input.organizationId))
				.orderBy(desc(apikey.createdAt));
			return rows.map((r) => mapKey(r));
		}),

	getById: protectedProcedure
		.route({
			method: "POST",
			path: "/apikeys/getById",
			tags: ["API Keys"],
			summary: "Get API key",
			description:
				"Returns a single API key by id with full details. Requires organization website configure permission.",
		})
		.input(z.object({ id: z.string() }))
		.output(apiKeyFullOutputSchema)
		.handler(async ({ context, input }) =>
			mapKey(await getKeyWithAuth(context, input.id), true)
		),

	create: protectedProcedure
		.route({
			method: "POST",
			path: "/apikeys/create",
			tags: ["API Keys"],
			summary: "Create API key",
			description:
				"Creates a new API key. Returns the secret once; store it securely. Requires organization website configure permission.",
		})
		.input(
			z.object({
				name: z.string().min(1).max(100),
				description: z.string().max(500).optional(),
				organizationId: z.string(),
				type: z.enum(["user", "sdk", "automation"]).default("user"),
				scopes: z.array(scopeEnum).default(["read:data"]),
				resources: resourcesSchema.optional(),
				tags: z.array(z.string().max(50)).max(10).optional(),
				expiresAt: z.string().optional(),
				rateLimit: rateLimitSchema.optional(),
			})
		)
		.output(apiKeyCreateOutputSchema)
		.handler(async ({ context, input }) => {
			await verifyOrganizationAccess(context, input.organizationId);

			const { key: secret, record } = await keys.create({
				ownerId: input.organizationId,
				name: input.name,
				scopes: input.scopes,
				resources: input.resources,
				tags: input.tags,
				expiresAt: input.expiresAt ?? null,
			});

			const [created] = await context.db
				.insert(apikey)
				.values({
					id: record.id,
					name: input.name,
					prefix: secret.split("_")[0] ?? "dbdy",
					start: secret.slice(0, 8),
					keyHash: record.keyHash,
					userId: null,
					organizationId: input.organizationId,
					type: input.type,
					scopes: input.scopes,
					enabled: true,
					rateLimitEnabled: input.rateLimit?.enabled ?? true,
					rateLimitMax: input.rateLimit?.max,
					rateLimitTimeWindow: input.rateLimit?.window,
					expiresAt: input.expiresAt ?? null,
					metadata: {
						resources: input.resources,
						tags: input.tags,
						description: input.description,
					},
				})
				.returning();

			return {
				id: created.id,
				secret,
				prefix: created.prefix,
				start: created.start,
			};
		}),

	update: protectedProcedure
		.route({
			method: "POST",
			path: "/apikeys/update",
			tags: ["API Keys"],
			summary: "Update API key",
			description:
				"Updates an existing API key. Requires organization website configure permission.",
		})
		.input(
			z.object({
				id: z.string(),
				name: z.string().min(1).max(100).optional(),
				description: z.string().max(500).nullable().optional(),
				enabled: z.boolean().optional(),
				scopes: z.array(scopeEnum).optional(),
				resources: resourcesSchema.nullable().optional(),
				tags: z.array(z.string().max(50)).max(10).nullable().optional(),
				expiresAt: z.string().nullable().optional(),
				rateLimit: rateLimitSchema.optional(),
			})
		)
		.output(apiKeyOutputSchema)
		.handler(async ({ context, input }) => {
			const key = await getKeyWithAuth(context, input.id);
			const meta = getMeta(key);

			const [updated] = await context.db
				.update(apikey)
				.set({
					...(input.name !== undefined && { name: input.name }),
					...(input.enabled !== undefined && { enabled: input.enabled }),
					...(input.scopes !== undefined && { scopes: input.scopes }),
					...(input.expiresAt !== undefined && { expiresAt: input.expiresAt }),
					...(input.rateLimit?.enabled !== undefined && {
						rateLimitEnabled: input.rateLimit.enabled,
					}),
					...(input.rateLimit?.max !== undefined && {
						rateLimitMax: input.rateLimit.max,
					}),
					...(input.rateLimit?.window !== undefined && {
						rateLimitTimeWindow: input.rateLimit.window,
					}),
					metadata: {
						...meta,
						...(input.resources !== undefined && {
							resources: input.resources ?? undefined,
						}),
						...(input.description !== undefined && {
							description: input.description ?? undefined,
						}),
						...(input.tags !== undefined && { tags: input.tags ?? undefined }),
					},
					updatedAt: new Date(),
				})
				.where(eq(apikey.id, input.id))
				.returning();

			// Invalidate cache for the API key
			await invalidateCacheableKey("api-key-by-hash", updated.keyHash);

			return mapKey(updated);
		}),

	revoke: protectedProcedure
		.route({
			method: "POST",
			path: "/apikeys/revoke",
			tags: ["API Keys"],
			summary: "Revoke API key",
			description:
				"Revokes an API key. The key is disabled and cannot be used. Requires organization website configure permission.",
		})
		.input(z.object({ id: z.string() }))
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const key = await getKeyWithAuth(context, input.id);
			await context.db
				.update(apikey)
				.set({ enabled: false, revokedAt: new Date(), updatedAt: new Date() })
				.where(eq(apikey.id, input.id));

			// Invalidate cache for the revoked API key
			await invalidateCacheableKey("api-key-by-hash", key.keyHash);

			return { success: true };
		}),

	rotate: protectedProcedure
		.route({
			method: "POST",
			path: "/apikeys/rotate",
			tags: ["API Keys"],
			summary: "Rotate API key",
			description:
				"Rotates an API key, issuing a new secret. The old key is invalidated immediately. Returns the new secret once. Requires organization website configure permission.",
		})
		.input(z.object({ id: z.string() }))
		.output(apiKeyCreateOutputSchema)
		.handler(async ({ context, input }) => {
			const key = await getKeyWithAuth(context, input.id);
			const meta = getMeta(key);

			const ownerId = key.organizationId;
			if (!ownerId) {
				throw new ORPCError("INTERNAL_SERVER_ERROR", {
					message: "Organization key required for rotate",
				});
			}
			const { key: secret, record } = await keys.create({
				ownerId,
				name: key.name,
				scopes: key.scopes,
				resources: meta.resources,
				tags: meta.tags,
				expiresAt: key.expiresAt ?? null,
			});

			const [updated] = await context.db
				.update(apikey)
				.set({
					prefix: secret.split("_")[0] ?? "dbdy",
					start: secret.slice(0, 8),
					keyHash: record.keyHash,
					updatedAt: new Date(),
				})
				.where(eq(apikey.id, input.id))
				.returning();

			// Invalidate cache for both old and new key hash
			await Promise.all([
				invalidateCacheableKey("api-key-by-hash", key.keyHash),
				invalidateCacheableKey("api-key-by-hash", updated.keyHash),
			]);

			return {
				id: updated.id,
				secret,
				prefix: updated.prefix,
				start: updated.start,
			};
		}),

	delete: protectedProcedure
		.route({
			method: "POST",
			path: "/apikeys/delete",
			tags: ["API Keys"],
			summary: "Delete API key",
			description:
				"Permanently deletes an API key. Requires organization website configure permission.",
		})
		.input(z.object({ id: z.string() }))
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const key = await getKeyWithAuth(context, input.id);
			await context.db.delete(apikey).where(eq(apikey.id, input.id));

			// Invalidate cache for the deleted API key
			await invalidateCacheableKey("api-key-by-hash", key.keyHash);

			return { success: true };
		}),

	verify: publicProcedure
		.route({
			method: "POST",
			path: "/apikeys/verify",
			tags: ["API Keys"],
			summary: "Verify API key",
			description:
				"Validates an API key (from header or body) and optionally checks scopes. Can be used without auth to test a key.",
		})
		.input(
			z.object({
				secret: z.string().optional(),
				resource: z.string().optional(),
				requiredScopes: z.array(scopeEnum).optional(),
				mode: z.enum(["any", "all"]).default("any"),
				trackUsage: z.boolean().default(true),
			})
		)
		.output(verifyOutputSchema)
		.handler(async ({ context, input }) => {
			// Use keys.extractKey() for header extraction
			const secret = input.secret ?? keys.extractKey(context.headers);
			if (!secret) {
				return {
					valid: false,
					error: "No API key",
					errorCode: ApiKeyErrorCode.MISSING_KEY,
				};
			}

			const key = await context.db.query.apikey.findFirst({
				where: eq(apikey.keyHash, keys.hashKey(secret)),
			});
			if (!key) {
				return {
					valid: false,
					error: "Invalid key",
					errorCode: ApiKeyErrorCode.INVALID_KEY,
				};
			}
			if (!key.enabled) {
				return {
					valid: false,
					error: "Disabled",
					errorCode: ApiKeyErrorCode.DISABLED,
				};
			}
			if (key.revokedAt) {
				return {
					valid: false,
					error: "Revoked",
					errorCode: ApiKeyErrorCode.REVOKED,
				};
			}
			if (isExpired(key.expiresAt)) {
				return {
					valid: false,
					error: "Expired",
					errorCode: ApiKeyErrorCode.EXPIRED,
				};
			}

			const scopes = collectScopes(key, input.resource);

			// Use keypal's scope checking
			if (input.requiredScopes?.length) {
				const check = input.mode === "all" ? hasAllScopes : hasAnyScope;
				if (!check(scopes, input.requiredScopes)) {
					return {
						valid: false,
						error: "Missing scopes",
						errorCode: "MISSING_SCOPES",
						scopes,
						matched: input.requiredScopes.filter((s) => hasScope(scopes, s)),
						missing: input.requiredScopes.filter((s) => !hasScope(scopes, s)),
					};
				}
			}

			if (input.trackUsage) {
				await context.db
					.update(apikey)
					.set({
						metadata: { ...getMeta(key), lastUsedAt: new Date().toISOString() },
					})
					.where(eq(apikey.id, key.id));
			}

			return {
				valid: true,
				keyId: key.id,
				ownerId: key.organizationId,
				scopes,
			};
		}),
};
