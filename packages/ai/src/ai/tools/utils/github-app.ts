import { createAppAuth } from "@octokit/auth-app";
import { db, eq } from "@databuddy/db";
import { githubInstallations } from "@databuddy/db/schema";

export interface GithubInstallationToken {
	expiresAt: Date;
	token: string;
}

export interface GithubInstallationMetadata {
	accountLogin: string | null;
	accountType: string | null;
	repositorySelection: string | null;
}

export async function getInstallationMetadata(
	installationId: string
): Promise<GithubInstallationMetadata | null> {
	const appId = process.env.GITHUB_APP_ID;
	const privateKeyRaw = process.env.GITHUB_APP_PRIVATE_KEY;
	if (!(appId && privateKeyRaw)) {
		return null;
	}

	try {
		const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
		const auth = createAppAuth({ appId, privateKey });
		const { token } = await auth({ type: "app" });

		const response = await fetch(
			`https://api.github.com/app/installations/${installationId}`,
			{
				headers: {
					Accept: "application/vnd.github+json",
					Authorization: `Bearer ${token}`,
					"X-GitHub-Api-Version": "2022-11-28",
				},
			}
		);
		if (!response.ok) {
			return null;
		}

		const body = (await response.json()) as {
			account?: { login?: string | null; type?: string | null } | null;
			repository_selection?: string | null;
		};

		return {
			accountLogin: body.account?.login ?? null,
			accountType: body.account?.type ?? null,
			repositorySelection: body.repository_selection ?? null,
		};
	} catch {
		return null;
	}
}

export async function resolveGithubInstallationToken(
	organizationId: string
): Promise<GithubInstallationToken | null> {
	const appId = process.env.GITHUB_APP_ID;
	const privateKeyRaw = process.env.GITHUB_APP_PRIVATE_KEY;
	if (!(appId && privateKeyRaw)) {
		return null;
	}

	try {
		const [installation] = await db
			.select({
				installationId: githubInstallations.installationId,
				suspendedAt: githubInstallations.suspendedAt,
			})
			.from(githubInstallations)
			.where(eq(githubInstallations.organizationId, organizationId))
			.limit(1);

		if (!installation || installation.suspendedAt) {
			return null;
		}

		const privateKey = privateKeyRaw.replace(/\\n/g, "\n");
		const auth = createAppAuth({
			appId,
			privateKey,
			installationId: installation.installationId,
		});
		const result = await auth({ type: "installation" });

		return { token: result.token, expiresAt: new Date(result.expiresAt) };
	} catch {
		return null;
	}
}
