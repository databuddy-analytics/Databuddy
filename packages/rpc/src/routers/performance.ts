import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
	activateOnlineAdvisor,
	applyIndexRecommendation,
	applyStatisticsRecommendation,
	checkOnlineAdvisorEnabled,
	checkPgStatStatementsEnabled,
	getCurrentUserInfo,
	getExecutorStats,
	getOnlineAdvisorIndexes,
	getOnlineAdvisorStatistics,
	getPerformanceMetrics,
	getPerformanceStatements,
	resetPerformanceStats,
} from '../database';
import { createTRPCRouter, protectedProcedure } from '../trpc';
import { authorizeDbConnectionAccess } from '../utils/auth';
import { decryptConnectionUrl } from '../utils/encryption';

const performanceFiltersSchema = z.object({
	limit: z.number().min(1).max(1000).optional(),
	min_calls: z.number().min(0).optional(),
	min_exec_time: z.number().min(0).optional(),
	order_by: z
		.enum(['total_exec_time', 'calls', 'mean_exec_time', 'rows'])
		.optional(),
	order_direction: z.enum(['asc', 'desc']).optional(),
});

export const performanceRouter = createTRPCRouter({
	getStatements: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				filters: performanceFiltersSchema.optional(),
			})
		)
		.query(async ({ ctx, input }) => {
			// Performance monitoring only requires read access
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'read'
			);

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);

				// Check if pg_stat_statements is enabled
				const isEnabled = await checkPgStatStatementsEnabled(decryptedUrl);
				if (!isEnabled) {
					throw new TRPCError({
						code: 'PRECONDITION_FAILED',
						message:
							'pg_stat_statements extension is not installed or configured. Please install and configure the extension first.',
					});
				}

				const statements = await getPerformanceStatements(
					decryptedUrl,
					input.filters
				);
				return statements;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to get performance statements: ${error instanceof Error ? error.message : 'Unknown error'}`,
				});
			}
		}),

	getMetrics: protectedProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			// Performance monitoring only requires read access
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'read'
			);

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);

				// Check if pg_stat_statements is enabled
				const isEnabled = await checkPgStatStatementsEnabled(decryptedUrl);
				if (!isEnabled) {
					throw new TRPCError({
						code: 'PRECONDITION_FAILED',
						message:
							'pg_stat_statements extension is not installed or configured. Please install and configure the extension first.',
					});
				}

				const metrics = await getPerformanceMetrics(decryptedUrl);
				return metrics;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to get performance metrics: ${error instanceof Error ? error.message : 'Unknown error'}`,
				});
			}
		}),

	resetStats: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'update'
			);

			// Only admin connections can reset stats
			if (connection.permissionLevel !== 'admin') {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message:
						'Resetting performance statistics requires admin database access.',
				});
			}

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);

				// Check if pg_stat_statements is enabled
				const isEnabled = await checkPgStatStatementsEnabled(decryptedUrl);
				if (!isEnabled) {
					throw new TRPCError({
						code: 'PRECONDITION_FAILED',
						message:
							'pg_stat_statements extension is not installed or configured. Please install and configure the extension first.',
					});
				}

				await resetPerformanceStats(decryptedUrl);
				return { success: true };
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to reset performance statistics: ${error instanceof Error ? error.message : 'Unknown error'}`,
				});
			}
		}),

	checkExtensionStatus: protectedProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			// Checking extension status only requires read access
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'read'
			);

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);
				const isEnabled = await checkPgStatStatementsEnabled(decryptedUrl);
				return { enabled: isEnabled };
			} catch (error) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to check pg_stat_statements status: ${error instanceof Error ? error.message : 'Unknown error'}`,
				});
			}
		}),

	getUserInfo: protectedProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			// Debug endpoint to check current user and permissions
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'read'
			);

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);
				const userInfo = await getCurrentUserInfo(decryptedUrl);
				return userInfo;
			} catch (error) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to get user info: ${error instanceof Error ? error.message : 'Unknown error'}`,
				});
			}
		}),

	// Online Advisor Extension Endpoints
	checkOnlineAdvisorStatus: protectedProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'read'
			);

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);
				const isEnabled = await checkOnlineAdvisorEnabled(decryptedUrl);
				return { enabled: isEnabled };
			} catch (error) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to check online_advisor status: ${error instanceof Error ? error.message : 'Unknown error'}`,
				});
			}
		}),

	activateOnlineAdvisor: protectedProcedure
		.input(z.object({ id: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'read'
			);

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);

				// Check if online_advisor is enabled
				const isEnabled = await checkOnlineAdvisorEnabled(decryptedUrl);
				if (!isEnabled) {
					throw new TRPCError({
						code: 'PRECONDITION_FAILED',
						message:
							'online_advisor extension is not installed or configured. Please install the extension first.',
					});
				}

				const result = await activateOnlineAdvisor(decryptedUrl);
				return result;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to activate online_advisor: ${error instanceof Error ? error.message : 'Unknown error'}`,
				});
			}
		}),

	getIndexRecommendations: protectedProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'read'
			);

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);

				// Check if online_advisor is enabled
				const isEnabled = await checkOnlineAdvisorEnabled(decryptedUrl);
				if (!isEnabled) {
					throw new TRPCError({
						code: 'PRECONDITION_FAILED',
						message:
							'online_advisor extension is not installed or configured. Please install the extension first.',
					});
				}

				const recommendations = await getOnlineAdvisorIndexes(decryptedUrl);
				return recommendations;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to get index recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`,
				});
			}
		}),

	getStatisticsRecommendations: protectedProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ ctx, input }) => {
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'read'
			);

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);

				// Check if online_advisor is enabled
				const isEnabled = await checkOnlineAdvisorEnabled(decryptedUrl);
				if (!isEnabled) {
					throw new TRPCError({
						code: 'PRECONDITION_FAILED',
						message:
							'online_advisor extension is not installed or configured. Please install the extension first.',
					});
				}

				const recommendations = await getOnlineAdvisorStatistics(decryptedUrl);
				return recommendations;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to get statistics recommendations: ${error instanceof Error ? error.message : 'Unknown error'}`,
				});
			}
		}),

	getExecutorStats: protectedProcedure
		.input(z.object({ id: z.string(), reset: z.boolean().optional() }))
		.query(async ({ ctx, input }) => {
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'read'
			);

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);

				// Check if online_advisor is enabled
				const isEnabled = await checkOnlineAdvisorEnabled(decryptedUrl);
				if (!isEnabled) {
					throw new TRPCError({
						code: 'PRECONDITION_FAILED',
						message:
							'online_advisor extension is not installed or configured. Please install the extension first.',
					});
				}

				const stats = await getExecutorStats(
					decryptedUrl,
					input.reset ?? false
				);
				return stats;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to get executor stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
				});
			}
		}),

	applyIndexRecommendation: protectedProcedure
		.input(z.object({ id: z.string(), sql: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'update'
			);

			// Only admin connections can apply recommendations
			if (connection.permissionLevel !== 'admin') {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message:
						'Applying index recommendations requires admin database access.',
				});
			}

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);

				// Check if online_advisor is enabled
				const isEnabled = await checkOnlineAdvisorEnabled(decryptedUrl);
				if (!isEnabled) {
					throw new TRPCError({
						code: 'PRECONDITION_FAILED',
						message:
							'online_advisor extension is not installed or configured. Please install the extension first.',
					});
				}

				const result = await applyIndexRecommendation(decryptedUrl, input.sql);
				return result;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to apply index recommendation: ${error instanceof Error ? error.message : 'Unknown error'}`,
				});
			}
		}),

	applyStatisticsRecommendation: protectedProcedure
		.input(z.object({ id: z.string(), sql: z.string() }))
		.mutation(async ({ ctx, input }) => {
			const connection = await authorizeDbConnectionAccess(
				ctx,
				input.id,
				'update'
			);

			// Only admin connections can apply recommendations
			if (connection.permissionLevel !== 'admin') {
				throw new TRPCError({
					code: 'FORBIDDEN',
					message:
						'Applying statistics recommendations requires admin database access.',
				});
			}

			try {
				const decryptedUrl = decryptConnectionUrl(connection.url);

				// Check if online_advisor is enabled
				const isEnabled = await checkOnlineAdvisorEnabled(decryptedUrl);
				if (!isEnabled) {
					throw new TRPCError({
						code: 'PRECONDITION_FAILED',
						message:
							'online_advisor extension is not installed or configured. Please install the extension first.',
					});
				}

				const result = await applyStatisticsRecommendation(
					decryptedUrl,
					input.sql
				);
				return result;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to apply statistics recommendation: ${error instanceof Error ? error.message : 'Unknown error'}`,
				});
			}
		}),
});
