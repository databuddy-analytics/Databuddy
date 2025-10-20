import { websitesApi } from '@databuddy/auth';
import { account, websites } from '@databuddy/db';
import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { VercelSDK } from '../lib/vercel-sdk';
import {
	buildWebsiteFilter,
	domainSchema,
	WebsiteService,
	websiteNameSchema,
} from '../services/website-service';
import { createTRPCRouter, protectedProcedure } from '../trpc';

const ENV_KEY = 'NEXT_PUBLIC_DATABUDDY_CLIENT_ID';
const WWW_REGEX = /^www\./;

const buildDomainIntegrationStatus = (
	domain: any,
	databeddyEnvVars: any[],
	websiteMap: Map<string, any>,
	domainMap: Map<string, any>
) => {
	const domainName = domain.name;

	const findMatchingWebsite = (targetDomain: string) => {
		if (domainMap.has(targetDomain)) {
			return domainMap.get(targetDomain);
		}

		const withoutWww = targetDomain.replace(WWW_REGEX, '');
		if (domainMap.has(withoutWww)) {
			return domainMap.get(withoutWww);
		}

		const withWww = `www.${targetDomain}`;
		if (domainMap.has(withWww)) {
			return domainMap.get(withWww);
		}

		return null;
	};
	const domainStatus = {
		domain: domainName,
		isIntegrated: false,
		websiteId: null as string | null,
		websiteName: null as string | null,
		environments: [] as string[],
		envVarId: null as string | null,
		status: 'not_integrated' as
			| 'integrated'
			| 'not_integrated'
			| 'orphaned'
			| 'invalid',
		issues: [] as string[],
	};

	const domainMatchedEnvVars = databeddyEnvVars.filter((envVar) => {
		const websiteForEnv = websiteMap.get(envVar.value);
		if (!websiteForEnv) {
			return false;
		}
		return (
			websiteForEnv.domain === domainName ||
			websiteForEnv.domain === domainName.replace(WWW_REGEX, '') ||
			websiteForEnv.domain === `www.${domainName}` ||
			domainName === `www.${websiteForEnv.domain}`
		);
	});

	const relevantEnvVars = domainMatchedEnvVars.length
		? domainMatchedEnvVars
		: databeddyEnvVars.filter((envVar) => {
				if (!envVar.target?.length) {
					return true;
				}

				const hasProductionTarget = envVar.target.includes('production');
				const hasPreviewTarget = envVar.target.includes('preview');

				return hasPreviewTarget || hasProductionTarget;
			});

	if (relevantEnvVars.length) {
		const envVar = relevantEnvVars[0];
		const websiteId = envVar.value;
		const website = websiteMap.get(websiteId);
		const domainWebsite = findMatchingWebsite(domainName);

		Object.assign(domainStatus, {
			websiteId,
			envVarId: envVar.id,
			environments: envVar.target || [],
		});

		if (website) {
			Object.assign(domainStatus, {
				isIntegrated: true,
				websiteName: website.name,
				status: 'integrated',
			});

			const integrations = website.integrations as any;
			const vercelIntegration = integrations?.vercel;

			if (vercelIntegration?.environments) {
				const storedEnvironments = Object.keys(vercelIntegration.environments);
				domainStatus.environments = [
					...new Set([...domainStatus.environments, ...storedEnvironments]),
				];
			}

			const websiteDomainMatches =
				website.domain === domainName ||
				website.domain === domainName.replace(WWW_REGEX, '') ||
				website.domain === `www.${domainName}` ||
				domainName === `www.${website.domain}`;

			if (!websiteDomainMatches) {
				domainStatus.issues.push(
					`Domain mismatch: integration points to "${website.domain}"`
				);
				domainStatus.status = 'invalid';
			}

			if (domainWebsite && domainWebsite.id !== websiteId) {
				domainStatus.issues.push(
					`Conflicting integrations: domain has website "${domainWebsite.name}" but integration points to "${website.name}"`
				);
				domainStatus.status = 'invalid';
			}

			const otherDomainsUsingThisWebsite = databeddyEnvVars.filter(
				(envVar) =>
					envVar.value === websiteId && envVar.id !== relevantEnvVars[0].id
			);

			if (
				otherDomainsUsingThisWebsite.length > 0 &&
				website.domain !== domainName
			) {
				domainStatus.issues.push(
					`Shared website: multiple domains are using the same website "${website.name}"`
				);
				if (domainStatus.status === 'integrated') {
					domainStatus.status = 'invalid';
				}
			}
		} else {
			domainStatus.status = 'orphaned';
			domainStatus.issues.push(
				'Integration points to a website that no longer exists'
			);
		}

		if (relevantEnvVars.length > 1) {
			domainStatus.issues.push(
				`Multiple integrations found (${relevantEnvVars.length} environment variables)`
			);
			domainStatus.status = 'invalid';
		}

		if (!envVar.target?.length) {
			domainStatus.issues.push(
				'Integration is missing deployment environments'
			);
			domainStatus.status = 'invalid';
		}
	} else {
		const domainWebsite = findMatchingWebsite(domainName);
		if (domainWebsite) {
			Object.assign(domainStatus, {
				websiteId: domainWebsite.id,
				websiteName: domainWebsite.name,
				isIntegrated: false,
				status: 'invalid',
			});
			domainStatus.issues.push(
				"Website exists, but isn't integrated with Vercel yet"
			);
		}
	}

	return domainStatus;
};

