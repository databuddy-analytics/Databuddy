import { auth } from "@databuddy/auth";
import { and, db, eq } from "@databuddy/db";
import { githubIntegrations, member } from "@databuddy/db/schema";
import { config } from "@databuddy/env/app";
import { invalidateGithubIntegrationCache } from "@databuddy/redis/cache-invalidation";
import { ratelimit } from "@databuddy/redis/rate-limit";
import {
	buildInstallUrl,
	exchangeInstallUserCode,
	fetchInstallationAccount,
	GitHubAppConfigError,
	requireGitHubAppConfig,
	userOwnsInstallation,
} from "@databuddy/services/github-app";
import { randomUUIDv7 } from "bun";
import { Elysia, t } from "elysia";
import { useLogger } from "evlog/elysia";
import {
	createOAuthState,
	type OAuthState,
	verifyOAuthState,
} from "./oauth-state";

const GITHUB_STATE_TTL_MS = 10 * 60 * 1000;

class GitHubInstallError extends Error {
	readonly publicMessage: string;

	constructor(message: string, publicMessage = message) {
		super(message);
		this.name = "GitHubInstallError";
		this.publicMessage = publicMessage;
	}
}

function integrationsRedirect(
	status: "connected" | "error",
	message?: string
): Response {
	const url = new URL(
		"/organizations/settings/integrations",
		config.urls.dashboard
	);
	url.searchParams.set("github", status);
	if (message) {
		url.searchParams.set("message", message);
	}
	return Response.redirect(url.toString(), 302);
}

function requireStateSecret(): string {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret) {
		throw new GitHubInstallError(
			"GitHub install is missing BETTER_AUTH_SECRET",
			"GitHub install is not configured"
		);
	}
	return secret;
}

async function requireOrgInstaller(
	request: Request,
	organizationId: string
): Promise<string> {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		throw new GitHubInstallError("Sign in before connecting GitHub");
	}

	const [membership] = await db
		.select({ role: member.role })
		.from(member)
		.where(
			and(
				eq(member.organizationId, organizationId),
				eq(member.userId, session.user.id)
			)
		)
		.limit(1);

	if (!(membership?.role === "owner" || membership?.role === "admin")) {
		throw new GitHubInstallError(
			"Only organization owners and admins can connect GitHub"
		);
	}

	return session.user.id;
}

async function saveGithubInstallation(
	state: OAuthState,
	account: {
		accountId: string;
		accountLogin: string;
		accountType: string;
		installationId: string;
	}
): Promise<void> {
	const now = new Date();

	await db.transaction(async (tx) => {
		const [existing] = await tx
			.select({
				id: githubIntegrations.id,
				organizationId: githubIntegrations.organizationId,
			})
			.from(githubIntegrations)
			.where(eq(githubIntegrations.installationId, account.installationId))
			.limit(1);

		if (existing && existing.organizationId !== state.organizationId) {
			throw new GitHubInstallError(
				"This GitHub account is already connected to another organization"
			);
		}

		const values = {
			accountId: account.accountId,
			accountLogin: account.accountLogin,
			accountType: account.accountType,
			installationId: account.installationId,
			installedByUserId: state.userId,
			organizationId: state.organizationId,
			status: "active" as const,
			updatedAt: now,
		};

		if (existing) {
			await tx
				.update(githubIntegrations)
				.set(values)
				.where(eq(githubIntegrations.id, existing.id));
			return;
		}

		await tx.insert(githubIntegrations).values({
			...values,
			createdAt: now,
			id: randomUUIDv7(),
		});
	});

	await invalidateGithubIntegrationCache(state.organizationId);
}

function principalFromRequest(request: Request): string {
	return (
		request.headers.get("cf-connecting-ip") ||
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		request.headers.get("x-real-ip") ||
		"unknown"
	);
}

async function throttleGithubInstall(
	action: "install" | "callback",
	request: Request,
	max: number
): Promise<Response | null> {
	const ip = principalFromRequest(request);
	const rl = await ratelimit(`github-app:${action}:${ip}`, max, 60);
	if (rl.success) {
		return null;
	}
	return integrationsRedirect(
		"error",
		"Too many GitHub install attempts; try again shortly."
	);
}

function publicInstallErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof GitHubInstallError) {
		return error.publicMessage;
	}
	if (error instanceof GitHubAppConfigError) {
		return "GitHub install is not configured";
	}
	return fallback;
}

async function verifyInstallationOwnership(
	code: string,
	installationId: string
): Promise<void> {
	const userToken = await exchangeInstallUserCode(code);
	if (!userToken) {
		throw new GitHubInstallError(
			"GitHub authorization could not be verified",
			"GitHub authorization failed"
		);
	}
	const owned = await userOwnsInstallation(userToken, installationId);
	if (!owned) {
		throw new GitHubInstallError(
			"GitHub installation does not belong to the authorizing user",
			"GitHub authorization failed"
		);
	}
}

export const githubIntegrationRoutes = new Elysia({
	prefix: "/v1/integrations",
})
	.get(
		"/github/install",
		async ({ query, request }) => {
			const throttled = await throttleGithubInstall("install", request, 10);
			if (throttled) {
				return throttled;
			}
			try {
				requireGitHubAppConfig();
				const secret = requireStateSecret();
				const userId = await requireOrgInstaller(request, query.organizationId);
				const state = createOAuthState(
					{
						expiresAt: Date.now() + GITHUB_STATE_TTL_MS,
						nonce: randomUUIDv7(),
						organizationId: query.organizationId,
						userId,
					},
					secret
				);
				return Response.redirect(buildInstallUrl(state), 302);
			} catch (error) {
				useLogger().error(
					error instanceof Error ? error : new Error(String(error)),
					{ github_app: "install" }
				);
				return integrationsRedirect(
					"error",
					publicInstallErrorMessage(error, "Could not start GitHub install")
				);
			}
		},
		{
			query: t.Object({
				organizationId: t.String({ minLength: 1 }),
			}),
		}
	)
	.get(
		"/github/callback",
		async ({ query, request }) => {
			const throttled = await throttleGithubInstall("callback", request, 20);
			if (throttled) {
				return throttled;
			}
			if (query.error) {
				useLogger().warn("GitHub install returned an error", {
					github_app: "callback",
					provider_error: query.error,
				});
				return integrationsRedirect(
					"error",
					query.error === "access_denied"
						? "GitHub wasn't connected because authorization was canceled"
						: "GitHub authorization failed"
				);
			}
			try {
				if (!(query.installation_id && query.state && query.code)) {
					throw new GitHubInstallError(
						"GitHub did not return an installation",
						"GitHub install must be started from the Databuddy dashboard"
					);
				}
				const secret = requireStateSecret();
				const state = verifyOAuthState(query.state, secret);
				if (!state) {
					throw new GitHubInstallError("GitHub install link expired");
				}

				const session = await auth.api.getSession({ headers: request.headers });
				if (!session?.user || session.user.id !== state.userId) {
					throw new GitHubInstallError(
						"GitHub install must be completed by the same user who started it"
					);
				}

				await verifyInstallationOwnership(query.code, query.installation_id);

				const account = await fetchInstallationAccount(query.installation_id);
				if (!account) {
					throw new GitHubInstallError(
						"GitHub installation could not be verified",
						"Could not verify GitHub installation"
					);
				}

				await saveGithubInstallation(state, account);

				return integrationsRedirect("connected");
			} catch (error) {
				useLogger().error(
					error instanceof Error ? error : new Error(String(error)),
					{ github_app: "callback" }
				);
				return integrationsRedirect(
					"error",
					publicInstallErrorMessage(error, "Could not finish GitHub install")
				);
			}
		},
		{
			query: t.Object({
				code: t.Optional(t.String()),
				error: t.Optional(t.String()),
				installation_id: t.Optional(t.String()),
				setup_action: t.Optional(t.String()),
				state: t.Optional(t.String()),
			}),
		}
	);
