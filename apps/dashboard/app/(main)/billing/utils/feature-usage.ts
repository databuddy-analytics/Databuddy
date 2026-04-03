import dayjs from "@/lib/dayjs";
import { formatLocaleNumber } from "@/lib/format-locale-number";

export interface PricingTier {
	amount: number;
	to: number | "inf";
}

export interface BalanceLike {
	breakdown?: Array<{
		reset?: { interval?: string } | null;
		price?: {
			tiers?: Array<{ to?: number | "inf" | null; amount?: number }>;
		} | null;
	}> | null;
	feature?: { name?: string } | null;
	featureId: string;
	granted: number;
	nextResetAt?: number | null;
	remaining: number;
	unlimited: boolean;
}

export interface FeatureUsage {
	balance: number;
	hasExtraCredits: boolean;
	hasPricedOverage: boolean;
	id: string;
	includedLimit: number;
	interval: string | null;
	limit: number;
	name: string;
	overage: {
		amount: number;
		cost: number;
	} | null;
	pricingTiers: PricingTier[];
	resetAt: number | null;
	unlimited: boolean;
}

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
	bal: BalanceLike,
	pricingTiers?: PricingTier[]
): FeatureUsage {
	const remaining = bal.remaining;
	const limit = bal.granted;

	const unlimited =
		bal.unlimited ||
		!Number.isFinite(remaining) ||
		remaining === Number.POSITIVE_INFINITY;

	const hasExtraCredits = !unlimited && remaining > limit;

	const overageAmount = remaining < 0 ? Math.abs(remaining) : 0;
	const hasPricedOverage = pricingTiers?.length
		? pricingTiers.length > 0
		: (bal.breakdown?.some((b) => b.price?.tiers?.length) ?? false);
	const effectiveTiers =
		pricingTiers ??
		bal.breakdown?.at(0)?.price?.tiers?.map((t) => ({
			to: (t.to ?? "inf") as number | "inf",
			amount: t.amount ?? 0,
		})) ??
		[];
	const overage =
		overageAmount > 0
			? {
					amount: overageAmount,
					cost: calculateOverageCost(overageAmount, effectiveTiers),
				}
			: null;

	const effectiveLimit = unlimited
		? Number.POSITIVE_INFINITY
		: hasExtraCredits
			? remaining
			: limit;

	const interval = bal.breakdown?.at(0)?.reset?.interval ?? null;

	return {
		id: bal.featureId,
		name: bal.feature?.name ?? bal.featureId,
		balance: remaining,
		limit: effectiveLimit,
		includedLimit: unlimited ? Number.POSITIVE_INFINITY : limit,
		unlimited,
		hasExtraCredits,
		hasPricedOverage,
		pricingTiers: effectiveTiers,
		interval,
		resetAt: bal.nextResetAt ?? null,
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
	return formatLocaleNumber(num);
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
