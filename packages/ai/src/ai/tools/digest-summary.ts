export type DigestFrequency = "daily" | "weekly";

function asDigestFrequency(value: unknown): DigestFrequency {
	return value === "daily" ? "daily" : "weekly";
}

export interface DigestConfigSummary {
	channels: string[];
	enabled: boolean;
	frequency: DigestFrequency;
	nextRunAt: string | null;
	source: "default" | "organization";
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
		.flatMap((delivery) =>
			delivery.type === "slack" && typeof delivery.channelId === "string"
				? [delivery.channelId]
				: []
		);
	const nextRunAt = record.nextRunAt;
	const timezone =
		typeof record.timezone === "string" && record.timezone.length > 0
			? record.timezone
			: "UTC";
	return {
		channels,
		enabled: record.enabled === true,
		frequency: asDigestFrequency(record.frequency),
		nextRunAt:
			nextRunAt instanceof Date
				? nextRunAt.toISOString()
				: typeof nextRunAt === "string"
					? nextRunAt
					: null,
		source: record.source === "organization" ? "organization" : "default",
		timezone,
	};
}
