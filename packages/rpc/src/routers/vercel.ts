import { account } from '@databuddy/db';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { VercelSDK } from '../lib/vercel-sdk';
import { createTRPCRouter, protectedProcedure } from '../trpc';

const getVercelToken = async (userId: string, db: any): Promise<string> => {
	try {
		const vercelAccount = await db.query.account.findFirst({
			where: and(eq(account.providerId, 'vercel'), eq(account.userId, userId)),
		});

		if (!vercelAccount) {
			throw new TRPCError({
				code: 'UNAUTHORIZED',
				message:
					'No Vercel account found. Please connect your Vercel account first.',
			});
		}

		if (!vercelAccount.accessToken) {
			throw new TRPCError({
				code: 'UNAUTHORIZED',
				message:
					'Vercel access token is missing. Please reconnect your Vercel account.',
			});
		}

		return vercelAccount.accessToken;
	} catch (error) {
		if (error instanceof TRPCError) {
			throw error;
		}

		console.error('Database error when fetching Vercel token:', error);
		throw new TRPCError({
			code: 'INTERNAL_SERVER_ERROR',
			message: 'Failed to retrieve Vercel account information',
		});
	}
};

const getProjectsSchema = z.object({
	limit: z.string().optional(),
	since: z.number().optional(),
	until: z.number().optional(),
});

const getProjectEnvsSchema = z.object({
	projectId: z.string(),
});

const createProjectEnvSchema = z.object({
	projectId: z.string(),
	key: z.string(),
	value: z.string(),
	type: z
		.enum(['system', 'secret', 'encrypted', 'plain', 'sensitive'])
		.default('plain'),
	target: z.array(z.enum(['production', 'preview', 'development'])).optional(),
	gitBranch: z.string().nullable().optional(),
	comment: z.string().optional(),
	customEnvironmentIds: z.array(z.string()).optional(),
	upsert: z.boolean().optional(),
	teamId: z.string().optional(),
	slug: z.string().optional(),
});

const createProjectEnvBatchSchema = z.object({
	projectId: z.string(),
	envVars: z.array(
		z.object({
			key: z.string(),
			value: z.string(),
			type: z
				.enum(['system', 'secret', 'encrypted', 'plain', 'sensitive'])
				.default('plain'),
			target: z
				.array(z.enum(['production', 'preview', 'development']))
				.optional(),
			gitBranch: z.string().nullable().optional(),
			comment: z.string().optional(),
			customEnvironmentIds: z.array(z.string()).optional(),
		})
	),
	upsert: z.boolean().optional(),
	teamId: z.string().optional(),
	slug: z.string().optional(),
});

const getProjectDomainsSchema = z.object({
	projectId: z.string(),
	production: z.string().optional(),
	target: z.string().optional(),
	customEnvironmentId: z.string().optional(),
	gitBranch: z.string().optional(),
	redirects: z.string().optional(),
	redirect: z.string().optional(),
	verified: z.string().optional(),
	limit: z.number().optional(),
	since: z.number().optional(),
	until: z.number().optional(),
	order: z.string().optional(),
});

