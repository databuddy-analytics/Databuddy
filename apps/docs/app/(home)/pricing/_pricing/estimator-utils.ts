export function formatMoney(value: number): string {
	return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatInteger(value: number): string {
	return value.toLocaleString();
}

export function formatCompact(value: number): string {
	return new Intl.NumberFormat(undefined, {
		notation: 'compact',
		maximumFractionDigits: 1,
	}).format(value);
}

export function estimateTieredOverageCostFromTiers(
	events: number,
	tiers: Array<{ to: number | 'inf'; amount: number }>
): number {
	let cost = 0;
	let remaining = events;
	let prevMax = 0;
	for (const tier of tiers) {
		const max = tier.to === 'inf' ? Number.POSITIVE_INFINITY : Number(tier.to);
		const tierEvents = Math.max(Math.min(remaining, max - prevMax), 0);
		if (tierEvents > 0) {
			cost += tierEvents * tier.amount;
			remaining -= tierEvents;
		}
		prevMax = max;
		if (remaining <= 0) {
			break;
		}
	}
	return cost;
}
