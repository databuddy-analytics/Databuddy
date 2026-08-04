import { createAppAuth } from "@octokit/auth-app";
import { db, eq } from "@databuddy/db";
import { githubInstallations } from "@databuddy/db/schema";

export interface GithubInstallationToken {
	expiresAt: Date;
	token: string;
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
