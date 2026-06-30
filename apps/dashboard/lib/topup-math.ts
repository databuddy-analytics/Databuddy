export interface TopupTier {
	amount: number;
	to: number | "inf";
}

export const TOPUP_TIERS: readonly TopupTier[] = [
	{ to: 100, amount: 0.12 },
	{ to: 1000, amount: 0.1 },
	{ to: 5000, amount: 0.08 },
	{ to: "inf", amount: 0.0654 },
];

export const TOPUP_MIN_QUANTITY = 10;
export const TOPUP_MAX_PURCHASE_USD = 5000;
export const TOPUP_MAX_QUANTITY = maxTopupQuantityForAmount(
	TOPUP_MAX_PURCHASE_USD
);

export const TOPUP_PRODUCT_ID = "credits_topup";
export const TOPUP_FEATURE_ID = "agent_credits";

function tierTop(tier: TopupTier): number {
	return tier.to === "inf" ? Number.POSITIVE_INFINITY : tier.to;
}

export function maxTopupQuantityForAmount(
	maxAmount: number,
	tiers: readonly TopupTier[] = TOPUP_TIERS
): number {
	if (maxAmount <= 0) {
		return 0;
	}

	let quantity = 0;
	let total = 0;
	let previousTo = 0;

	for (const tier of tiers) {
		const top = tierTop(tier);
		const span = top - previousTo;
		const remainingBudget = maxAmount - total;

		if (remainingBudget <= 0) {
			break;
		}

		const affordableUnits = Math.floor((remainingBudget + 1e-9) / tier.amount);
		const units = Math.min(span, affordableUnits);
		quantity += units;
		total += units * tier.amount;
		previousTo = top;

		if (units < span) {
			break;
		}
	}

	return quantity;
}

export function calculateTopupCost(
	quantity: number,
	tiers: readonly TopupTier[] = TOPUP_TIERS
): number {
	if (quantity <= 0) {
		return 0;
	}
	let remaining = quantity;
	let previousTo = 0;
	let total = 0;
	for (const tier of tiers) {
		const top = tierTop(tier);
		const span = top - previousTo;
		const units = Math.min(remaining, span);
		total += units * tier.amount;
		remaining -= units;
		previousTo = top;
		if (remaining <= 0) {
			break;
		}
	}
	return Number.parseFloat(total.toFixed(2));
}

export function blendedRatePerCredit(
	quantity: number,
	tiers: readonly TopupTier[] = TOPUP_TIERS
): number {
	if (quantity <= 0) {
		return tiers[0]?.amount ?? 0;
	}
	return calculateTopupCost(quantity, tiers) / quantity;
}

export interface TierBoundary {
	currentRate: number;
	nextBoundary: number | null;
	nextRate: number | null;
}

export function getTierBoundary(
	quantity: number,
	tiers: readonly TopupTier[] = TOPUP_TIERS
): TierBoundary {
	for (let i = 0; i < tiers.length; i++) {
		const tier = tiers[i];
		if (quantity <= tierTop(tier)) {
			const next = tiers[i + 1] ?? null;
			return {
				currentRate: tier.amount,
				nextRate: next?.amount ?? null,
				nextBoundary: tier.to === "inf" ? null : tier.to,
			};
		}
	}
	const last = tiers.at(-1);
	return {
		currentRate: last?.amount ?? 0,
		nextRate: null,
		nextBoundary: null,
	};
}

export interface TierNudge {
	nextRate: number;
	unitsUntilNextTier: number;
}

export function nextTierNudge(
	quantity: number,
	tiers: readonly TopupTier[] = TOPUP_TIERS
): TierNudge | null {
	const info = getTierBoundary(quantity, tiers);
	if (info.nextBoundary === null || info.nextRate === null) {
		return null;
	}
	const unitsUntilNextTier = Math.max(
		0,
		info.nextBoundary - Math.floor(quantity) + 1
	);
	if (unitsUntilNextTier <= 0) {
		return null;
	}
	return { unitsUntilNextTier, nextRate: info.nextRate };
}

export const TOPUP_SLIDER_BOUNDARIES: readonly number[] = [
	TOPUP_MIN_QUANTITY,
	100,
	1000,
	5000,
	TOPUP_MAX_QUANTITY,
];

export function quantityFromSliderFraction(fraction: number): number {
	const f = Math.max(0, Math.min(1, fraction));
	const segments = TOPUP_SLIDER_BOUNDARIES.length - 1;
	const scaled = f * segments;
	const idx = Math.min(segments - 1, Math.floor(scaled));
	const within = scaled - idx;
	const lo = TOPUP_SLIDER_BOUNDARIES[idx];
	const hi = TOPUP_SLIDER_BOUNDARIES[idx + 1];
	return Math.round(lo + within * (hi - lo));
}

export function sliderFractionFromQuantity(quantity: number): number {
	const q = Math.max(
		TOPUP_MIN_QUANTITY,
		Math.min(TOPUP_MAX_QUANTITY, quantity)
	);
	const segments = TOPUP_SLIDER_BOUNDARIES.length - 1;
	for (let i = 0; i < segments; i++) {
		const lo = TOPUP_SLIDER_BOUNDARIES[i];
		const hi = TOPUP_SLIDER_BOUNDARIES[i + 1];
		if (q <= hi) {
			return (i + (q - lo) / (hi - lo)) / segments;
		}
	}
	return 1;
}

export function keyboardStep(quantity: number): number {
	if (quantity < 100) {
		return 1;
	}
	if (quantity < 1000) {
		return 10;
	}
	if (quantity < 5000) {
		return 100;
	}
	return 1000;
}
