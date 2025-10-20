import { randomBytes, scryptSync } from 'node:crypto';
import { websitesApi } from '@databuddy/auth';
import {
	and,
	apikey,
	apikeyAccess,
	desc,
	eq,
	type InferInsertModel,
	type InferSelectModel,
	isNull,
	sql,
} from '@databuddy/db';
import { TRPCError } from '@trpc/server';
import { customAlphabet, nanoid } from 'nanoid';
import { z } from 'zod';
import { logger } from '../lib/logger';
import type { Context } from '../trpc';
import { createTRPCRouter, protectedProcedure } from '../trpc';

type ApiScope = InferSelectModel<typeof apikey>['scopes'][number];

const API_SCOPE_VALUES = [
	'read:data',
	'write:data',
	'read:experiments',
	'track:events',
	'admin:apikeys',
	// New scopes for core use cases
	'read:analytics',
	'write:custom-sql',
	'read:export',
	'write:otel',
	// Administrative scopes
	'admin:users',
	'admin:organizations',
	'admin:websites',
	// Rate limiting and usage scopes
	'rate:standard',
	'rate:premium',
	'rate:enterprise',
] as const;

const API_RESOURCE_TYPE_VALUES = [
	'global',
	'website',
	'ab_experiment',
	'feature_flag',
	// New resource types for data categories
	'analytics_data',
	'error_data',
	'web_vitals',
	'custom_events',
	'export_data',
] as const;

const accessEntrySchema = z.object({
	resourceType: z.enum(API_RESOURCE_TYPE_VALUES),
	resourceId: z.string().optional(),
	scopes: z.array(z.enum(API_SCOPE_VALUES)).default([]),
});

const jsonValue: z.ZodType<unknown> = z.lazy(() =>
	z.union([
		z.string(),
		z.number(),
		z.boolean(),
		z.null(),
		z.array(jsonValue),
		z.record(z.string(), jsonValue),
	])
);

const createApiKeySchema = z.object({
	name: z.string().min(1).max(100),
	organizationId: z.string().optional(),
	type: z.enum(['user', 'sdk', 'automation']).optional(),
	globalScopes: z.array(z.enum(API_SCOPE_VALUES)).default([]),
	access: z.array(accessEntrySchema).default([]),
	rateLimitEnabled: z.boolean().optional(),
	rateLimitTimeWindow: z.number().int().positive().optional(),
	rateLimitMax: z.number().int().positive().optional(),
	expiresAt: z.string().optional(),
	metadata: z.record(z.string(), jsonValue).optional(),
});

const updateApiKeySchema = z.object({
	id: z.string(),
	name: z.string().min(1).max(100).optional(),
	enabled: z.boolean().optional(),
	rateLimitEnabled: z.boolean().optional(),
	rateLimitTimeWindow: z.number().int().positive().optional(),
	rateLimitMax: z.number().int().positive().optional(),
	expiresAt: z.string().nullable().optional(),
	metadata: z.record(z.string(), jsonValue).optional(),
});

const setAccessListSchema = z.object({
	apikeyId: z.string(),
	access: z.array(accessEntrySchema),
});

const addOrUpdateAccessSchema = accessEntrySchema.extend({
	apikeyId: z.string(),
});

const removeAccessSchema = z.object({
	apikeyId: z.string(),
	resourceType: z.enum(API_RESOURCE_TYPE_VALUES),
	resourceId: z.string().optional(),
});

const rotateApiKeySchema = z.object({ id: z.string() });

const resolveAccessSchema = z.object({
	apikeyId: z.string(),
	resourceType: z.enum(API_RESOURCE_TYPE_VALUES),
	resourceId: z.string().optional(),
});

const generateKeyMaterial = () => {
	const alphabet =
		'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
	const nano = customAlphabet(alphabet, 48);
	const prefix = 'dbdy';
	const secret = `${prefix}_${nano()}`;
	const start = secret.slice(0, 8);
	return { secret, prefix, start } as const;
};

const hashSecretScrypt = (secret: string) => {
	const salt = randomBytes(16);
	const derived = scryptSync(secret, salt, 64);
	return `scrypt:${salt.toString('base64')}:${derived.toString('base64')}`;
};

async function assertOrgPermission(
	ctx: Context,
	requiredScopes: string[] = []
) {
	if (ctx.user.role === 'ADMIN') {
		logger.info('Organization permission granted via admin role', {
			userId: ctx.user.id,
			requiredScopes,
		});
		return;
	}

	// Check if user has organization-level permissions
	const { success } = await websitesApi.hasPermission({
		headers: ctx.headers,
		body: { permissions: { website: ['configure'] } },
	});

	if (!success) {
		logger.warn('Organization permission denied', {
			userId: ctx.user.id,
			requiredScopes,
			reason: 'User lacks organization-level configure permission',
		});
		throw new TRPCError({
			code: 'FORBIDDEN',
			message:
				'Missing organization permissions. You need configure access to manage organization API keys.',
		});
	}

	logger.info('Organization permission granted', {
		userId: ctx.user.id,
		requiredScopes,
		source: 'website_configure_permission',
	});
}

