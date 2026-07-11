const usageNumberFormatter = new Intl.NumberFormat("en-US", {
	maximumFractionDigits: 1,
});

const resetDateFormatter = new Intl.DateTimeFormat("en-US", {
	dateStyle: "medium",
	timeStyle: "short",
	timeZone: "UTC",
});

export function formatUsageNumber(value: number): string {
	return usageNumberFormatter.format(value);
}

export function formatUsagePercentage(usage: number, limit: number): string {
	if (!(Number.isFinite(usage) && Number.isFinite(limit)) || limit <= 0) {
		return "—";
	}
	return `${Math.round((usage / limit) * 100)}%`;
}

export function formatResetDate(timestamp?: number | null): string | undefined {
	if (timestamp == null || !Number.isFinite(timestamp)) {
		return;
	}
	return resetDateFormatter.format(new Date(timestamp));
}
