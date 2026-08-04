import { createHmac, timingSafeEqual } from "node:crypto";
import { db, eq } from "@databuddy/db";
import { githubInstallations } from "@databuddy/db/schema";
import { Elysia } from "elysia";
import { useLogger } from "evlog/elysia";

const WEBHOOK_SECRET = process.env.GITHUB_APP_WEBHOOK_SECRET;

interface GithubWebhookPayload {
	action?: string;
	installation?: {
		id?: number;
		account?: { login?: string | null; type?: string | null } | null;
		repository_selection?: string | null;
	};
	repository_selection?: string | null;
}

function verifySignature(rawBody: string, signature: string | undefined): boolean {
	if (!(WEBHOOK_SECRET && signature)) {
		return false;
	}
	const expected = `sha256=${createHmac("sha256", WEBHOOK_SECRET)
		.update(rawBody)
		.digest("hex")}`;
	const expectedBuffer = Buffer.from(expected);
	const signatureBuffer = Buffer.from(signature);
	if (expectedBuffer.length !== signatureBuffer.length) {
		return false;
	}
	return timingSafeEqual(expectedBuffer, signatureBuffer);
}

async function handleInstallationEvent(
	action: string | undefined,
	payload: GithubWebhookPayload,
	installationId: string
): Promise<void> {
	if (action === "deleted") {
		await db
			.delete(githubInstallations)
			.where(eq(githubInstallations.installationId, installationId));
		return;
	}

	if (action === "suspend") {
		await db
			.update(githubInstallations)
			.set({ suspendedAt: new Date() })
			.where(eq(githubInstallations.installationId, installationId));
		return;
	}

	if (action === "unsuspend") {
		await db
			.update(githubInstallations)
			.set({ suspendedAt: null })
			.where(eq(githubInstallations.installationId, installationId));
		return;
	}

	if (action === "created") {
		await db
			.update(githubInstallations)
			.set({
				accountLogin: payload.installation?.account?.login ?? null,
				accountType: payload.installation?.account?.type ?? null,
				repositorySelection:
					payload.installation?.repository_selection ?? null,
			})
			.where(eq(githubInstallations.installationId, installationId));
	}
}

export const githubWebhook = new Elysia().post(
	"/github",
	async ({ headers, request, set }) => {
		const log = useLogger();
		const rawBody = await request.text();

		if (!WEBHOOK_SECRET) {
			log.error(new Error("GITHUB_APP_WEBHOOK_SECRET not configured"), {
				github_app: { step: "verify" },
			});
			set.status = 503;
			return { success: false, message: "Webhook temporarily unavailable" };
		}

		if (!verifySignature(rawBody, headers["x-hub-signature-256"])) {
			set.status = 401;
			return { success: false, message: "Invalid signature" };
		}

		const event = headers["x-github-event"];
		let payload: GithubWebhookPayload;
		try {
			payload = JSON.parse(rawBody) as GithubWebhookPayload;
		} catch {
			set.status = 400;
			return { success: false, message: "Invalid JSON body" };
		}

		const installationId =
			typeof payload.installation?.id === "number"
				? String(payload.installation.id)
				: null;

		if (!installationId) {
			return { success: true, message: "Ignored" };
		}

		if (event === "installation") {
			await handleInstallationEvent(payload.action, payload, installationId);
			return { success: true, message: "Processed" };
		}

		if (event === "installation_repositories") {
			const repositorySelection =
				payload.repository_selection ??
				payload.installation?.repository_selection ??
				null;
			if (repositorySelection) {
				await db
					.update(githubInstallations)
					.set({ repositorySelection })
					.where(eq(githubInstallations.installationId, installationId));
			}
			return { success: true, message: "Processed" };
		}

		return { success: true, message: "Ignored" };
	},
	{ parse: "none" }
);
