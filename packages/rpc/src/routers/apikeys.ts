import {
	type ApiKeyRow,
	collectScopes,
	keys,
	markApiKeyUsed,
	withApiKeyCacheInvalidation,
} from "@databuddy/api-keys/resolve";
import { API_SCOPES } from "@databuddy/api-keys/scopes";
import { desc, eq } from "@databuddy/db";
import { apikey } from "@databuddy/db/schema";
import {
	ApiKeyErrorCode,
	hasAllScopes,
	hasAnyScope,
	hasScope,
	isExpired,
} from "keypal";
import { z } from "zod";
import { rpcError } from "../errors";
import { setTrackProperties } from "../middleware/track-mutation";
import type { Context } from "../orpc";
import {
	protectedProcedure,
	publicProcedure,
	sessionProcedure,
	trackedProcedure,
} from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

type ApiKey = ApiKeyRow;
interface Metadata {
	description?: string;
	resources?: Record<string, string[]>;
	tags?: string[];
}

const MAX_RESOURCE_KEY_LENGTH = 128;
const MAX_RESOURCE_ENTRIES = 100;
const MAX_METADATA_BYTES = 16 * 1024;

const scopeEnum = z.enum(API_SCOPES);
const resourcesSchema = z
	.record(z.string().max(MAX_RESOURCE_KEY_LENGTH), z.array(scopeEnum))
	.refine((r) => Object.keys(r).length <= MAX_RESOURCE_ENTRIES, {
		message: `Too many resource entries (max ${MAX_RESOURCE_ENTRIES})`,
	});

function assertMetadataSize(meta: Record<string, unknown>) {
	const bytes = Buffer.byteLength(JSON.stringify(meta), "utf8");
	if (bytes > MAX_METADATA_BYTES) {
		throw rpcError.badRequest(
			`Metadata too large: ${bytes} bytes exceeds limit of ${MAX_METADATA_BYTES}`
		);
	}
}

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
	expiresAt: z.nullable(z.coerce.date()),
	revokedAt: z.nullable(z.coerce.date()),
	lastUsedAt: z.nullable(z.coerce.date()),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

