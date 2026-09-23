import { db } from "@databuddy/db";
import { clickHouse } from "@databuddy/db/clickhouse";

const DATE_REGEX = /\.\d{3}Z$/;

export function formatDate(date: Date): string {
	return date.toISOString().replace("T", " ").replace(DATE_REGEX, "");
}

export async function recordWebhookDelivery(input: {
	apiVersion?: string;
	eventId: string;
	eventType: string;
	ownerId: string;
	provider: string;
	recordCount: number;
	status: "failed" | "processed";
	websiteId: string | null;
}): Promise<void> {
	await clickHouse.insert({
		table: "analytics.webhook_deliveries",
		format: "JSONEachRow",
		values: [
			{
				owner_id: input.ownerId,
				website_id: input.websiteId ?? undefined,
				provider: input.provider,
				event_type: input.eventType,
				event_id: input.eventId,
				api_version: input.apiVersion ?? "",
				record_count: input.recordCount,
				status: input.status,
				received_at: formatDate(new Date()),
			},
		],
	});
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
