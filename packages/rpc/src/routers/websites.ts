import { websitesApi } from '@databuddy/auth';
import { and, chQuery, eq, isNull, websites } from '@databuddy/db';
import { createDrizzleCache, redis } from '@databuddy/redis';
import { logger } from '@databuddy/shared';
import {
	createWebsiteSchema,
	transferWebsiteSchema,
	updateWebsiteSchema,
} from '@databuddy/validation';
import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../trpc';
import { authorizeWebsiteAccess } from '../utils/auth';
import {
	checkAndTrackWebsiteCreation,
	getBillingCustomerId,
	trackWebsiteUsage,
} from '../utils/billing';

const drizzleCache = createDrizzleCache({ redis, namespace: 'websites' });

const CACHE_TTL = 60;

const buildDomain = (domain: string, subdomain?: string) =>
	subdomain ? `${subdomain}.${domain}` : domain;

export const websitesRouter = createTRPCRouter({
	list: protectedProcedure
		.input(z.object({ organizationId: z.string().optional() }).default({}))
		.query(({ ctx, input }) => {
			const cacheKey = `list:${ctx.user.id}:${input.organizationId || ''}`;
			return drizzleCache.withCache({
				key: cacheKey,
				ttl: CACHE_TTL,
				tables: ['websites'],
				queryFn: () => {
					const where = input.organizationId
						? eq(websites.organizationId, input.organizationId)
						: and(
								eq(websites.userId, ctx.user.id),
								isNull(websites.organizationId)
							);
					return ctx.db.query.websites.findMany({
						where,
						orderBy: (table, { desc }) => [desc(table.createdAt)],
					});
				},
			});
		}),

	getById: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(({ ctx, input }) => {
			const cacheKey = `getById:${input.id}`;
			return drizzleCache.withCache({
				key: cacheKey,
				ttl: CACHE_TTL,
				tables: ['websites'],
				queryFn: () => authorizeWebsiteAccess(ctx, input.id, 'read'),
			});
		}),

	create: protectedProcedure
		.input(createWebsiteSchema)
		.mutation(async ({ ctx, input }) => {
			if (input.organizationId) {
				const { success } = await websitesApi.hasPermission({
					headers: ctx.headers,
					body: { permissions: { website: ['create'] } },
				});
				if (!success) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: 'Missing organization permissions.',
					});
				}
			}

			const customerId = await getBillingCustomerId(
				ctx.user.id,
				input.organizationId
			);
			const limitCheck = await checkAndTrackWebsiteCreation(customerId);
			if (!limitCheck.allowed) {
				throw new TRPCError({ code: 'BAD_REQUEST', message: limitCheck.error });
			}

			const fullDomain = buildDomain(input.domain, input.subdomain);

			const existingWebsite = await ctx.db.query.websites.findFirst({
				where: and(
					eq(websites.domain, fullDomain),
					input.organizationId
						? eq(websites.organizationId, input.organizationId)
						: and(
								eq(websites.userId, ctx.user.id),
								isNull(websites.organizationId)
							)
				),
			});

			if (existingWebsite) {
				const location = input.organizationId
					? 'in this organization'
					: 'for your account';
				throw new TRPCError({
					code: 'CONFLICT',
					message: `A website with the domain "${fullDomain}" already exists ${location}.`,
				});
			}

			const [website] = await ctx.db
				.insert(websites)
				.values({
					id: nanoid(),
					name: input.name,
					domain: fullDomain,
					userId: ctx.user.id,
					organizationId: input.organizationId,
					status: 'ACTIVE',
				})
				.returning();

			logger.success(
				'Website Created',
				`New website "${website.name}" was created with domain "${website.domain}"`,
				{
					websiteId: website.id,
					domain: website.domain,
					userId: ctx.user.id,
					organizationId: website.organizationId,
				}
			);

			await drizzleCache.invalidateByTables(['websites']);

			return website;
		}),

	update: protectedProcedure
		.input(updateWebsiteSchema)
		.mutation(async ({ ctx, input }) => {
			const originalWebsite = await authorizeWebsiteAccess(
				ctx,
				input.id,
				'update'
			);

			const [updatedWebsite] = await ctx.db
				.update(websites)
				.set({ name: input.name })
				.where(eq(websites.id, input.id))
				.returning();

			logger.info(
				'Website Updated',
				`Website "${originalWebsite.name}" was renamed to "${updatedWebsite.name}"`,
				{
					websiteId: updatedWebsite.id,
					oldName: originalWebsite.name,
					newName: updatedWebsite.name,
					userId: ctx.user.id,
				}
			);

			await Promise.all([
				drizzleCache.invalidateByTables(['websites']),
				drizzleCache.invalidateByKey(`getById:${input.id}`),
			]);

			return updatedWebsite;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const website = await authorizeWebsiteAccess(ctx, input.id, 'delete');
			const customerId = await getBillingCustomerId(
				ctx.user.id,
				website.organizationId
			);

			await Promise.all([
				ctx.db.delete(websites).where(eq(websites.id, input.id)),
				trackWebsiteUsage(customerId, -1),
			]);

			logger.warning(
				'Website Deleted',
				`Website "${website.name}" with domain "${website.domain}" was deleted`,
				{
					websiteId: website.id,
					websiteName: website.name,
					domain: website.domain,
					userId: ctx.user.id,
				}
			);

			await Promise.all([
				drizzleCache.invalidateByTables(['websites']),
				drizzleCache.invalidateByKey(`getById:${input.id}`),
			]);

			return { success: true };
		}),

	transfer: protectedProcedure
		.input(transferWebsiteSchema)
		.mutation(async ({ ctx, input }) => {
			await authorizeWebsiteAccess(ctx, input.websiteId, 'update');

			if (input.organizationId) {
				const { success } = await websitesApi.hasPermission({
					headers: ctx.headers,
					body: { permissions: { website: ['create'] } },
				});
				if (!success) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: 'Missing organization permissions.',
					});
				}
			}

			const [updatedWebsite] = await ctx.db
				.update(websites)
				.set({ organizationId: input.organizationId ?? null })
				.where(eq(websites.id, input.websiteId))
				.returning();

			if (!updatedWebsite) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Website not found',
				});
			}

			logger.success(
				'Website Transferred',
				`Website "${updatedWebsite.name}" was transferred to organization "${input.organizationId}"`,
				{
					websiteId: updatedWebsite.id,
					organizationId: input.organizationId,
					userId: ctx.user.id,
				}
			);

			await Promise.all([
				drizzleCache.invalidateByTables(['websites']),
				drizzleCache.invalidateByKey(`getById:${input.websiteId}`),
			]);

			return updatedWebsite;
		}),

	isTrackingSetup: publicProcedure
		.input(z.object({ websiteId: z.string() }))
		.query(async ({ ctx, input }) => {
			await authorizeWebsiteAccess(ctx, input.websiteId, 'read');
			const result = await chQuery<{ count: number }>(
				`SELECT COUNT(*) as count FROM analytics.events WHERE client_id = {websiteId:String} AND event_name = 'screen_view' LIMIT 1`,
				{ websiteId: input.websiteId }
			);
			return { tracking_setup: (result[0]?.count ?? 0) > 0 };
		}),
});
