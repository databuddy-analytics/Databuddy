import { db } from "@databuddy/db";

const DATE_REGEX = /\.\d{3}Z$/;

export function formatDate(date: Date): string {
	return date.toISOString().replace("T", " ").replace(DATE_REGEX, "");
}

const STRIPE_API_VERSION = /^\d{4}-\d{2}-\d{2}(\.[a-z]+)?$/;

export function stripeApiVersion(value: unknown): string | undefined {
	return typeof value === "string" && STRIPE_API_VERSION.test(value)
		? value
		: undefined;
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
		where: { webhookHash: hash },
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
		where: { id: metadataWebsiteId },
		columns: { organizationId: true },
	});

	if (site?.organizationId === ownerId) {
		return metadataWebsiteId;
	}

	return configWebsiteId ?? undefined;
}
