import { successOutputSchema } from "../lib/schemas";
import { auth } from "@databuddy/auth";
import { and, desc, eq } from "@databuddy/db";
import {
	account,
	githubIntegrations,
	slackChannelBindings,
	slackIntegrations,
	websites,
} from "@databuddy/db/schema";
import type { WebsiteIntegrations } from "@databuddy/db/schema";
import {
	invalidateGithubIntegrationCache,
	invalidateSlackIntegrationCache,
} from "@databuddy/redis/cache-invalidation";
import {
	deleteInstallation,
	getGithubTokenForOrg,
} from "@databuddy/services/github-app";
import { z } from "zod";
import { rpcError } from "../errors";
import type { Context } from "../orpc";
import {
	protectedProcedure,
	sessionProcedure,
	trackedProcedure,
	trackedSessionProcedure,
} from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

const TOKEN_EXPIRY_SKEW_MS = 60 * 1000;

async function getUserProviderToken(
	database: Context["db"],
	userId: string,
	providerId: string
): Promise<string | null> {
	const [row] = await database
		.select({
			accessToken: account.accessToken,
			accessTokenExpiresAt: account.accessTokenExpiresAt,
			providerAccountId: account.accountId,
			refreshToken: account.refreshToken,
		})
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, providerId)))
		.limit(1);
	if (!row) {
		return null;
	}

	const expired =
		row.accessTokenExpiresAt !== null &&
		row.accessTokenExpiresAt.getTime() <= Date.now() + TOKEN_EXPIRY_SKEW_MS;
	if (row.accessToken && !expired) {
		return row.accessToken;
	}
	if (!row.refreshToken) {
		return row.accessToken;
	}

	try {
		const refreshed = await auth.api.getAccessToken({
			body: {
				providerId,
				accountId: row.providerAccountId,
				userId,
			},
		});
		return refreshed.accessToken ?? null;
	} catch {
		return null;
	}
}

const GITHUB_API = "https://api.github.com";

const githubRepoListSchema = z.array(
	z.object({
		full_name: z.string(),
		private: z.boolean(),
		default_branch: z.string(),
	})
);

