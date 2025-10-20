import { websitesApi } from '@databuddy/auth';
import { and, dbConnections, eq, isNull } from '@databuddy/db';
import { TRPCError } from '@trpc/server';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import {
	checkExtensionSafety,
	getAvailableExtensions,
	getDatabaseStats,
	getExtensions,
	getTableStats,
	resetExtensionStats,
	safeDropExtension,
	safeInstallExtension,
	testConnection,
	updateExtension,
} from '../database';
import { createTRPCRouter, protectedProcedure } from '../trpc';
import { authorizeDbConnectionAccess } from '../utils/auth';
import {
	decryptConnectionUrl,
	encryptConnectionUrl,
} from '../utils/encryption';

const createDbConnectionSchema = z.object({
	name: z.string().min(1, 'Name is required'),
	type: z.string().default('postgres'),
	url: z.string().url('Must be a valid connection URL'),
	organizationId: z.string().optional(),
});

const updateDbConnectionSchema = z.object({
	id: z.string(),
	name: z.string().min(1, 'Name is required').optional(),
});

const buildDbConnectionFilter = (userId: string, organizationId?: string) =>
	organizationId
		? eq(dbConnections.organizationId, organizationId)
		: and(
				eq(dbConnections.userId, userId),
				isNull(dbConnections.organizationId)
			);

export const dbConnectionsRouter = createTRPCRouter({
	list: protectedProcedure
		.input(z.object({ organizationId: z.string().optional() }).default({}))
		.query(async ({ ctx, input }) => {
			if (input.organizationId) {
				const { success } = await websitesApi.hasPermission({
					headers: ctx.headers,
					body: { permissions: { website: ['read'] } },
				});
				if (!success) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: 'Missing organization permissions.',
					});
				}
			}

			const whereClause = buildDbConnectionFilter(
				ctx.user.id,
				input.organizationId
			);

			const connections = await ctx.db.query.dbConnections.findMany({
				where: whereClause,
				columns: {
					id: true,
					name: true,
					type: true,
					userId: true,
					organizationId: true,
					createdAt: true,
					updatedAt: true,
				},
				orderBy: (table, { desc }) => [desc(table.createdAt)],
			});

			return connections;
		}),

	getById: protectedProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			const connection = await ctx.db.query.dbConnections.findFirst({
				where: eq(dbConnections.id, input.id),
				columns: {
					id: true,
					name: true,
					type: true,
					userId: true,
					organizationId: true,
					createdAt: true,
					updatedAt: true,
				},
			});

			if (!connection) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Connection not found',
				});
			}

			// Check access permissions
			if (connection.organizationId) {
				const { success } = await websitesApi.hasPermission({
					headers: ctx.headers,
					body: { permissions: { website: ['read'] } },
				});
				if (!success) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: 'Missing organization permissions.',
					});
				}
			} else if (connection.userId !== ctx.user.id) {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message: 'Access denied',
				});
			}

			return connection;
		}),

	create: protectedProcedure
		.input(createDbConnectionSchema)
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

			// Test connection
			await testConnection(input.url);

			const [connection] = await ctx.db
				.insert(dbConnections)
				.values({
					id: nanoid(),
					userId: ctx.user.id,
					name: input.name,
					type: input.type,
					url: encryptConnectionUrl(input.url),
					organizationId: input.organizationId,
					createdAt: new Date(),
					updatedAt: new Date(),
				})
				.returning({
					id: dbConnections.id,
					name: dbConnections.name,
					type: dbConnections.type,
					userId: dbConnections.userId,
					organizationId: dbConnections.organizationId,
					createdAt: dbConnections.createdAt,
					updatedAt: dbConnections.updatedAt,
				});

			return connection;
		}),

	update: protectedProcedure
		.input(updateDbConnectionSchema)
		.mutation(async ({ ctx, input }) => {
			await authorizeDbConnectionAccess(ctx, input.id, 'update');

			const [connection] = await ctx.db
				.update(dbConnections)
				.set({
					name: input.name,
					updatedAt: new Date(),
				})
				.where(eq(dbConnections.id, input.id))
				.returning({
					id: dbConnections.id,
					name: dbConnections.name,
					type: dbConnections.type,
					userId: dbConnections.userId,
					organizationId: dbConnections.organizationId,
					createdAt: dbConnections.createdAt,
					updatedAt: dbConnections.updatedAt,
				});

			if (!connection) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Connection not found',
				});
			}

			return connection;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			await authorizeDbConnectionAccess(ctx, input.id, 'delete');

			// Delete from our database
			const [connection] = await ctx.db
				.delete(dbConnections)
				.where(eq(dbConnections.id, input.id))
				.returning({
					id: dbConnections.id,
					name: dbConnections.name,
				});

			if (!connection) {
				throw new TRPCError({
					code: 'NOT_FOUND',
					message: 'Connection not found',
				});
			}

			return { success: true };
		}),

	getDatabaseStats: protectedProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'read'
			);

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);
				const stats = await getDatabaseStats(decryptedUrl);
				return stats;
			} catch (error) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to get database stats: ${error.message}`,
				});
			}
		}),

	getTableStats: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				limit: z.number().optional(),
			})
		)
		.query(async ({ ctx, input }) => {
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'read'
			);

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);
				const stats = await getTableStats(decryptedUrl, input.limit);
				return stats;
			} catch (error) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to get table stats: ${error.message}`,
				});
			}
		}),

	getExtensions: protectedProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'read'
			);

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);
				const extensions = await getExtensions(decryptedUrl);
				return extensions;
			} catch (error) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to get extensions: ${error.message}`,
				});
			}
		}),

	getAvailableExtensions: protectedProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'read'
			);

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);
				const availableExtensions = await getAvailableExtensions(decryptedUrl);
				return availableExtensions;
			} catch (error) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to get available extensions: ${error.message}`,
				});
			}
		}),

	checkExtensionSafety: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				extensionName: z.string(),
			})
		)
		.query(async ({ ctx, input }) => {
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'read'
			);

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);
				const safetyCheck = await checkExtensionSafety(
					decryptedUrl,
					input.extensionName
				);
				return safetyCheck;
			} catch (error) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to check extension safety: ${error.message}`,
				});
			}
		}),

	updateExtension: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				extensionName: z.string(),
			})
		)
		.mutation(async ({ ctx, input }) => {
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'update'
			);

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);
				await updateExtension(decryptedUrl, input.extensionName);
				return { success: true };
			} catch (error) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to update extension: ${error.message}`,
				});
			}
		}),

	resetExtensionStats: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				extensionName: z.string(),
			})
		)
		.mutation(async ({ ctx, input }) => {
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'update'
			);

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);
				await resetExtensionStats(decryptedUrl, input.extensionName);
				return { success: true };
			} catch (error) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to reset extension stats: ${error.message}`,
				});
			}
		}),

	installExtension: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				extensionName: z.string(),
				schema: z.string().optional(),
				force: z.boolean().optional(),
			})
		)
		.mutation(async ({ ctx, input }) => {
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'update'
			);

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);
				const result = await safeInstallExtension(
					decryptedUrl,
					input.extensionName,
					input.schema,
					input.force
				);
				return result;
			} catch (error) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to install extension: ${error.message}`,
				});
			}
		}),

	dropExtension: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				extensionName: z.string(),
				cascade: z.boolean().optional(),
			})
		)
		.mutation(async ({ ctx, input }) => {
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'update'
			);

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);
				const result = await safeDropExtension(
					decryptedUrl,
					input.extensionName,
					input.cascade
				);
				return result;
			} catch (error) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to drop extension: ${error.message}`,
				});
			}
		}),
});
