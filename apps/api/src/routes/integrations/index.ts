import { auth } from "@databuddy/auth";
import { and, db, eq } from "@databuddy/db";
import { member, slackIntegrations } from "@databuddy/db/schema";
import { encrypt } from "@databuddy/encryption";
import { config } from "@databuddy/env/app";
import { invalidateSlackIntegrationCache } from "@databuddy/redis/cache-invalidation";
import { ratelimit } from "@databuddy/redis/rate-limit";
import { randomUUIDv7 } from "bun";
import { Elysia, t } from "elysia";
import { useLogger } from "evlog/elysia";
import { z } from "zod";
import {
	createSlackOAuthState,
	type SlackOAuthState,
	verifySlackOAuthState,
} from "./slack-state";

const SLACK_OAUTH_SCOPES = [
	"assistant:write",
	"app_mentions:read",
	"channels:history",
	"channels:read",
	"chat:write",
	"commands",
	"groups:history",
	"groups:read",
	"im:history",
	"reactions:read",
	"reactions:write",
] as const;

const SLACK_STATE_TTL_MS = 10 * 60 * 1000;
const CONNECTION_DROP_MESSAGE_RE =
	/connection (terminated|ended|timeout|reset)/i;
const ECONNRESET_RE = /econnreset/i;

interface SlackOAuthConfig {
	authSecret: string;
	clientId: string;
	clientSecret: string;
	encryptionKey: string;
	redirectUri: string;
}

interface SlackAccessResponse {
	accessToken: string;
	appId: string | null;
	botUserId: string | null;
	enterpriseId: string | null;
	teamId: string;
	teamName: string | null;
}

interface SlackBotIdentity {
	botId: string | null;
	botUserId: string | null;
	teamId: string | null;
	teamName: string | null;
}

class SlackInstallError extends Error {
	readonly publicMessage: string;