export const vercelRouter = createTRPCRouter({
	// Debug route to check user accounts
	debugAccounts: protectedProcedure.query(async ({ ctx }) => {
		try {
			const userAccounts = await ctx.db.query.account.findMany({
				where: eq(account.userId, ctx.user.id),
				columns: {
					id: true,
					providerId: true,
					accountId: true,
					createdAt: true,
					accessToken: false, // Don't return the actual token for security
				},
			});

			return {
				userId: ctx.user.id,
				accounts: userAccounts,
				hasVercelAccount: userAccounts.some(
					(acc) => acc.providerId === 'vercel'
				),
			};
		} catch (error) {
			console.error('Debug accounts error:', error);
			throw new TRPCError({
				code: 'INTERNAL_SERVER_ERROR',
				message: 'Failed to fetch account information',
			});
		}
	}),

	// Simple token validation without API calls
	validateToken: protectedProcedure.query(
		async ({ ctx }): Promise<{ valid: boolean; hasToken: boolean }> => {
			try {
				const token = await getVercelToken(ctx.user.id, ctx.db);
				return { valid: true, hasToken: !!token };
			} catch (error) {
				if (error instanceof TRPCError && error.code === 'UNAUTHORIZED') {
					return { valid: false, hasToken: false };
				}
				throw error;
			}
		}
	),

	testConnection: protectedProcedure.query(
		async ({ ctx }): Promise<{ success: boolean }> => {
			const token = await getVercelToken(ctx.user.id, ctx.db);
			const vercel = new VercelSDK(token);

			try {
				await vercel.getUser();
				return { success: true };
			} catch (userError) {
				// Fallback to projects endpoint
				await vercel.getProjects({ limit: '1' });
				return { success: true };
			}
		}
	),

	getProjects: protectedProcedure
		.input(getProjectsSchema.default({}))
		.query(async ({ ctx, input }) => {
			const token = await getVercelToken(ctx.user.id, ctx.db);
			const vercel = new VercelSDK(token);

			return await vercel.getProjects({
				...(input.limit && { limit: input.limit }),
				...(input.since && { since: input.since }),
				...(input.until && { until: input.until }),
			});
		}),

	getProjectEnvs: protectedProcedure
		.input(getProjectEnvsSchema)
		.query(async ({ ctx, input }) => {
			const token = await getVercelToken(ctx.user.id, ctx.db);
			const vercel = new VercelSDK(token);

			return await vercel.getProjectEnvs(input.projectId);
		}),

	createProjectEnv: protectedProcedure
		.input(createProjectEnvSchema)
		.mutation(async ({ ctx, input }) => {
			const token = await getVercelToken(ctx.user.id, ctx.db);
			const vercel = new VercelSDK(token);

			const { projectId, upsert, teamId, slug, ...rest } = input;

			const envVar = {
				key: rest.key,
				value: rest.value,
				type: rest.type,
				...(rest.target && { target: rest.target }),
				...(rest.gitBranch !== undefined && { gitBranch: rest.gitBranch }),
				...(rest.comment && { comment: rest.comment }),
				...(rest.customEnvironmentIds && {
					customEnvironmentIds: rest.customEnvironmentIds,
				}),
			};

			return await vercel.createProjectEnv(projectId, envVar, {
				...(upsert !== undefined && { upsert }),
				...(teamId && { teamId }),
				...(slug && { slug }),
			});
		}),

	createProjectEnvBatch: protectedProcedure
		.input(createProjectEnvBatchSchema)
		.mutation(async ({ ctx, input }) => {
			const token = await getVercelToken(ctx.user.id, ctx.db);
			const vercel = new VercelSDK(token);

			const { projectId, envVars, upsert, teamId, slug } = input;

			const processedEnvVars = envVars.map((envVar) => ({
				key: envVar.key,
				value: envVar.value,
				type: envVar.type,
				...(envVar.target && { target: envVar.target }),
				...(envVar.gitBranch !== undefined && { gitBranch: envVar.gitBranch }),
				...(envVar.comment && { comment: envVar.comment }),
				...(envVar.customEnvironmentIds && {
					customEnvironmentIds: envVar.customEnvironmentIds,
				}),
			}));

			return await vercel.createProjectEnvBatch(projectId, processedEnvVars, {
				...(upsert !== undefined && { upsert }),
				...(teamId && { teamId }),
				...(slug && { slug }),
			});
		}),

	getProjectDomains: protectedProcedure
		.input(getProjectDomainsSchema)
		.query(async ({ ctx, input }) => {
			const token = await getVercelToken(ctx.user.id, ctx.db);
			const vercel = new VercelSDK(token);

			const { projectId, ...params } = input;
			return await vercel.getProjectDomains(projectId, params);
		}),
});
