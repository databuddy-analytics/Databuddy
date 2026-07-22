const usageNumberFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 1,
});

const resetDateFormatter = new Intl.DateTimeFormat("en-US", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "UTC",
});

export function formatUsageNumber(value: number): string {
	if (!Number.isFinite(value)) {
		return "—";
	}
	return usageNumberFormatter.format(value);
}

export function formatUsagePercentage(usage: number, limit: number): string {
	if (!(Number.isFinite(usage) && Number.isFinite(limit)) || limit <= 0) {
		return "—";
	}
	return `${Math.round((usage / limit) * 100)}%`;
}

/** Formats Autumn's Unix timestamp, which is expressed in milliseconds. */
export function formatResetDate(
	timestampMs?: number | null
): string | undefined {
	if (timestampMs == null || !Number.isFinite(timestampMs)) {
		return;
	}
	const date = new Date(timestampMs);
	if (Number.isNaN(date.getTime())) {
		return;
	}
	return resetDateFormatter.format(date);
}