const apiKeyFullOutputSchema = apiKeyOutputSchema.extend({
	description: z.string().nullable().optional(),
	resources: z.record(z.string(), z.array(z.string())).optional(),
	ratelimit: z
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

async function authorizeKeyManagement(ctx: Context, organizationId: string) {
	if (!ctx.user) {
		throw rpcError.forbidden(
			"API key management requires a user session, not an API key"
		);
	}
	await withWorkspace(ctx, {
		organizationId,
		resource: "website",
		permissions: ["update"],
	});
}

async function assertOrgAdmin(
	ctx: Context,
	organizationId: string,
	action: string
) {
	if (!ctx.user) {
		throw rpcError.forbidden(
			`${action} cannot be performed via an API key — use a user session`
		);
	}
	const workspace = await withWorkspace(ctx, {
		organizationId,
		resource: "organization",
		permissions: ["read"],
	});
	if (workspace.role !== "owner" && workspace.role !== "admin") {
		throw rpcError.forbidden(
			`Only organization owners or admins can ${action.toLowerCase()}`
		);
	}
}

async function getAuthorizedKey(ctx: Context, id: string) {
	const key = await ctx.db.query.apikey.findFirst({ where: { id } });
	if (!key) {
		throw rpcError.notFound("API key", id);
	}
	if (!key.organizationId) {
		throw rpcError.notFound("API key", id);
	}
	await authorizeKeyManagement(ctx, key.organizationId);
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
		lastUsedAt: key.lastUsedAt,
		createdAt: key.createdAt,
		updatedAt: key.updatedAt,
		...(full && {
			description: meta.description ?? null,
			resources: meta.resources ?? {},
			ratelimit: {
				enabled: key.rateLimitEnabled,
				max: key.rateLimitMax,
				window: key.rateLimitTimeWindow,
			},
		}),
	};
}

const myRoleOutputSchema = z.object({
	role: z.enum(["owner", "admin", "member"]).nullable(),
	canEditScopes: z.boolean(),
});

export const apikeysRouter = {
	getMyRole: sessionProcedure
		.route({
			method: "POST",
			path: "/apikeys/getMyRole",
			tags: ["API Keys"],
			summary: "Caller's role in an organization (for scope-edit UX)",
			description:
				"Returns the session user's membership role in the given organization so clients can disable scope editing for non-admins.",
		})
		.input(z.object({ organizationId: z.string() }))
		.output(myRoleOutputSchema)
		.handler(async ({ context, input }) => {
			const m = await context.db.query.member.findFirst({
				where: {
					organizationId: input.organizationId,
					userId: context.user.id,
				},
				columns: { role: true },
			});
			const role = (m?.role ?? null) as "owner" | "admin" | "member" | null;
			return {
				role,
				canEditScopes: role === "owner" || role === "admin",
			};
		}),

	list: protectedProcedure
		.route({
			method: "POST",
			path: "/apikeys/list",
			tags: ["API Keys"],
			summary: "List API keys",
			description:
				"Returns API keys for the organization with full details. Requires website configure permission.",
		})
		.input(z.object({ organizationId: z.string() }))
		.output(z.array(apiKeyFullOutputSchema))
		.handler(async ({ context, input }) => {
			await authorizeKeyManagement(context, input.organizationId);
			const rows = await context.db
				.select()
				.from(apikey)
				.where(eq(apikey.organizationId, input.organizationId))
				.orderBy(desc(apikey.createdAt));
			return rows.map((r) => mapKey(r, true));
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
			mapKey(await getAuthorizedKey(context, input.id), true)
		),

	create: trackedProcedure
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
				scopes: z.array(scopeEnum).default([]),
				resources: resourcesSchema.optional(),
				tags: z.array(z.string().max(50)).max(10).optional(),
				expiresAt: z.string().optional(),
				ratelimit: rateLimitSchema.optional(),
			})
		)
		.output(apiKeyCreateOutputSchema)
		.handler(async ({ context, input }) => {
			setTrackProperties({ type: input.type, has_expiry: !!input.expiresAt });
			await authorizeKeyManagement(context, input.organizationId);

			const grantingScopes =
				input.scopes.length > 0 ||
				Object.keys(input.resources ?? {}).length > 0;
			if (grantingScopes) {
				await assertOrgAdmin(
					context,
					input.organizationId,
					"Change API key scopes"
				);
			}

			const nextMetadata = {
				resources: input.resources,
				tags: input.tags,
				description: input.description,
			};
			assertMetadataSize(nextMetadata);

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
					rateLimitEnabled: input.ratelimit?.enabled ?? true,
					rateLimitMax: input.ratelimit?.max,
					rateLimitTimeWindow: input.ratelimit?.window,
					expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
					metadata: nextMetadata,
				})
				.returning();

			return {
				id: created.id,
				secret,
				prefix: created.prefix,
				start: created.start,
			};
		}),

	update: trackedProcedure
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
				ratelimit: rateLimitSchema.optional(),
			})
		)
		.output(apiKeyOutputSchema)
		.handler(async ({ context, input }) => {
			const key = await getAuthorizedKey(context, input.id);
			const meta = getMeta(key);

			const grantingScopes =
				input.scopes !== undefined ||
				(input.resources !== undefined &&
					input.resources !== null &&
					Object.keys(input.resources).length > 0);
			if (grantingScopes && key.organizationId) {
				await assertOrgAdmin(
					context,
					key.organizationId,
					"Change API key scopes"
				);
			}

			const nextMetadata = {
				...meta,
				...(input.resources !== undefined && {
					resources: input.resources ?? undefined,
				}),
				...(input.description !== undefined && {
					description: input.description ?? undefined,
				}),
				...(input.tags !== undefined && { tags: input.tags ?? undefined }),
			};
			assertMetadataSize(nextMetadata);

			const [updated] = await withApiKeyCacheInvalidation(
				[key.keyHash],
				() =>
					context.db
						.update(apikey)
						.set({
							...(input.name !== undefined && { name: input.name }),
							...(input.enabled !== undefined && { enabled: input.enabled }),
							...(input.scopes !== undefined && { scopes: input.scopes }),
							...(input.expiresAt !== undefined && {
								expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
							}),
							...(input.ratelimit?.enabled !== undefined && {
								rateLimitEnabled: input.ratelimit.enabled,
							}),
							...(input.ratelimit?.max !== undefined && {
								rateLimitMax: input.ratelimit.max,
							}),
							...(input.ratelimit?.window !== undefined && {
								rateLimitTimeWindow: input.ratelimit.window,
							}),
							metadata: nextMetadata,
							updatedAt: new Date(),
						})
						.where(eq(apikey.id, input.id))
						.returning(),
				(rows) => [rows[0]?.keyHash]
			);

			return mapKey(updated);
		}),

	revoke: trackedProcedure
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
			const key = await getAuthorizedKey(context, input.id);
			if (!key.organizationId) {
				throw rpcError.internal("Organization key required to revoke");
			}
			await assertOrgAdmin(context, key.organizationId, "Revoke API keys");

			await withApiKeyCacheInvalidation([key.keyHash], () =>
				context.db
					.update(apikey)
					.set({ enabled: false, revokedAt: new Date(), updatedAt: new Date() })
					.where(eq(apikey.id, input.id))
			);

			return { success: true };
		}),

	rotate: trackedProcedure
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
			const key = await getAuthorizedKey(context, input.id);
			const meta = getMeta(key);

			const ownerId = key.organizationId;
			if (!ownerId) {
				throw rpcError.internal("Organization key required for rotate");
			}
			await assertOrgAdmin(context, ownerId, "Rotate API keys");

			const { key: secret, record } = await keys.create({
				ownerId,
				name: key.name,
				scopes: key.scopes,
				resources: meta.resources,
				tags: meta.tags,
				expiresAt: key.expiresAt?.toISOString() ?? null,
			});

			const [updated] = await withApiKeyCacheInvalidation(
				[key.keyHash],
				() =>
					context.db
						.update(apikey)
						.set({
							prefix: secret.split("_")[0] ?? "dbdy",
							start: secret.slice(0, 8),
							keyHash: record.keyHash,
							updatedAt: new Date(),
						})
						.where(eq(apikey.id, input.id))
						.returning(),
				(rows) => [rows[0]?.keyHash]
			);

			return {
				id: updated.id,
				secret,
				prefix: updated.prefix,
				start: updated.start,
			};
		}),

	delete: trackedProcedure
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
			const key = await getAuthorizedKey(context, input.id);
			if (!key.organizationId) {
				throw rpcError.internal("Organization key required to delete");
			}
			await assertOrgAdmin(context, key.organizationId, "Delete API keys");

			await withApiKeyCacheInvalidation([key.keyHash], () =>
				context.db.delete(apikey).where(eq(apikey.id, input.id))
			);

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
				where: { keyHash: keys.hashKey(secret) },
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
			if (isExpired(key.expiresAt?.toISOString() ?? null)) {
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
				await markApiKeyUsed(key.id);
			}

			return {
				valid: true,
				keyId: key.id,
				ownerId: key.organizationId,
				scopes,
			};
		}),
};
