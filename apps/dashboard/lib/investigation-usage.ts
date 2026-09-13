import type { UseCustomerResult } from "autumn-js/react";

type Balance = NonNullable<UseCustomerResult["data"]>["balances"][string];

export function summarizeInvestigationBalance(
	balance: Balance | null | undefined
) {
	const breakdown = balance?.breakdown ?? [];
	const monthly = breakdown
		.filter(
			(entry) =>
				entry.reset?.interval === "month" &&
				(entry.reset.intervalCount ?? 1) === 1
		)
		.map((entry) => ({
			id: entry.id,
			included: entry.includedGrant,
			used: Math.min(entry.includedGrant, Math.max(0, entry.usage)),
			remaining: Math.max(0, Math.min(entry.includedGrant, entry.remaining)),
			resetsAt: entry.reset?.resetsAt ?? null,
		}));
	const prepaid = breakdown
		.filter(
			(entry) =>
				entry.prepaidGrant > 0 &&
				(!entry.reset || entry.reset.interval === "one_off")
		)
		.map((entry) => ({
			id: entry.id,
			remaining: Math.max(0, entry.remaining),
			expiresAt: entry.expiresAt,
		}));
	const usageBased = breakdown.filter(
		(entry) => entry.price?.billingMethod === "usage_based"
	);
	return {
		monthly,
		prepaid,
		payAsYouGo: balance?.overageAllowed === true || usageBased.length > 0,
		overage:
			breakdown.length > 0
				? usageBased.reduce(
						(total, entry) => total + Math.max(0, -entry.remaining),
						0
					)
				: balance?.overageAllowed
					? Math.max(0, -balance.remaining)
					: 0,
		overageAllowed: balance?.overageAllowed === true,
		canUse:
			balance?.unlimited === true ||
			balance?.overageAllowed === true ||
			(balance?.remaining ?? 0) >= 1,
	};
}