function assertUserOwnershipOrAdmin(ctx: Context, userId: string | null) {
	if (ctx.user.role === 'ADMIN') {
		logger.info('User ownership check bypassed via admin role', {
			adminUserId: ctx.user.id,
			targetUserId: userId,
		});
		return;
	}
	if (!userId || userId !== ctx.user.id) {
		logger.warn('User ownership check failed', {
			requestingUserId: ctx.user.id,
			targetUserId: userId,
			reason: userId ? 'Ownership mismatch' : 'No user ID provided',
		});
		throw new TRPCError({
			code: 'FORBIDDEN',
			message: 'Not authorized. You can only manage your own API keys.',
		});
	}

	logger.debug('User ownership check passed', {
		userId: ctx.user.id,
		targetUserId: userId,
	});
}

async function assertCanManageKey(
	ctx: Context,
	key: InferSelectModel<typeof apikey>
) {
	if (key.organizationId) {
		// Organization API key - requires organization permissions
		await assertOrgPermission(ctx, ['admin:apikeys']);
		logger.info('Organization API key management authorized', {
			apikeyId: key.id,
			organizationId: key.organizationId,
			userId: ctx.user.id,
			scopes: key.scopes,
		});
		return;
	}

	// Personal API key - user must own it or be admin
	assertUserOwnershipOrAdmin(ctx, key.userId ?? null);
	logger.info('Personal API key management authorized', {
		apikeyId: key.id,
		ownerUserId: key.userId,
		requestingUserId: ctx.user.id,
		scopes: key.scopes,
	});
}

async function fetchKeyOrThrow(ctx: Context, id: string) {
	const existing = await ctx.db.query.apikey.findFirst({
		where: eq(apikey.id, id),
	});
	if (!existing) {
		throw new TRPCError({ code: 'NOT_FOUND', message: 'API key not found' });
	}
	return existing;
}

