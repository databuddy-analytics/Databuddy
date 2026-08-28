import { createHmac } from "node:crypto";
import { db, eq } from "@databuddy/db";
import { githubIntegrations } from "@databuddy/db/schema";
import { compare } from "@databuddy/encryption";
import { invalidateGithubIntegrationCache } from "@databuddy/redis/cache-invalidation";
import { Elysia } from "elysia";
import { useLogger } from "evlog/elysia";
// biome-ignore lint/performance/noNamespaceImport: vitest+bun fails to bind zod's named `z` export; namespace import is the reliable form
import * as z from "zod";

export function verifyGithubSignature(
	rawBody: string,
	signatureHeader: string | null,
	secret: string
): boolean {
	if (!signatureHeader?.startsWith("sha256=")) {
		return false;
	}
	const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
	return compare(signatureHeader.slice("sha256=".length), expected);
}

const installationEventSchema = z.object({
	action: z.string(),
	installation: z.object({
		id: z.number(),
		account: z.object({ login: z.string() }).nullish(),
	}),
});

async function organizationIdsForInstallation(
	installationId: string
): Promise<string[]> {
	const rows = await db
		.select({ organizationId: githubIntegrations.organizationId })
		.from(githubIntegrations)
		.where(eq(githubIntegrations.installationId, installationId));
	return [...new Set(rows.map((row) => row.organizationId))];
}

async function handleInstallationEvent(
	action: string,
	installationId: string
): Promise<boolean> {
	const organizationIds = await organizationIdsForInstallation(installationId);
	if (organizationIds.length === 0) {
		return false;
	}

	if (action === "deleted") {
		await db
			.delete(githubIntegrations)
			.where(eq(githubIntegrations.installationId, installationId));
	} else if (action === "suspend" || action === "unsuspend") {
		await db
			.update(githubIntegrations)
			.set({ status: action === "suspend" ? "disabled" : "active" })
			.where(eq(githubIntegrations.installationId, installationId));
	} else {
		return false;
	}

	await Promise.allSettled(
		organizationIds.map((organizationId) =>
			invalidateGithubIntegrationCache(organizationId)
		)
	);

	return true;
}

export const githubWebhook = new Elysia().post(
	"/github",
	async ({ headers, request, set }) => {
		const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
		if (!secret) {
			useLogger().error(new Error("GITHUB_APP_WEBHOOK_SECRET not configured"), {
				github_webhook: "verify",
			});
			set.status = 503;
			return { success: false, message: "Webhook temporarily unavailable" };
		}

		const rawBody = await request.text();
		if (
			!verifyGithubSignature(
				rawBody,
				headers["x-hub-signature-256"] ?? null,
				secret
			)
		) {
			useLogger().warn("GitHub webhook signature mismatch", {
				github_webhook: "verify",
			});
			set.status = 401;
			return { success: false, message: "Invalid signature" };
		}

		const eventName = headers["x-github-event"];
		if (eventName !== "installation") {
			set.status = 202;
			return { success: true, handled: false };
		}

		let payload: unknown = null;
		try {
			payload = JSON.parse(rawBody);
		} catch {
			payload = null;
		}
		const parsed = installationEventSchema.safeParse(payload);
		if (!parsed.success) {
			set.status = 400;
			return { success: false, message: "Invalid event shape" };
		}

		const handled = await handleInstallationEvent(
			parsed.data.action,
			String(parsed.data.installation.id)
		);

		useLogger().info("GitHub installation webhook processed", {
			github_webhook: parsed.data.action,
			installation_id: parsed.data.installation.id,
			account: parsed.data.installation.account?.login,
			handled,
		});

		set.status = 202;
		return { success: true, handled };
	}
);