	constructor(message: string, publicMessage = message) {
		super(message);
		this.name = "SlackInstallError";
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
	url.searchParams.set("slack", status);
	if (message) {
		url.searchParams.set("message", message);
	}
	return Response.redirect(url.toString(), 302);
}

function requireConfig(_request: Request): SlackOAuthConfig {
	const missing: string[] = [];
	const authSecret = process.env.BETTER_AUTH_SECRET;
	const clientId = process.env.SLACK_CLIENT_ID;
	const clientSecret = process.env.SLACK_CLIENT_SECRET;
	const encryptionKey = process.env.DATABUDDY_ENCRYPTION_KEY;

	if (!authSecret) {
		missing.push("BETTER_AUTH_SECRET");
	}
	if (!clientId) {
		missing.push("SLACK_CLIENT_ID");
	}
	if (!clientSecret) {
		missing.push("SLACK_CLIENT_SECRET");
	}
	if (!encryptionKey) {
		missing.push("DATABUDDY_ENCRYPTION_KEY");
	}
	if (
		missing.length > 0 ||
		!(authSecret && clientId && clientSecret && encryptionKey)
	) {
		throw new SlackInstallError(
			`Slack OAuth is missing ${missing.join(", ")}`,
			"Slack install is not configured"
		);
	}

	return {
		authSecret,
		clientId,
		clientSecret,
		encryptionKey,
		redirectUri:
			process.env.SLACK_REDIRECT_URI ||
			new URL("/v1/integrations/slack/callback", config.urls.api).toString(),
	};
}

async function requireOrgInstaller(
	request: Request,
	organizationId: string
): Promise<string> {
	const session = await auth.api.getSession({ headers: request.headers });
	if (!session?.user) {
		throw new SlackInstallError("Sign in before connecting Slack");
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
		throw new SlackInstallError(
			"Only organization owners and admins can connect Slack"
		);
	}

	return session.user.id;
}

function buildSlackAuthorizeUrl(
	config: SlackOAuthConfig,
	state: string
): string {
	const url = new URL("https://slack.com/oauth/v2/authorize");
	url.searchParams.set("client_id", config.clientId);
	url.searchParams.set("redirect_uri", config.redirectUri);
	url.searchParams.set("scope", SLACK_OAUTH_SCOPES.join(","));
	url.searchParams.set("state", state);
	return url.toString();
}

const slackText = z
	.string()
	.nullish()
	.transform((value) => (value?.trim() ? value : null))
	.catch(null);

const slackAccessSchema = z.object({
	ok: z.boolean().catch(false),
	error: slackText,
	access_token: slackText,
	app_id: slackText,
	bot_user_id: slackText,
	team: z.object({ id: slackText, name: slackText }).nullish().catch(null),
	enterprise: z.object({ id: slackText }).nullish().catch(null),
});

const slackAuthTestSchema = z.object({
	ok: z.boolean().catch(false),
	error: slackText,
	bot_id: slackText,
	user_id: slackText,
	team_id: slackText,
	team: slackText,
});

async function readSlackJson<T extends z.ZodType>(
	response: Response,
	schema: T
): Promise<z.infer<T>> {
	const raw = await response.json().catch(() => null);
	const parsed = schema.safeParse(raw);
	if (!parsed.success) {
		throw new SlackInstallError("Slack returned an invalid response");
	}
	return parsed.data;
}

async function exchangeSlackCode(
	config: SlackOAuthConfig,
	code: string
): Promise<SlackAccessResponse> {
	const response = await fetch("https://slack.com/api/oauth.v2.access", {
		body: new URLSearchParams({
			client_id: config.clientId,
			client_secret: config.clientSecret,
			code,
			redirect_uri: config.redirectUri,
		}),
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		method: "POST",
	});
	const body = await readSlackJson(response, slackAccessSchema);
	if (!body.ok) {
		throw new SlackInstallError(
			`Slack OAuth failed: ${body.error ?? "unknown_error"}`,
			"Slack authorization failed"
		);
	}

	const accessToken = body.access_token;
	const teamId = body.team?.id ?? null;
	if (!(accessToken && teamId)) {
		throw new SlackInstallError(
			"Slack did not return a bot token and workspace id"
		);
	}

	return {
		accessToken,
		appId: body.app_id,
		botUserId: body.bot_user_id,
		enterpriseId: body.enterprise?.id ?? null,
		teamId,
		teamName: body.team?.name ?? null,
	};
}

async function readSlackBotIdentity(token: string): Promise<SlackBotIdentity> {
	const response = await fetch("https://slack.com/api/auth.test", {
		headers: { Authorization: `Bearer ${token}` },
	});
	const body = await readSlackJson(response, slackAuthTestSchema);
	if (!body.ok) {
		throw new SlackInstallError(
			`Slack token verification failed: ${body.error ?? "unknown_error"}`,
			"Could not verify Slack installation"
		);
	}

	return {
		botId: body.bot_id,
		botUserId: body.user_id,
		teamId: body.team_id,
		teamName: body.team,
	};
}

function isTransientDatabaseConnectionError(error: unknown): boolean {
	if (!error) {
		return false;
	}

	const record =
		error && typeof error === "object"
			? (error as Record<string, unknown>)
			: null;
	const code =
		typeof record?.code === "string" && record.code.trim() ? record.code : null;
	if (code && ["08003", "08006", "57P01", "ECONNRESET"].includes(code)) {
		return true;
	}

	const message = error instanceof Error ? error.message : String(error);
	if (CONNECTION_DROP_MESSAGE_RE.test(message) || ECONNRESET_RE.test(message)) {
		return true;
	}

	return error instanceof Error
		? isTransientDatabaseConnectionError(error.cause)
		: false;
}

async function saveSlackInstallation({
	access,
	config,
	identity,
	state,
}: {
	access: SlackAccessResponse;
	config: SlackOAuthConfig;
	identity: SlackBotIdentity;
	state: SlackOAuthState;
}): Promise<void> {
	try {
		await saveSlackInstallationOnce({ access, config, identity, state });
	} catch (error) {
		if (!isTransientDatabaseConnectionError(error)) {
			throw error;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
		await saveSlackInstallationOnce({ access, config, identity, state });
	}
}

async function saveSlackInstallationOnce({
	access,
	config,
	identity,
	state,
}: {
	access: SlackAccessResponse;
	config: SlackOAuthConfig;
	identity: SlackBotIdentity;
	state: SlackOAuthState;
}): Promise<void> {
	const teamId = identity.teamId ?? access.teamId;
	const teamName = identity.teamName ?? access.teamName ?? teamId;
	const now = new Date();

	await db.transaction(async (tx) => {
		const [existing] = await tx
			.select({
				id: slackIntegrations.id,
				organizationId: slackIntegrations.organizationId,
			})
			.from(slackIntegrations)
			.where(eq(slackIntegrations.teamId, teamId))
			.limit(1);

		if (existing && existing.organizationId !== state.organizationId) {
			throw new SlackInstallError(
				"This Slack workspace is already connected to another organization"
			);
		}

		const values = {
			appId: access.appId,
			botId: identity.botId,
			botTokenCiphertext: encrypt(access.accessToken, config.encryptionKey),
			botUserId: access.botUserId ?? identity.botUserId,
			enterpriseId: access.enterpriseId,
			installedByUserId: state.userId,
			organizationId: state.organizationId,
			status: "active" as const,
			teamId,
			teamName,
			updatedAt: now,
		};

		if (existing) {
			await tx
				.update(slackIntegrations)
				.set(values)
				.where(eq(slackIntegrations.id, existing.id));
			return;
		}

		await tx.insert(slackIntegrations).values({
			...values,
			createdAt: now,
			id: randomUUIDv7(),
		});
	});

	await invalidateSlackIntegrationCache(teamId);
}

function principalFromRequest(request: Request): string {
	return (
		request.headers.get("cf-connecting-ip") ||
		request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		request.headers.get("x-real-ip") ||
		"unknown"
	);
}

async function throttleSlackOAuth(
	action: "install" | "callback",
	request: Request,
	max: number
): Promise<Response | null> {
	const ip = principalFromRequest(request);
	const rl = await ratelimit(`slack-oauth:${action}:${ip}`, max, 60);
	if (rl.success) {
		return null;
	}
	return integrationsRedirect(
		"error",
		"Too many Slack install attempts; try again shortly."
	);
}

export const integrations = new Elysia({ prefix: "/v1/integrations" })
	.get(
		"/slack/install",
		async ({ query, request }) => {
			const throttled = await throttleSlackOAuth("install", request, 10);
			if (throttled) {
				return throttled;
			}
			try {
				const config = requireConfig(request);
				const userId = await requireOrgInstaller(request, query.organizationId);
				const state = createSlackOAuthState(
					{
						expiresAt: Date.now() + SLACK_STATE_TTL_MS,
						nonce: randomUUIDv7(),
						organizationId: query.organizationId,
						userId,
					},
					config.authSecret
				);
				return Response.redirect(buildSlackAuthorizeUrl(config, state), 302);
			} catch (error) {
				useLogger().error(
					error instanceof Error ? error : new Error(String(error)),
					{ slack_oauth: "install" }
				);
				const message =
					error instanceof SlackInstallError
						? error.publicMessage
						: "Could not start Slack install";
				return integrationsRedirect("error", message);
			}
		},
		{
			query: t.Object({
				organizationId: t.String({ minLength: 1 }),
			}),
		}
	)
	.get(
		"/slack/callback",
		async ({ query, request }) => {
			const throttled = await throttleSlackOAuth("callback", request, 20);
			if (throttled) {
				return throttled;
			}
			if (query.error) {
				useLogger().warn("Slack OAuth provider returned an error", {
					slack_oauth: "callback",
					provider_error: query.error,
				});
				return integrationsRedirect("error", "Slack authorization failed");
			}
			try {
				if (!(query.code && query.state)) {
					throw new SlackInstallError("Slack did not return an OAuth code");
				}
				const config = requireConfig(request);
				const state = verifySlackOAuthState(query.state, config.authSecret);
				if (!state) {
					throw new SlackInstallError("Slack install link expired");
				}

				const session = await auth.api.getSession({ headers: request.headers });
				if (!session?.user || session.user.id !== state.userId) {
					throw new SlackInstallError(
						"Slack install must be completed by the same user who started it"
					);
				}

				const access = await exchangeSlackCode(config, query.code);
				const identity = await readSlackBotIdentity(access.accessToken);
				await saveSlackInstallation({ access, config, identity, state });

				return integrationsRedirect("connected");
			} catch (error) {
				useLogger().error(
					error instanceof Error ? error : new Error(String(error)),
					{ slack_oauth: "callback" }
				);
				const message =
					error instanceof SlackInstallError
						? error.publicMessage
						: "Could not finish Slack install";
				return integrationsRedirect("error", message);
			}
		},
		{
			query: t.Object({
				code: t.Optional(t.String()),
				error: t.Optional(t.String()),
				state: t.Optional(t.String()),
			}),
		}
	);