export const apikeysRouter = createTRPCRouter({
	list: protectedProcedure
		.input(z.object({ organizationId: z.string().optional() }).default({}))
		.query(async ({ ctx, input }) => {
			try {
				const rows = await ctx.db
					.select()
					.from(apikey)
					.where(
						input.organizationId
							? eq(apikey.organizationId, input.organizationId)
							: and(
									eq(apikey.userId, ctx.user.id),
									isNull(apikey.organizationId)
								)
					)
					.orderBy(desc(apikey.createdAt));

				return rows.map((row) => ({
					id: row.id,
					name: row.name,
					prefix: row.prefix,
					start: row.start,
					type: row.type,
					enabled: row.enabled,
					revokedAt: row.revokedAt,
					expiresAt: row.expiresAt,
					scopes: row.scopes,
					rateLimitEnabled: row.rateLimitEnabled,
					rateLimitTimeWindow: row.rateLimitTimeWindow,
					rateLimitMax: row.rateLimitMax,
					createdAt: row.createdAt,
					updatedAt: row.updatedAt,
					metadata: row.metadata,
				}));
			} catch (error: unknown) {
				logger.error('Failed to list API keys', {
					error: error instanceof Error ? error : new Error(String(error)),
					userId: ctx.user.id,
					organizationId: input.organizationId,
				});
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to list API keys',
				});
			}
		}),

	getById: protectedProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			try {
				const key = await ctx.db.query.apikey.findFirst({
					where: eq(apikey.id, input.id),
				});
				if (!key) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: 'API key not found',
					});
				}
				await assertCanManageKey(ctx, key);

				const access = await ctx.db
					.select()
					.from(apikeyAccess)
					.where(eq(apikeyAccess.apikeyId, input.id));

				return {
					id: key.id,
					name: key.name,
					prefix: key.prefix,
					start: key.start,
					type: key.type,
					enabled: key.enabled,
					revokedAt: key.revokedAt,
					expiresAt: key.expiresAt,
					scopes: key.scopes,
					rateLimitEnabled: key.rateLimitEnabled,
					rateLimitTimeWindow: key.rateLimitTimeWindow,
					rateLimitMax: key.rateLimitMax,
					createdAt: key.createdAt,
					updatedAt: key.updatedAt,
					metadata: key.metadata,
					access,
				};
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				logger.error('Failed to fetch API key', {
					error: error instanceof Error ? error.message : String(error),
					id: input.id,
					userId: ctx.user.id,
				});
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to fetch API key',
				});
			}
		}),

	create: protectedProcedure
		.input(createApiKeySchema)
		.mutation(async ({ ctx, input }) => {
			const nowIso = new Date();
			const { secret, prefix, start } = generateKeyMaterial();
			const keyHash = hashSecretScrypt(secret);

			try {
				const [created] = await ctx.db
					.insert(apikey)
					.values({
						id: nanoid(),
						name: input.name,
						prefix,
						start,
						key: secret,
						keyHash,
						userId: input.organizationId ? null : ctx.user.id,
						organizationId: input.organizationId ?? null,
						type: input.type ?? 'user',
						scopes: input.globalScopes,
						enabled: true,
						rateLimitEnabled: input.rateLimitEnabled ?? true,
						rateLimitTimeWindow: input.rateLimitTimeWindow,
						rateLimitMax: input.rateLimitMax,
						expiresAt: input.expiresAt ?? null,
						metadata: input.metadata ?? {},
						createdAt: nowIso,
						updatedAt: nowIso,
					})
					.returning();

				if (input.access.length > 0) {
					const accessRows: InferInsertModel<typeof apikeyAccess>[] =
						input.access.map((a) => ({
							id: nanoid(),
							apikeyId: created.id,
							resourceType: a.resourceType,
							resourceId: a.resourceId ?? null,
							scopes: a.scopes,
							createdAt: nowIso,
							updatedAt: nowIso,
						}));
					await ctx.db.insert(apikeyAccess).values(accessRows);
				}

				logger.info('API key created', {
					apikeyId: created.id,
					userId: ctx.user.id,
					organizationId: input.organizationId,
				});

				return {
					id: created.id,
					secret,
					prefix: created.prefix,
					start: created.start,
				};
			} catch (error) {
				logger.error('Failed to create API key', {
					error: error instanceof Error ? error.message : String(error),
					userId: ctx.user.id,
					organizationId: input.organizationId,
				});
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to create API key',
				});
			}
		}),

	update: protectedProcedure
		.input(updateApiKeySchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const key = await ctx.db.query.apikey.findFirst({
					where: eq(apikey.id, input.id),
				});
				if (!key) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: 'API key not found',
					});
				}
				await assertCanManageKey(ctx, key);
				const [updated] = await ctx.db
					.update(apikey)
					.set({
						name: input.name ?? key.name,
						enabled: input.enabled ?? key.enabled,
						rateLimitEnabled: input.rateLimitEnabled ?? key.rateLimitEnabled,
						rateLimitTimeWindow:
							input.rateLimitTimeWindow ?? key.rateLimitTimeWindow,
						rateLimitMax: input.rateLimitMax ?? key.rateLimitMax,
						expiresAt:
							input.expiresAt === undefined
								? key.expiresAt
								: (input.expiresAt as string | null),
						metadata: input.metadata ?? key.metadata,
						updatedAt: new Date(),
					})
					.where(eq(apikey.id, input.id))
					.returning();

				return updated;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				logger.error('Failed to update API key', {
					error: error instanceof Error ? error.message : String(error),
					id: input.id,
					userId: ctx.user.id,
				});
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to update API key',
				});
			}
		}),

	revoke: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			try {
				const key = await ctx.db.query.apikey.findFirst({
					where: eq(apikey.id, input.id),
				});
				if (!key) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: 'API key not found',
					});
				}
				await assertCanManageKey(ctx, key);
				await ctx.db
					.update(apikey)
					.set({
						enabled: false,
						revokedAt: new Date(),
						updatedAt: new Date(),
					})
					.where(eq(apikey.id, input.id));
				return { success: true };
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				logger.error('Failed to revoke API key', {
					error: error instanceof Error ? error.message : String(error),
					id: input.id,
					userId: ctx.user.id,
				});
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to revoke API key',
				});
			}
		}),

	rotate: protectedProcedure
		.input(rotateApiKeySchema)
		.mutation(async ({ ctx, input }) => {
			const { secret, prefix, start } = generateKeyMaterial();
			const keyHash = hashSecretScrypt(secret);
			try {
				const key = await ctx.db.query.apikey.findFirst({
					where: eq(apikey.id, input.id),
				});
				if (!key) {
					throw new TRPCError({
						code: 'NOT_FOUND',
						message: 'API key not found',
					});
				}
				await assertCanManageKey(ctx, key);
				const [updated] = await ctx.db
					.update(apikey)
					.set({
						prefix,
						start,
						key: secret,
						keyHash,
						updatedAt: new Date(),
					})
					.where(eq(apikey.id, input.id))
					.returning();

				logger.info('API key rotated', {
					apikeyId: updated.id,
					userId: ctx.user.id,
				});
				return {
					id: updated.id,
					secret,
					prefix: updated.prefix,
					start: updated.start,
				};
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				logger.error('Failed to rotate API key', {
					error: error instanceof Error ? error.message : String(error),
					id: input.id,
					userId: ctx.user.id,
				});
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to rotate API key',
				});
			}
		}),

	setAccessList: protectedProcedure
		.input(setAccessListSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const key = await fetchKeyOrThrow(ctx, input.apikeyId);
				await assertCanManageKey(ctx, key);

				await ctx.db.transaction(async (tx) => {
					await tx
						.delete(apikeyAccess)
						.where(eq(apikeyAccess.apikeyId, input.apikeyId));
					if (input.access.length > 0) {
						const now = new Date();
						const rows: InferInsertModel<typeof apikeyAccess>[] =
							input.access.map((a) => ({
								id: nanoid(),
								apikeyId: input.apikeyId,
								resourceType: a.resourceType,
								resourceId: a.resourceId ?? null,
								scopes: a.scopes,
								createdAt: now,
								updatedAt: now,
							}));
						await tx.insert(apikeyAccess).values(rows);
					}
				});
				return { success: true };
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				logger.error('Failed to set access list', {
					error: error instanceof Error ? error.message : String(error),
					apikeyId: input.apikeyId,
				});
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to set access list',
				});
			}
		}),

	addOrUpdateAccess: protectedProcedure
		.input(addOrUpdateAccessSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const key = await fetchKeyOrThrow(ctx, input.apikeyId);
				await assertCanManageKey(ctx, key);
				const now = new Date();
				const [row] = await ctx.db
					.insert(apikeyAccess)
					.values({
						id: nanoid(),
						apikeyId: input.apikeyId,
						resourceType: input.resourceType,
						resourceId: input.resourceId ?? null,
						scopes: input.scopes,
						createdAt: now,
						updatedAt: now,
					})
					.onConflictDoUpdate({
						target: [
							apikeyAccess.apikeyId,
							apikeyAccess.resourceType,
							apikeyAccess.resourceId,
						],
						set: { scopes: input.scopes, updatedAt: now },
					})
					.returning();
				return row;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				logger.error('Failed to upsert access entry', {
					error: error instanceof Error ? error.message : String(error),
					apikeyId: input.apikeyId,
					resourceType: input.resourceType,
					resourceId: input.resourceId ?? null,
				});
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to upsert access entry',
				});
			}
		}),

	removeAccess: protectedProcedure
		.input(removeAccessSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				const key = await fetchKeyOrThrow(ctx, input.apikeyId);
				await assertCanManageKey(ctx, key);
				await ctx.db
					.delete(apikeyAccess)
					.where(
						and(
							eq(apikeyAccess.apikeyId, input.apikeyId),
							eq(apikeyAccess.resourceType, input.resourceType),
							input.resourceId
								? eq(apikeyAccess.resourceId, input.resourceId)
								: sql`1=1`
						)
					);
				return { success: true };
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				logger.error('Failed to remove access entry', {
					error: error instanceof Error ? error.message : String(error),
					apikeyId: input.apikeyId,
					resourceType: input.resourceType,
					resourceId: input.resourceId ?? null,
				});
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to remove access entry',
				});
			}
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			try {
				const key = await fetchKeyOrThrow(ctx, input.id);
				await assertCanManageKey(ctx, key);
				await ctx.db.delete(apikey).where(eq(apikey.id, input.id));
				return { success: true };
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				logger.error('Failed to delete API key', {
					error: error instanceof Error ? error.message : String(error),
					id: input.id,
				});
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to delete API key',
				});
			}
		}),

	resolveAccess: protectedProcedure
		.input(resolveAccessSchema)
		.query(async ({ ctx, input }) => {
			try {
				const key = await fetchKeyOrThrow(ctx, input.apikeyId);
				if (!key.enabled || key.revokedAt != null) {
					return { enabled: false, scopes: [] as ApiScope[] };
				}
				await assertCanManageKey(ctx, key);

				const entries = await ctx.db
					.select()
					.from(apikeyAccess)
					.where(eq(apikeyAccess.apikeyId, input.apikeyId));

				const effectiveScopes = new Set<ApiScope>();
				for (const s of key.scopes) {
					effectiveScopes.add(s as ApiScope);
				}
				for (const entry of entries) {
					if (
						entry.resourceType === 'global' ||
						(entry.resourceType === input.resourceType &&
							(input.resourceId ?? null) === (entry.resourceId ?? null))
					) {
						for (const s of entry.scopes) {
							effectiveScopes.add(s as ApiScope);
						}
					}
				}
				return { enabled: true, scopes: Array.from(effectiveScopes) };
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				logger.error('Failed to resolve access', {
					error: error instanceof Error ? error.message : String(error),
					apikeyId: input.apikeyId,
					resourceType: input.resourceType,
					resourceId: input.resourceId ?? null,
				});
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: 'Failed to resolve access',
				});
			}
		}),
});
