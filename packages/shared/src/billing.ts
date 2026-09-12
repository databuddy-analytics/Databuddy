import { number } from "zod";

export const DATABUNNY_USAGE = {
	description:
		"AI credits pay for ordinary Databunny chat and investigations on legacy billing terms. Existing credit balances and allowances keep their value; they are not converted into $1 investigations.",
	name: "AI credits",
	pausedActivity: "Databunny chat and investigations on legacy billing terms",
	unit: "AI credits",
	upgradeMessage: "Add AI credits or upgrade your plan",
} as const;

export const INVESTIGATION_USAGE = {
	featureId: "investigation_runs",
	name: "Investigations",
	unit: "investigations",
	priceUsd: 1,
	topupPlanId: "investigations_topup",
	maxPurchase: 1000,
	description:
		"$1 per completed investigation. Clarifications of the same question and verification after applying a proposed repair are included. New questions and separate fresh analysis are new investigations.",
} as const;

export const LEGACY_SCALE_PLAN = {
	id: "scale",
	name: "Enterprise",
} as const;

export function getInvestigationBillingFeatureId(
	balances: object | null | undefined
) {
	return balances && Object.hasOwn(balances, INVESTIGATION_USAGE.featureId)
		? INVESTIGATION_USAGE.featureId
		: "agent_credits";
}

export const investigationQuantitySchema = number()
	.int()
	.min(1)
	.max(INVESTIGATION_USAGE.maxPurchase);
