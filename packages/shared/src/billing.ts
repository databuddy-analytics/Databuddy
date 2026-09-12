export const DATABUNNY_USAGE = {
	description:
		"Investigation credits pay for the work Databunny performs. Simple checks use fewer credits; deeper investigations, replies, and rechecks use more.",
	name: "Investigation credits",
	pausedActivity: "Databunny questions and investigations",
	unit: "investigation credits",
	upgradeMessage: "Add investigation credits or upgrade your plan",
} as const;

export const INVESTIGATION_USAGE = {
	featureId: "investigation_runs",
	name: "Investigations",
	unit: "investigations",
	priceUsd: 1,
	topupPlanId: "investigations_topup",
	maxPurchase: 1000,
	description:
		"$1 per completed investigation. Clarifications of the same question are included; new questions and fresh analysis are separate investigations.",
} as const;

export const LEGACY_SCALE_PLAN = {
	id: "scale",
	name: "Enterprise",
} as const;
