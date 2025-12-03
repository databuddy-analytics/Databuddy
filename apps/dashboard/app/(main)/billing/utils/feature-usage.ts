import type { CustomerFeature } from "autumn-js";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

export type PricingTier = {
	to: number | "inf";
	amount: number;
};

export type FeatureUsage = {
	id: string;
	name: string;
	balance: number;
	limit: number;
	unlimited: boolean;
	hasExtraCredits: boolean;
	interval: string | null;
	resetAt: number | null;
	overage: {
		amount: number;
		cost: number;
	} | null;
};

function calculateOverageCost(
	overageAmount: number,
	tiers?: PricingTier[]
): number {
	if (overageAmount <= 0 || !tiers?.length) {
		return 0;
	}

	let remaining = overageAmount;
	let totalCost = 0;
	let processed = 0;

	for (const tier of tiers) {
		const tierLimit = tier.to === "inf" ? Number.POSITIVE_INFINITY : tier.to;
		const tierSize = tierLimit - processed;
		const unitsInTier = Math.min(remaining, tierSize);

		totalCost += unitsInTier * tier.amount;
		remaining -= unitsInTier;
		processed = tierLimit;

		if (remaining <= 0) {
			break;
		}
	}

	return totalCost;
}

export function calculateFeatureUsage(
	feature: CustomerFeature,
	planLimit?: number,
	pricingTiers?: PricingTier[]
): FeatureUsage {
	const balance = feature.balance ?? 0;
	const limit = planLimit ?? feature.included_usage ?? 0;

	const unlimited =
		feature.unlimited ||
		!Number.isFinite(balance) ||
		balance === Number.POSITIVE_INFINITY;

	const hasExtraCredits = !unlimited && balance > limit;

	// Overage when balance is negative
	const overageAmount = balance < 0 ? Math.abs(balance) : 0;
	const overage =
		overageAmount > 0
			? {
					amount: overageAmount,
					cost: calculateOverageCost(overageAmount, pricingTiers),
				}
			: null;

	return {
		id: feature.id,
		name: feature.name,
		balance,
		limit: unlimited
			? Number.POSITIVE_INFINITY
			: hasExtraCredits
				? balance
				: limit,
		unlimited,
		hasExtraCredits,
		interval: feature.interval ?? null,
		resetAt: feature.next_reset_at ?? null,
		overage,
	};
}

export function formatCompactNumber(num: number): string {
	if (num >= 1_000_000_000) {
		return `${(num / 1_000_000_000).toFixed(1)}B`;
	}
	if (num >= 1_000_000) {
		return `${(num / 1_000_000).toFixed(1)}M`;
	}
	if (num >= 10_000) {
		return `${(num / 1000).toFixed(0)}K`;
	}
	return num.toLocaleString();
}

const INTERVAL_LABELS: Record<string, string> = {
	day: "Daily",
	month: "Monthly",
	year: "Yearly",
	lifetime: "Lifetime",
};

export function getResetText(feature: FeatureUsage): string {
	if (feature.interval === "lifetime") {
		return "Never expires";
	}
	if (!feature.resetAt) {
		return "No reset scheduled";
	}

	const resetDate = dayjs(feature.resetAt);
	const daysUntil = resetDate.diff(dayjs(), "day");

	let resetString: string;
	if (daysUntil <= 0) {
		resetString = "Resets soon";
	} else if (daysUntil === 1) {
		resetString = "Resets tomorrow";
	} else if (daysUntil < 14) {
		resetString = `Resets in ${daysUntil}d`;
	} else {
		resetString = `Resets on ${resetDate.format("MMM D")}`;
	}

	const label = feature.interval ? INTERVAL_LABELS[feature.interval] : null;
	return label ? `${label} limit · ${resetString}` : resetString;
}