function githubRequest(path: string, token: string): Promise<Response> {
	return fetch(`${GITHUB_API}${path}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
		},
		signal: AbortSignal.timeout(10_000),
	});
}

function githubAccessError(response: Response): Error {
	const status = response.status;
	if (
		status === 429 ||
		(status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
	) {
		const reset = Number(response.headers.get("x-ratelimit-reset"));
		return rpcError.rateLimited(Number.isFinite(reset) ? reset * 1000 : 60);
	}
	if (status === 401 || status === 403) {
		return rpcError.badRequest(
			"GitHub repository access is missing or expired. Grant access and try again."
		);
	}
	if (status === 404) {
		return rpcError.badRequest(
			"GitHub repository was not found or is not accessible to this account."
		);
	}
	if (status >= 500) {
		return rpcError.internal("GitHub is temporarily unavailable");
	}
	return rpcError.badRequest(`GitHub request failed (${status}). Try again.`);
}

const slackChannelBindingOutputSchema = z.object({
	id: z.string(),
	slackChannelId: z.string(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

const slackIntegrationOutputSchema = z.object({
	id: z.string(),
	teamId: z.string(),
	teamName: z.string().nullable(),
	enterpriseId: z.string().nullable(),
	appId: z.string().nullable(),
	botId: z.string().nullable(),
	botUserId: z.string().nullable(),
	status: z.enum(["active", "disabled"]),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	channelBindings: z.array(slackChannelBindingOutputSchema),
});

const githubIntegrationOutputSchema = z.object({
	id: z.string(),
	accountLogin: z.string(),
	accountType: z.string(),
	status: z.enum(["active", "disabled"]),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
});

const listOutputSchema = z.object({
	slack: z.array(slackIntegrationOutputSchema),
	github: z.array(githubIntegrationOutputSchema),
});

const uninstallSlackInputSchema = z.object({
	organizationId: z.string().min(1),
	integrationId: z.string().min(1),
});

export type SlackIntegrationOutput = z.infer<
	typeof slackIntegrationOutputSchema
>;
export type GithubIntegrationOutput = z.infer<
	typeof githubIntegrationOutputSchema
>;

export const integrationsRouter = {
	list: protectedProcedure
		.route({
			description: "Returns organization-scoped integration connections.",
			method: "POST",
			path: "/integrations/list",
			summary: "List integrations",
			tags: ["Integrations"],
		})
		.input(z.object({ organizationId: z.string().min(1) }))
		.output(listOutputSchema)
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "organization",
				permissions: ["read"],
			});

			let slackRows: SlackIntegrationRow[];
			try {
				slackRows = await context.db
					.select({
						id: slackIntegrations.id,
						teamId: slackIntegrations.teamId,
						teamName: slackIntegrations.teamName,
						enterpriseId: slackIntegrations.enterpriseId,
						appId: slackIntegrations.appId,
						botId: slackIntegrations.botId,
						botUserId: slackIntegrations.botUserId,
						status: slackIntegrations.status,
						createdAt: slackIntegrations.createdAt,
						updatedAt: slackIntegrations.updatedAt,
					})
					.from(slackIntegrations)
					.where(eq(slackIntegrations.organizationId, input.organizationId))
					.orderBy(desc(slackIntegrations.updatedAt));
			} catch (error) {
				if (isMissingSlackSchemaError(error)) {
					slackRows = [];
				} else {
					throw error;
				}
			}

			let githubRows: GithubIntegrationRow[];
			try {
				githubRows = await context.db
					.select({
						id: githubIntegrations.id,
						accountLogin: githubIntegrations.accountLogin,
						accountType: githubIntegrations.accountType,
						status: githubIntegrations.status,
						createdAt: githubIntegrations.createdAt,
						updatedAt: githubIntegrations.updatedAt,
					})
					.from(githubIntegrations)
					.where(eq(githubIntegrations.organizationId, input.organizationId))
					.orderBy(desc(githubIntegrations.updatedAt));
			} catch (error) {
				if (isMissingGithubSchemaError(error)) {
					githubRows = [];
				} else {
					throw error;
				}
			}

			const slack = await Promise.all(
				slackRows.map(async (integration) => {
					let channelBindings: SlackChannelBindingRow[];
					try {
						channelBindings = await context.db
							.select({
								id: slackChannelBindings.id,
								slackChannelId: slackChannelBindings.slackChannelId,
								createdAt: slackChannelBindings.createdAt,
								updatedAt: slackChannelBindings.updatedAt,
							})
							.from(slackChannelBindings)
							.where(eq(slackChannelBindings.integrationId, integration.id))
							.orderBy(desc(slackChannelBindings.updatedAt));
					} catch (error) {
						if (isMissingSlackSchemaError(error)) {
							channelBindings = [];
						} else {
							throw error;
						}
					}

					return {
						...integration,
						channelBindings,
					};
				})
			);

			return { slack, github: githubRows };
		}),

	uninstallGitHub: trackedProcedure
		.route({
			description: "Disconnects a GitHub App installation.",
			method: "POST",
			path: "/integrations/uninstallGitHub",
			summary: "Uninstall GitHub",
			tags: ["Integrations"],
		})
		.input(
			z.object({
				organizationId: z.string().min(1),
				integrationId: z.string().min(1),
			})
		)
		.output(
			z.object({
				success: z.literal(true),
				githubUninstalled: z.boolean(),
			})
		)
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "organization",
				permissions: ["update"],
			});

			const [integration] = await context.db
				.select({
					id: githubIntegrations.id,
					installationId: githubIntegrations.installationId,
				})
				.from(githubIntegrations)
				.where(
					and(
						eq(githubIntegrations.id, input.integrationId),
						eq(githubIntegrations.organizationId, input.organizationId)
					)
				)
				.limit(1);

			if (!integration) {
				throw rpcError.notFound("GitHub integration", input.integrationId);
			}

			await context.db
				.delete(githubIntegrations)
				.where(eq(githubIntegrations.id, integration.id));

			await invalidateGithubIntegrationCache(input.organizationId);

			const githubUninstalled = await deleteInstallation(
				integration.installationId
			).catch(() => false);

			return { success: true, githubUninstalled };
		}),

	uninstallSlack: trackedProcedure
		.route({
			description: "Disconnects a Slack workspace integration.",
			method: "POST",
			path: "/integrations/uninstallSlack",
			summary: "Uninstall Slack",
			tags: ["Integrations"],
		})
		.input(uninstallSlackInputSchema)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "organization",
				permissions: ["update"],
			});

			let revokedTeamId: string | undefined;

			try {
				const [integration] = await context.db
					.select({
						id: slackIntegrations.id,
						teamId: slackIntegrations.teamId,
					})
					.from(slackIntegrations)
					.where(
						and(
							eq(slackIntegrations.id, input.integrationId),
							eq(slackIntegrations.organizationId, input.organizationId)
						)
					)
					.limit(1);

				if (!integration) {
					throw rpcError.notFound("Slack integration", input.integrationId);
				}

				revokedTeamId = integration.teamId;

				await context.db
					.delete(slackIntegrations)
					.where(eq(slackIntegrations.id, integration.id));
			} catch (error) {
				if (isMissingSlackSchemaError(error)) {
					throw rpcError.notFound("Slack integration", input.integrationId);
				}
				throw error;
			}

			if (revokedTeamId) {
				await invalidateSlackIntegrationCache(revokedTeamId);
			}

			return { success: true };
		}),

	setGitHubRepo: trackedSessionProcedure
		.route({
			description: "Links a GitHub repo to a website for deploy correlation.",
			method: "POST",
			path: "/integrations/setGitHubRepo",
			summary: "Set GitHub repo",
			tags: ["Integrations"],
		})
		.input(
			z.object({
				websiteId: z.string().min(1),
				owner: z
					.string()
					.min(1)
					.max(100)
					.regex(/^[a-zA-Z0-9._-]+$/),
				repo: z
					.string()
					.min(1)
					.max(100)
					.regex(/^[a-zA-Z0-9._-]+$/),
			})
		)
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const [website] = await context.db
				.select({
					id: websites.id,
					organizationId: websites.organizationId,
					integrations: websites.integrations,
				})
				.from(websites)
				.where(eq(websites.id, input.websiteId))
				.limit(1);

			if (!website) {
				throw rpcError.notFound("Website", input.websiteId);
			}

			await withWorkspace(context, {
				organizationId: website.organizationId,
				resource: "website",
				permissions: ["update"],
			});
			const token =
				(await getGithubTokenForOrg(website.organizationId)) ??
				(await getUserProviderToken(context.db, context.user.id, "github"));
			if (!token) {
				throw rpcError.badRequest(
					"Connect GitHub with repository access before linking a repository."
				);
			}

			let response: Response;
			try {
				response = await githubRequest(
					`/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}`,
					token
				);
			} catch {
				throw rpcError.badRequest("GitHub could not verify this repository.");
			}
			if (!response.ok) {
				throw githubAccessError(response);
			}
			const repository = await response.json().catch(() => null);

			const verified = z
				.object({
					name: z.string().min(1),
					owner: z.object({ login: z.string().min(1) }),
				})
				.safeParse(repository);
			if (!verified.success) {
				throw rpcError.badRequest(
					"GitHub returned an invalid repository response."
				);
			}

			const integrations: WebsiteIntegrations = {
				...(website.integrations ?? {}),
				github: {
					owner: verified.data.owner.login,
					repo: verified.data.name,
				},
			};

			await context.db
				.update(websites)
				.set({ integrations })
				.where(eq(websites.id, input.websiteId));

			return { success: true };
		}),

	removeGitHubRepo: trackedProcedure
		.route({
			description: "Unlinks a GitHub repo from a website.",
			method: "POST",
			path: "/integrations/removeGitHubRepo",
			summary: "Remove GitHub repo",
			tags: ["Integrations"],
		})
		.input(z.object({ websiteId: z.string().min(1) }))
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const [website] = await context.db
				.select({
					id: websites.id,
					organizationId: websites.organizationId,
					integrations: websites.integrations,
				})
				.from(websites)
				.where(eq(websites.id, input.websiteId))
				.limit(1);

			if (!website) {
				throw rpcError.notFound("Website", input.websiteId);
			}

			await withWorkspace(context, {
				organizationId: website.organizationId,
				resource: "website",
				permissions: ["update"],
			});

			const integrations: WebsiteIntegrations = Object.fromEntries(
				Object.entries(website.integrations ?? {}).filter(
					([key]) => key !== "github"
				)
			);

			await context.db
				.update(websites)
				.set({ integrations })
				.where(eq(websites.id, input.websiteId));

			return { success: true };
		}),

	checkSearchConsoleAccess: sessionProcedure
		.route({
			description:
				"Checks whether the current user has Google Search Console access.",
			method: "POST",
			path: "/integrations/checkSearchConsoleAccess",
			summary: "Check Search Console access",
			tags: ["Integrations"],
		})
		.input(z.object({}))
		.output(z.object({ hasAccess: z.boolean() }))
		.handler(async ({ context }) => {
			const token = await getUserProviderToken(
				context.db,
				context.user.id,
				"google"
			);
			if (!token) {
				return { hasAccess: false };
			}

			try {
				const res = await fetch(
					"https://www.googleapis.com/webmasters/v3/sites",
					{
						headers: { Authorization: `Bearer ${token}` },
						signal: AbortSignal.timeout(5000),
					}
				);
				return { hasAccess: res.ok };
			} catch {
				return { hasAccess: false };
			}
		}),

	listGitHubRepos: sessionProcedure
		.route({
			description:
				"Lists GitHub repos accessible to the organization installation, falling back to the current user's linked account.",
			method: "POST",
			path: "/integrations/listGitHubRepos",
			summary: "List GitHub repos",
			tags: ["Integrations"],
		})
		.input(z.object({ organizationId: z.string().min(1).optional() }))
		.output(
			z.object({
				repos: z.array(
					z.object({
						fullName: z.string(),
						private: z.boolean(),
						defaultBranch: z.string(),
					})
				),
			})
		)
		.handler(async ({ context, input }) => {
			let installationToken: string | null = null;
			if (input.organizationId) {
				await withWorkspace(context, {
					organizationId: input.organizationId,
					resource: "organization",
					permissions: ["read"],
				});
				installationToken = await getGithubTokenForOrg(input.organizationId);
			}

			const token =
				installationToken ??
				(await getUserProviderToken(context.db, context.user.id, "github"));
			if (!token) {
				throw rpcError.badRequest(
					"Connect GitHub with repository access before listing repositories."
				);
			}

			const path = installationToken
				? "/installation/repositories?per_page=100"
				: "/user/repos?sort=pushed&direction=desc&per_page=50";

			let res: Response;
			try {
				res = await githubRequest(path, token);
			} catch {
				throw rpcError.badRequest("GitHub could not be reached. Try again.");
			}

			if (!res.ok) {
				throw githubAccessError(res);
			}

			const body = await res.json().catch(() => null);
			const parsed = githubRepoListSchema.safeParse(
				installationToken ? body?.repositories : body
			);
			if (!parsed.success) {
				throw rpcError.badRequest(
					"GitHub returned an invalid repository list."
				);
			}

			return {
				repos: parsed.data.map((repo) => ({
					fullName: repo.full_name,
					private: repo.private,
					defaultBranch: repo.default_branch,
				})),
			};
		}),
};

type SlackIntegrationRow = Omit<SlackIntegrationOutput, "channelBindings">;
type SlackChannelBindingRow = z.infer<typeof slackChannelBindingOutputSchema>;
type GithubIntegrationRow = z.infer<typeof githubIntegrationOutputSchema>;

function isMissingRelationError(
	error: unknown,
	relationPrefix: string
): boolean {
	if (
		error instanceof Error &&
		isMissingRelationError(error.cause, relationPrefix)
	) {
		return true;
	}

	if (!(typeof error === "object" && error !== null)) {
		return false;
	}

	const pgError = error as {
		code?: unknown;
		message?: unknown;
		relation?: unknown;
	};
	if (pgError.code !== "42P01") {
		return false;
	}

	const relation = typeof pgError.relation === "string" ? pgError.relation : "";
	const message = typeof pgError.message === "string" ? pgError.message : "";
	return (
		relation.startsWith(relationPrefix) || message.includes(relationPrefix)
	);
}

function isMissingGithubSchemaError(error: unknown): boolean {
	return isMissingRelationError(error, "github_");
}

function isMissingSlackSchemaError(error: unknown): boolean {
	return isMissingRelationError(error, "slack_");
}
