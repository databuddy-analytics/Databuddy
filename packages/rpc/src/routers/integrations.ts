import { and, desc, eq } from "@databuddy/db";
import {
	account,
	slackChannelBindings,
	slackIntegrations,
	websites,
} from "@databuddy/db/schema";
import type { WebsiteIntegrations } from "@databuddy/db/schema";
import { invalidateSlackIntegrationCache } from "@databuddy/redis";
import { z } from "zod";
import { rpcError } from "../errors";
import type { Context } from "../orpc";
import {
	protectedProcedure,
	sessionProcedure,
	trackedProcedure,
} from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

async function getUserProviderToken(
	database: Context["db"],
	userId: string,
	providerId: string
): Promise<string | null> {
	const [row] = await database
		.select({ accessToken: account.accessToken })
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, providerId)))
		.limit(1);
	return row?.accessToken ?? null;
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

const listOutputSchema = z.object({
	slack: z.array(slackIntegrationOutputSchema),
});

const uninstallSlackInputSchema = z.object({
	organizationId: z.string().min(1),
	integrationId: z.string().min(1),
});

const successOutputSchema = z.object({ success: z.literal(true) });

export type SlackIntegrationOutput = z.infer<
	typeof slackIntegrationOutputSchema
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
					return { slack: [] };
				}
				throw error;
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

			return { slack };
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

	setGitHubRepo: trackedProcedure
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

			const integrations: WebsiteIntegrations = {
				...(website.integrations ?? {}),
				github: { owner: input.owner, repo: input.repo },
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
			description: "Lists GitHub repos accessible to the current user.",
			method: "POST",
			path: "/integrations/listGitHubRepos",
			summary: "List GitHub repos",
			tags: ["Integrations"],
		})
		.input(z.object({}))
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
		.handler(async ({ context }) => {
			const token = await getUserProviderToken(
				context.db,
				context.user.id,
				"github"
			);
			if (!token) {
				return { repos: [] };
			}

			const res = await fetch(
				"https://api.github.com/user/repos?sort=pushed&direction=desc&per_page=50",
				{
					headers: {
						Authorization: `Bearer ${token}`,
						Accept: "application/vnd.github+json",
						"X-GitHub-Api-Version": "2022-11-28",
					},
					signal: AbortSignal.timeout(10_000),
				}
			);

			if (!res.ok) {
				return { repos: [] };
			}

			const data = await res.json();
			if (!Array.isArray(data)) {
				return { repos: [] };
			}

			return {
				repos: (
					data as Array<{
						full_name: string;
						private: boolean;
						default_branch: string;
					}>
				).map((r) => ({
					fullName: r.full_name,
					private: r.private,
					defaultBranch: r.default_branch,
				})),
			};
		}),
};

type SlackIntegrationRow = Omit<SlackIntegrationOutput, "channelBindings">;
type SlackChannelBindingRow = z.infer<typeof slackChannelBindingOutputSchema>;

function isMissingSlackSchemaError(error: unknown): boolean {
	if (error instanceof Error && isMissingSlackSchemaError(error.cause)) {
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
		relation.startsWith("slack_") ||
		message.includes("slack_integrations") ||
		message.includes("slack_channel_bindings")
	);
}
