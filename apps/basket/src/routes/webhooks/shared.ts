import { db, eq } from "@databuddy/db";
import { revenueConfig, websites } from "@databuddy/db/schema";

const DATE_REGEX = /\.\d{3}Z$/;

export function formatDate(date: Date): string {
	return date.toISOString().replace("T", " ").replace(DATE_REGEX, "");
}

export async function getWebhookConfig<K extends string>(
	hash: string,
	secretField: K,
	providerLabel: string
): Promise<
	| ({ ownerId: string; websiteId: string | null } & Record<K, string>)
	| { error: string }
> {
	const config = await db.query.revenueConfig.findFirst({
		where: eq(revenueConfig.webhookHash, hash),
		columns: {
			ownerId: true,
			websiteId: true,
			[secretField]: true,
		} as Record<string, true>,
	});

	if (!config) {
		return { error: "not_found" };
	}

	const row = config as Record<string, unknown>;
	const secret = row[secretField];
	if (!secret) {
		return { error: `${providerLabel}_not_configured` };
	}

	return {
		ownerId: row.ownerId as string,
		websiteId: row.websiteId as string | null,
		[secretField]: secret as string,
	} as { ownerId: string; websiteId: string | null } & Record<K, string>;
}

export async function resolveWebsiteId(
	metadataWebsiteId: string | undefined,
	configWebsiteId: string | null,
	ownerId: string
): Promise<string | undefined> {
	if (!metadataWebsiteId) {
		return configWebsiteId ?? undefined;
	}

	const site = await db.query.websites.findFirst({
		where: eq(websites.id, metadataWebsiteId),
		columns: { organizationId: true },
	});

	if (site?.organizationId === ownerId) {
		return metadataWebsiteId;
	}

	return configWebsiteId ?? undefined;
}