const buildIntegrationSummary = (integrationStatus: any[]) => ({
	totalDomains: integrationStatus.length,
	integratedCount: integrationStatus.filter((d) => d.status === 'integrated')
		.length,
	notIntegratedCount: integrationStatus.filter(
		(d) => d.status === 'not_integrated'
	).length,
	orphanedCount: integrationStatus.filter((d) => d.status === 'orphaned')
		.length,
	invalidCount: integrationStatus.filter((d) => d.status === 'invalid').length,
	issuesCount: integrationStatus.reduce((sum, d) => sum + d.issues.length, 0),
});

const getVercelToken = async (userId: string, db: any): Promise<string> => {
	const vercelAccount = await db.query.account.findFirst({
		where: and(eq(account.providerId, 'vercel'), eq(account.userId, userId)),
		columns: { accessToken: true },
	});

	if (!vercelAccount?.accessToken) {
		throw new TRPCError({
			code: 'UNAUTHORIZED',
			message:
				'No Vercel account found. Please connect your Vercel account first.',
		});
	}

	return vercelAccount.accessToken;
};

const getProjectsSchema = z.object({
	limit: z.string().optional(),
	since: z.number().optional(),
	until: z.number().optional(),
	includeIntegrationStatus: z.boolean().optional().default(true),
	organizationId: z.string().optional(),
	teamId: z.string().optional(),
	slug: z.string().optional(),
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

const getProjectEnvByKeySchema = z.object({
	projectId: z.string(),
	key: z.string(),
	teamId: z.string().optional(),
	slug: z.string().optional(),
});

const setProjectEnvSchema = z.object({
	projectId: z.string(),
	key: z.string(),
	value: z.string(),
	type: z
		.enum(['system', 'secret', 'encrypted', 'plain', 'sensitive'])
		.optional(),
	target: z.array(z.enum(['production', 'preview', 'development'])).optional(),
	gitBranch: z.string().nullable().optional(),
	comment: z.string().optional(),
	upsert: z.boolean().optional(),
	teamId: z.string().optional(),
	slug: z.string().optional(),
});

const deleteProjectEnvByKeySchema = z.object({
	projectId: z.string(),
	key: z.string(),
	teamId: z.string().optional(),
	slug: z.string().optional(),
});

const editProjectEnvSchema = z.object({
	projectId: z.string(),
	envVarId: z.string(),
	key: z.string().optional(),
	value: z.string().optional(),
	type: z
		.enum(['system', 'secret', 'encrypted', 'plain', 'sensitive'])
		.optional(),
	target: z.array(z.enum(['production', 'preview', 'development'])).optional(),
	gitBranch: z.string().nullable().optional(),
	comment: z.string().optional(),
	customEnvironmentIds: z.array(z.string()).optional(),
	teamId: z.string().optional(),
	slug: z.string().optional(),
});

const removeProjectEnvSchema = z.object({
	projectId: z.string(),
	envVarId: z.string(),
	customEnvironmentId: z.string().optional(),
	teamId: z.string().optional(),
	slug: z.string().optional(),
});

const integrateWebsitesSchema = z.object({
	projectId: z.string(),
	websites: z.array(
		z.object({
			domainName: domainSchema,
			websiteName: websiteNameSchema,
			target: z.array(z.enum(['production', 'preview', 'development'])),
			// Optional domain metadata for reference
			domainId: z.string().optional(),
			verified: z.boolean().optional(),
			gitBranch: z.string().nullable().optional(),
		})
	),
	organizationId: z.string().optional(),
	teamId: z.string().optional(),
	slug: z.string().optional(),
});

const checkIntegrationStatusSchema = z.object({
	projectId: z.string(),
	domains: z.array(z.string()).optional(), // Optional: check specific domains
	organizationId: z.string().optional(),
	teamId: z.string().optional(),
	slug: z.string().optional(),
});

const triageIssueSchema = z.object({
	projectId: z.string(),
	action: z.enum(['remove_orphaned', 'remove_duplicates']),
	domainName: z.string(),
	envVarId: z.string().optional().nullable(),
	websiteId: z.string().optional().nullable(),
	organizationId: z.string().optional(),
	teamId: z.string().optional(),
	slug: z.string().optional(),
});

const unintegrateSchema = z.object({
	projectId: z.string(),
	domainName: z.string(),
	envVarId: z.string(),
	websiteId: z.string().optional(),
	deleteWebsite: z.boolean().default(false),
	organizationId: z.string().optional(),
	teamId: z.string().optional(),
	slug: z.string().optional(),
});

export const vercelRouter = createTRPCRouter({
	getProjects: protectedProcedure
		.input(getProjectsSchema.default({}))
		.query(async ({ ctx, input }) => {
			const token = await getVercelToken(ctx.user.id, ctx.db);
			const vercel = new VercelSDK(token);

			const projectsData = await vercel.getProjects({
				...(input.limit && { limit: input.limit }),
				...(input.since && { since: input.since }),
				...(input.until && { until: input.until }),
			});

			if (!(input.includeIntegrationStatus && projectsData.projects?.length)) {
				return projectsData;
			}

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

			// Fetch integration status for all projects
			const userWebsites = await ctx.db.query.websites.findMany({
				where: buildWebsiteFilter(ctx.user.id, input.organizationId),
			});

			const websiteMap = new Map(userWebsites.map((w) => [w.id, w]));
			const domainMap = new Map(userWebsites.map((w) => [w.domain, w]));

			// Process each project to add integration status
			const projectsWithStatus = await Promise.all(
				projectsData.projects.map(async (project) => {
					try {
						const [databeddyEnvVars, projectDomains] = await Promise.all([
							vercel.getProjectEnvsByKey(project.id, ENV_KEY, {
								...(input.teamId && { teamId: input.teamId }),
								...(input.slug && { slug: input.slug }),
							}),
							vercel.getProjectDomains(project.id, {}),
						]);

						const integrationStatus = projectDomains.domains.map((domain) =>
							buildDomainIntegrationStatus(
								domain,
								databeddyEnvVars,
								websiteMap,
								domainMap
							)
						);

						const summary = buildIntegrationSummary(integrationStatus);

						return {
							id: project.id,
							name: project.name,
							accountId: project.accountId,
							createdAt: project.createdAt,
							updatedAt: project.updatedAt,
							framework: project.framework,
							live: project.live,
							link: project.link,
							primaryDomain: project.primaryDomain,
							integrationStatus: {
								integrationStatus,
								summary,
								totalEnvVars: databeddyEnvVars.length,
								projectDomains: projectDomains.domains.map((d) => ({
									name: d.name,
									verified: d.verified,
								})),
							},
						};
					} catch (_error: any) {
						return {
							id: project.id,
							name: project.name,
							accountId: project.accountId,
							createdAt: project.createdAt,
							updatedAt: project.updatedAt,
							framework: project.framework,
							live: project.live,
							link: project.link,
							primaryDomain: project.primaryDomain,
							integrationStatus: null,
						};
					}
				})
			);

			return {
				projects: projectsWithStatus,
				pagination: projectsData.pagination,
			};
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

	getProjectEnvByKey: protectedProcedure
		.input(getProjectEnvByKeySchema)
		.query(async ({ ctx, input }) => {
			const token = await getVercelToken(ctx.user.id, ctx.db);
			const vercel = new VercelSDK(token);

			const { projectId, key, teamId, slug } = input;
			return await vercel.getProjectEnvByKey(projectId, key, {
				...(teamId && { teamId }),
				...(slug && { slug }),
			});
		}),

	setProjectEnv: protectedProcedure
		.input(setProjectEnvSchema)
		.mutation(async ({ ctx, input }) => {
			const token = await getVercelToken(ctx.user.id, ctx.db);
			const vercel = new VercelSDK(token);

			const { projectId, key, value, upsert, teamId, slug, ...rest } = input;

			const envVar = {
				value,
				...rest,
			};

			return await vercel.setProjectEnv(projectId, key, envVar, {
				...(upsert !== undefined && { upsert }),
				...(teamId && { teamId }),
				...(slug && { slug }),
			});
		}),

	deleteProjectEnvByKey: protectedProcedure
		.input(deleteProjectEnvByKeySchema)
		.mutation(async ({ ctx, input }) => {
			const token = await getVercelToken(ctx.user.id, ctx.db);
			const vercel = new VercelSDK(token);

			const { projectId, key, teamId, slug } = input;
			return await vercel.deleteProjectEnvByKey(projectId, key, {
				...(teamId && { teamId }),
				...(slug && { slug }),
			});
		}),

	editProjectEnv: protectedProcedure
		.input(editProjectEnvSchema)
		.mutation(async ({ ctx, input }) => {
			const token = await getVercelToken(ctx.user.id, ctx.db);
			const vercel = new VercelSDK(token);

			const { projectId, envVarId, teamId, slug, ...envVar } = input;

			return await vercel.editProjectEnv(projectId, envVarId, envVar, {
				...(teamId && { teamId }),
				...(slug && { slug }),
			});
		}),

	removeProjectEnv: protectedProcedure
		.input(removeProjectEnvSchema)
		.mutation(async ({ ctx, input }) => {
			const token = await getVercelToken(ctx.user.id, ctx.db);
			const vercel = new VercelSDK(token);

			const { projectId, envVarId, customEnvironmentId, teamId, slug } = input;

			return await vercel.removeProjectEnv(projectId, envVarId, {
				...(customEnvironmentId && { customEnvironmentId }),
				...(teamId && { teamId }),
				...(slug && { slug }),
			});
		}),

	integrateWebsites: protectedProcedure
		.input(integrateWebsitesSchema)
		.mutation(async ({ ctx, input }) => {
			const token = await getVercelToken(ctx.user.id, ctx.db);
			const vercel = new VercelSDK(token);

			const {
				projectId,
				websites: websiteConfigs,
				organizationId,
				teamId,
				slug,
			} = input;

			if (organizationId) {
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
			for (const cfg of websiteConfigs) {
				if (cfg.target.length !== 1) {
					throw new TRPCError({
						code: 'BAD_REQUEST',
						message: 'Each domain must specify exactly one target environment',
					});
				}
			}

			const results: any[] = [];
			const errors: any[] = [];

			const websiteService = new WebsiteService(ctx.db);
			const [existingEnvVars, userWebsites] = await Promise.all([
				vercel.getProjectEnvsByKey(projectId, ENV_KEY, {
					...(teamId && { teamId }),
					...(slug && { slug }),
				}),
				ctx.db.query.websites.findMany({
					where: buildWebsiteFilter(ctx.user.id, organizationId),
				}),
			]);

			const websiteMap = new Map(userWebsites.map((w) => [w.id, w]));
			const domainMap = new Map(userWebsites.map((w) => [w.domain, w]));

			for (const websiteConfig of websiteConfigs) {
				try {
					const domainName = websiteConfig.domainName;
					const existingEnvVar = existingEnvVars.find((envVar) => {
						const website = websiteMap.get(envVar.value);
						const domainMatches = website?.domain === domainName;
						const targetMatches = envVar.target?.some((target) =>
							websiteConfig.target.includes(target as any)
						);
						return domainMatches && targetMatches;
					});
					const existingWebsite = domainMap.get(domainName);

					let websiteToUse: any;
					let isNewWebsite = false;

					if (existingWebsite) {
						websiteToUse = existingWebsite;
					} else {
						websiteToUse = await websiteService.createWebsite(
							{
								name: websiteConfig.websiteName,
								domain: domainName,
								userId: ctx.user.id,
								organizationId,
							},
							{
								logContext: {
									source: 'vercel-integration',
									vercelProjectId: projectId,
								},
							}
						);
						isNewWebsite = true;
					}
					let envVarResult: any = null;
					if (!existingEnvVar || existingEnvVar.value !== websiteToUse.id) {
						const conflictingEnvVar = existingEnvVars.find((envVar) =>
							envVar.target?.some((target) =>
								websiteConfig.target.includes(target as any)
							)
						);

						if (conflictingEnvVar) {
							envVarResult = await vercel.editProjectEnv(
								projectId,
								conflictingEnvVar.id,
								{
									value: websiteToUse.id,
									comment: `Databuddy website ID for ${domainName}`,
								},
								{
									...(teamId && { teamId }),
									...(slug && { slug }),
								}
							);
						} else {
							envVarResult = await vercel.createProjectEnv(
								projectId,
								{
									key: ENV_KEY,
									value: websiteToUse.id,
									type: 'plain',
									target: websiteConfig.target,
									comment: `Databuddy website ID for ${domainName}`,
								},
								{
									...(teamId && { teamId }),
									...(slug && { slug }),
								}
							);
						}

						if (envVarResult) {
							const updated = {
								id: envVarResult.id,
								key: ENV_KEY,
								value: websiteToUse.id,
								target: websiteConfig.target,
							} as any;
							const idx = existingEnvVars.findIndex(
								(e) => e.id === (conflictingEnvVar?.id || updated.id)
							);
							if (idx >= 0) {
								existingEnvVars[idx] = updated;
							} else {
								existingEnvVars.push(updated);
							}
						}
					}

					if (envVarResult) {
						const existingIntegrations =
							(websiteToUse.integrations as any) || {};
						const existingVercelIntegrations =
							existingIntegrations.vercel || {};

						const environmentKey = websiteConfig.target[0];
						const integrationData = {
							...existingIntegrations,
							vercel: {
								...existingVercelIntegrations,
								projectId,
								domainName,
								environments: {
									...existingVercelIntegrations.environments,
									[environmentKey]: {
										envVarId: envVarResult.id,
										target: websiteConfig.target,
										createdAt: new Date().toISOString(),
									},
								},
								updatedAt: new Date().toISOString(),
							},
						};

						await websiteService.updateWebsite(
							websiteToUse.id,
							{
								integrations: integrationData,
							},
							ctx.user.id,
							organizationId
						);
					}

					results.push({
						domain: domainName,
						websiteId: websiteToUse.id,
						websiteName: websiteToUse.name,
						target: websiteConfig.target,
						envVarResult,
						createdWebsite: isNewWebsite ? websiteToUse : null,
						existingWebsite: isNewWebsite ? null : websiteToUse,
						success: true,
						action: isNewWebsite ? 'created' : 'reused',
					});
				} catch (error: any) {
					errors.push({
						domain: websiteConfig.domainName,
						error: error.message || 'Unknown error occurred',
						success: false,
					});
				}
			}

			return {
				success: errors.length === 0,
				results,
				errors,
				totalProcessed: websiteConfigs.length,
				successCount: results.length,
				errorCount: errors.length,
			};
		}),

	checkIntegrationStatus: protectedProcedure
		.input(checkIntegrationStatusSchema)
		.query(async ({ ctx, input }) => {
			const token = await getVercelToken(ctx.user.id, ctx.db);
			const vercel = new VercelSDK(token);

			const { projectId, domains, teamId, slug } = input;

			try {
				const [databeddyEnvVars, projectDomains, userWebsites] =
					await Promise.all([
						vercel.getProjectEnvsByKey(projectId, ENV_KEY, {
							...(teamId && { teamId }),
							...(slug && { slug }),
						}),
						vercel.getProjectDomains(projectId, {}),
						ctx.db.query.websites.findMany({
							where: buildWebsiteFilter(ctx.user.id, input.organizationId),
						}),
					]);

				const websiteMap = new Map(userWebsites.map((w) => [w.id, w]));
				const domainMap = new Map(userWebsites.map((w) => [w.domain, w]));

				const domainsToCheck =
					domains || projectDomains.domains.map((d) => d.name);

				const integrationStatus = domainsToCheck.map((domainName) => {
					const domain = projectDomains.domains.find(
						(d) => d.name === domainName
					) || { name: domainName, verified: false };
					return buildDomainIntegrationStatus(
						domain,
						databeddyEnvVars,
						websiteMap,
						domainMap
					);
				});

				const summary = buildIntegrationSummary(integrationStatus);

				return {
					projectId,
					integrationStatus,
					summary,
					totalEnvVars: databeddyEnvVars.length,
					projectDomains: projectDomains.domains.map((d) => ({
						name: d.name,
						verified: d.verified,
					})),
				};
			} catch (error: any) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to check integration status: ${error.message}`,
				});
			}
		}),

	triageIssue: protectedProcedure
		.input(triageIssueSchema)
		.mutation(async ({ ctx, input }) => {
			const token = await getVercelToken(ctx.user.id, ctx.db);
			const vercel = new VercelSDK(token);
			const _websiteService = new WebsiteService(ctx.db);

			const {
				projectId,
				action,
				domainName,
				envVarId,
				organizationId,
				teamId,
				slug,
			} = input;

			if (organizationId) {
				const { success } = await websitesApi.hasPermission({
					headers: ctx.headers,
					body: { permissions: { website: ['update'] } },
				});
				if (!success) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: 'Missing organization permissions.',
					});
				}
			}

			try {
				switch (action) {
					case 'remove_orphaned': {
						if (!envVarId) {
							throw new TRPCError({
								code: 'BAD_REQUEST',
								message: 'envVarId is required for remove_orphaned action',
							});
						}

						await vercel.removeProjectEnv(projectId, envVarId, {
							...(teamId && { teamId }),
							...(slug && { slug }),
						});

						return {
							success: true,
							message: `Removed orphaned environment variable for ${domainName}`,
							action: 'remove_orphaned',
						};
					}

					case 'remove_duplicates': {
						const databeddyEnvVars = await vercel.getProjectEnvsByKey(
							projectId,
							ENV_KEY,
							{
								...(teamId && { teamId }),
								...(slug && { slug }),
							}
						);

						const duplicates = databeddyEnvVars.filter((_envVar, index) => {
							return index > 0;
						});

						for (const duplicate of duplicates) {
							await vercel.removeProjectEnv(projectId, duplicate.id, {
								...(teamId && { teamId }),
								...(slug && { slug }),
							});
						}

						return {
							success: true,
							message: `Removed ${duplicates.length} duplicate environment variables for ${domainName}`,
							action: 'remove_duplicates',
							removedCount: duplicates.length,
						};
					}

					default:
						throw new TRPCError({
							code: 'BAD_REQUEST',
							message: `Unknown triage action: ${action}`,
						});
				}
			} catch (error: any) {
				if (error instanceof TRPCError) {
					throw error;
				}

				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to execute triage action: ${error.message}`,
				});
			}
		}),

	getWebsiteIntegrations: protectedProcedure
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

			const websites = await ctx.db.query.websites.findMany({
				where: buildWebsiteFilter(ctx.user.id, input.organizationId),
			});

			return websites.map((website) => {
				const integrations = website.integrations as any;
				const vercelIntegration = integrations?.vercel;

				return {
					id: website.id,
					domain: website.domain,
					name: website.name,
					integrations: website.integrations as any,
					createdAt: website.createdAt,
					vercelIntegration: vercelIntegration
						? {
								projectId: vercelIntegration.projectId,
								domainName: vercelIntegration.domainName,
								environments: vercelIntegration.environments || {},
								environmentCount: Object.keys(
									vercelIntegration.environments || {}
								).length,
								updatedAt: vercelIntegration.updatedAt,
							}
						: null,
				};
			});
		}),

	unintegrate: protectedProcedure
		.input(unintegrateSchema)
		.mutation(async ({ ctx, input }) => {
			const token = await getVercelToken(ctx.user.id, ctx.db);
			const vercel = new VercelSDK(token);

			const {
				projectId,
				domainName,
				envVarId,
				websiteId,
				deleteWebsite,
				organizationId,
				teamId,
				slug,
			} = input;

			// Enforce org permission if scoped to org
			if (organizationId) {
				const { success } = await websitesApi.hasPermission({
					headers: ctx.headers,
					body: { permissions: { website: ['update'] } },
				});
				if (!success) {
					throw new TRPCError({
						code: 'FORBIDDEN',
						message: 'Missing organization permissions.',
					});
				}
			}

			try {
				await vercel.removeProjectEnv(projectId, envVarId, {
					...(teamId && { teamId }),
					...(slug && { slug }),
				});

				if (websiteId && !deleteWebsite) {
					const websiteService = new WebsiteService(ctx.db);

					const website = await ctx.db.query.websites.findFirst({
						where: eq(websites.id, websiteId),
					});

					if (website?.integrations) {
						const existingIntegrations = website.integrations as any;
						const vercelIntegrations = existingIntegrations.vercel;

						if (vercelIntegrations?.environments) {
							const updatedEnvironments = {
								...vercelIntegrations.environments,
							};

							for (const [envKey, envData] of Object.entries(
								updatedEnvironments
							)) {
								if ((envData as any)?.envVarId === envVarId) {
									delete updatedEnvironments[envKey];
									break;
								}
							}

							const updatedIntegrations =
								Object.keys(updatedEnvironments).length > 0
									? {
											...existingIntegrations,
											vercel: {
												...vercelIntegrations,
												environments: updatedEnvironments,
												updatedAt: new Date().toISOString(),
											},
										}
									: Object.keys(existingIntegrations).length > 1
										? Object.fromEntries(
												Object.entries(existingIntegrations).filter(
													([key]) => key !== 'vercel'
												)
											)
										: null;

							await websiteService.updateWebsite(
								websiteId,
								{
									integrations: updatedIntegrations,
								},
								ctx.user.id,
								organizationId
							);
						}
					}
				}

				if (deleteWebsite && websiteId) {
					const websiteService = new WebsiteService(ctx.db);
					await websiteService.deleteWebsite(websiteId, ctx.user.id);
				}

				return {
					success: true,
					message: deleteWebsite
						? `Unintegrated ${domainName} and deleted website`
						: `Unintegrated ${domainName} (website kept)`,
					deletedWebsite: deleteWebsite,
				};
			} catch (error: any) {
				throw new TRPCError({
					code: 'INTERNAL_SERVER_ERROR',
					message: `Failed to unintegrate ${domainName}: ${error.message}`,
				});
			}
		}),
});
