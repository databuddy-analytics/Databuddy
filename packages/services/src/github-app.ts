import { createSign } from "node:crypto";
import { db, desc, eq } from "@databuddy/db";
import { githubIntegrations } from "@databuddy/db/schema";
import { cacheNamespaces, cacheable } from "@databuddy/redis";
import { z } from "zod";

const GITHUB_API = "https://api.github.com";
const APP_JWT_TTL_SECONDS = 540;
const APP_JWT_CLOCK_SKEW_SECONDS = 60;
const INSTALLATION_TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const INTEGRATION_CACHE_TTL_SECONDS = 300;

export interface GitHubAppConfig {
	appId: string;
	clientId: string;
	clientSecret: string;
	privateKey: string;
	slug: string;
}

export class GitHubAppConfigError extends Error {
	constructor(missing: string[]) {
		super(`GitHub App is missing ${missing.join(", ")}`);
		this.name = "GitHubAppConfigError";
	}
}

function normalizePrivateKey(raw: string): string {
	if (raw.includes("BEGIN")) {
		return raw.replaceAll("\\n", "\n");
	}
	return Buffer.from(raw, "base64").toString("utf8");
}

export function requireGitHubAppConfig(): GitHubAppConfig {
	const values = {
		GITHUB_APP_ID: process.env.GITHUB_APP_ID,
		GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG,
		GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
		GITHUB_APP_CLIENT_ID: process.env.GITHUB_APP_CLIENT_ID,
		GITHUB_APP_CLIENT_SECRET: process.env.GITHUB_APP_CLIENT_SECRET,
	};
	const missing = Object.entries(values)
		.filter(([, value]) => !value?.trim())
		.map(([name]) => name);
	if (missing.length > 0) {
		throw new GitHubAppConfigError(missing);
	}
	return {
		appId: values.GITHUB_APP_ID as string,
		slug: values.GITHUB_APP_SLUG as string,
		privateKey: normalizePrivateKey(values.GITHUB_APP_PRIVATE_KEY as string),
		clientId: values.GITHUB_APP_CLIENT_ID as string,
		clientSecret: values.GITHUB_APP_CLIENT_SECRET as string,
	};
}

export function isGitHubAppConfigured(): boolean {
	try {
		requireGitHubAppConfig();
		return true;
	} catch {
		return false;
	}
}

function base64UrlEncode(value: string | Buffer): string {
	return Buffer.from(value).toString("base64url");
}

export function createAppJwt(
	config: GitHubAppConfig,
	now = Date.now()
): string {
	const seconds = Math.floor(now / 1000);
	const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
	const payload = base64UrlEncode(
		JSON.stringify({
			iat: seconds - APP_JWT_CLOCK_SKEW_SECONDS,
			exp: seconds + APP_JWT_TTL_SECONDS,
			iss: config.appId,
		})
	);
	const signer = createSign("RSA-SHA256");
	signer.update(`${header}.${payload}`);
	const signature = signer.sign(config.privateKey).toString("base64url");
	return `${header}.${payload}.${signature}`;
}

function githubHeaders(token: string): Record<string, string> {
	return {
		Authorization: `Bearer ${token}`,
		Accept: "application/vnd.github+json",
		"X-GitHub-Api-Version": "2022-11-28",
	};
}

const installationTokenSchema = z.object({
	token: z.string().min(1),
	expires_at: z.string().min(1),
});

interface CachedInstallationToken {
	expiresAt: number;
	token: string;
}

const installationTokens = new Map<string, CachedInstallationToken>();

export async function getInstallationToken(
	installationId: string
): Promise<string | null> {
	const cached = installationTokens.get(installationId);
	if (
		cached &&
		cached.expiresAt - INSTALLATION_TOKEN_REFRESH_BUFFER_MS > Date.now()
	) {
		return cached.token;
	}

	const config = requireGitHubAppConfig();
	const response = await fetch(
		`${GITHUB_API}/app/installations/${encodeURIComponent(installationId)}/access_tokens`,
		{
			method: "POST",
			headers: githubHeaders(createAppJwt(config)),
			signal: AbortSignal.timeout(10_000),
		}
	);
	if (!response.ok) {
		installationTokens.delete(installationId);
		return null;
	}
	const parsed = installationTokenSchema.safeParse(
		await response.json().catch(() => null)
	);
	if (!parsed.success) {
		return null;
	}
	installationTokens.set(installationId, {
		token: parsed.data.token,
		expiresAt: new Date(parsed.data.expires_at).getTime(),
	});
	return parsed.data.token;
}

