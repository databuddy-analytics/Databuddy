export type DigestFrequency = "hourly" | "daily" | "weekly" | "custom";

const FREQUENCY_VALUES: ReadonlySet<DigestFrequency> = new Set([
	"hourly",
	"daily",
	"weekly",
	"custom",
]);

function asDigestFrequency(value: unknown): DigestFrequency {
	if (
		typeof value === "string" &&
		FREQUENCY_VALUES.has(value as DigestFrequency)
	) {
		return value as DigestFrequency;
	}
	return "weekly";
}

export interface DigestConfigSummary {
	channels: string[];
	cron: string | null;
	enabled: boolean;
	frequency: DigestFrequency;
	nextRunAt: string | null;
	scope: string;
	timezone: string;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}

export function summarizeDigestConfig(config: unknown): DigestConfigSummary {
	const record = asRecord(config);
	const deliveries = Array.isArray(record.deliveries) ? record.deliveries : [];
	const channels = deliveries
		.map((delivery) => asRecord(delivery))
		.filter(
			(delivery) =>
				delivery.type === "slack" && typeof delivery.channelId === "string"
		)
		.map((delivery) => delivery.channelId as string);
	const nextRunAt = record.nextRunAt;
	const cron =
		typeof record.cron === "string" && record.cron.length > 0
			? record.cron
			: null;
	const timezone =
		typeof record.timezone === "string" && record.timezone.length > 0
			? record.timezone
			: "UTC";
	return {
		channels,
		cron,
		enabled: record.enabled !== false,
		frequency: asDigestFrequency(record.frequency),
		nextRunAt:
			nextRunAt instanceof Date
				? nextRunAt.toISOString()
				: typeof nextRunAt === "string"
					? nextRunAt
					: null,
		scope: typeof record.source === "string" ? record.source : "default",
		timezone,
	};
}