export interface OrgGithubIntegration {
	accountLogin: string;
	accountType: string;
	id: string;
	installationId: string;
	status: "active" | "disabled";
}

async function _getGithubIntegrationForOrg(
	organizationId: string
): Promise<OrgGithubIntegration | null> {
	const [row] = await db
		.select({
			id: githubIntegrations.id,
			installationId: githubIntegrations.installationId,
			accountLogin: githubIntegrations.accountLogin,
			accountType: githubIntegrations.accountType,
			status: githubIntegrations.status,
		})
		.from(githubIntegrations)
		.where(eq(githubIntegrations.organizationId, organizationId))
		.orderBy(desc(githubIntegrations.updatedAt))
		.limit(1);
	return row ?? null;
}

export const getGithubIntegrationForOrg = cacheable(
	_getGithubIntegrationForOrg,
	{
		expireInSec: INTEGRATION_CACHE_TTL_SECONDS,
		prefix: cacheNamespaces.githubIntegrationByOrg,
	}
);

export async function getGithubTokenForOrg(
	organizationId: string
): Promise<string | null> {
	if (!isGitHubAppConfigured()) {
		return null;
	}
	const integration = await getGithubIntegrationForOrg(organizationId);
	if (!integration || integration.status !== "active") {
		return null;
	}
	return getInstallationToken(integration.installationId);
}

const installationAccountSchema = z.object({
	id: z.number(),
	account: z.object({
		id: z.number(),
		login: z.string().min(1),
		type: z.string().min(1),
	}),
});

export interface GithubInstallationAccount {
	accountId: string;
	accountLogin: string;
	accountType: string;
	installationId: string;
}

export async function fetchInstallationAccount(
	installationId: string
): Promise<GithubInstallationAccount | null> {
	const config = requireGitHubAppConfig();
	const response = await fetch(
		`${GITHUB_API}/app/installations/${encodeURIComponent(installationId)}`,
		{
			headers: githubHeaders(createAppJwt(config)),
			signal: AbortSignal.timeout(10_000),
		}
	);
	if (!response.ok) {
		return null;
	}
	const parsed = installationAccountSchema.safeParse(
		await response.json().catch(() => null)
	);
	if (!parsed.success) {
		return null;
	}
	return {
		installationId: String(parsed.data.id),
		accountId: String(parsed.data.account.id),
		accountLogin: parsed.data.account.login,
		accountType: parsed.data.account.type,
	};
}

export async function deleteInstallation(
	installationId: string
): Promise<boolean> {
	const config = requireGitHubAppConfig();
	const response = await fetch(
		`${GITHUB_API}/app/installations/${encodeURIComponent(installationId)}`,
		{
			method: "DELETE",
			headers: githubHeaders(createAppJwt(config)),
			signal: AbortSignal.timeout(10_000),
		}
	);
	installationTokens.delete(installationId);
	return response.ok || response.status === 404;
}

const userAccessSchema = z.object({
	access_token: z.string().min(1),
});

export async function exchangeInstallUserCode(
	code: string
): Promise<string | null> {
	const config = requireGitHubAppConfig();
	const response = await fetch("https://github.com/login/oauth/access_token", {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			client_id: config.clientId,
			client_secret: config.clientSecret,
			code,
		}),
		signal: AbortSignal.timeout(10_000),
	});
	if (!response.ok) {
		return null;
	}
	const parsed = userAccessSchema.safeParse(
		await response.json().catch(() => null)
	);
	return parsed.success ? parsed.data.access_token : null;
}

const userInstallationsSchema = z.object({
	installations: z.array(z.object({ id: z.number() })),
});

export async function userOwnsInstallation(
	userToken: string,
	installationId: string
): Promise<boolean> {
	const response = await fetch(
		`${GITHUB_API}/user/installations?per_page=100`,
		{
			headers: githubHeaders(userToken),
			signal: AbortSignal.timeout(10_000),
		}
	);
	if (!response.ok) {
		return false;
	}
	const parsed = userInstallationsSchema.safeParse(
		await response.json().catch(() => null)
	);
	if (!parsed.success) {
		return false;
	}
	return parsed.data.installations.some(
		(installation) => String(installation.id) === installationId
	);
}

export function buildInstallUrl(state: string): string {
	const config = requireGitHubAppConfig();
	const url = new URL(
		`https://github.com/apps/${encodeURIComponent(config.slug)}/installations/new`
	);
	url.searchParams.set("state", state);
	return url.toString();
}
