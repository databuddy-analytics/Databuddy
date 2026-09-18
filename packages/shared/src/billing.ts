import { number } from "zod";

export const DATABUNNY_USAGE = {
	description:
		"AI credits pay for Databunny chat. Investigations are billed separately at $1 per completed investigation and do not draw from AI credits.",
	name: "AI credits",
	pausedActivity: "Databunny chat",
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
		"Business and Scale include monthly investigations. Extras cost $1 per completed investigation.",
} as const;

export function hasInvestigationAllowance(
	balance:
		| { granted: number; unlimited: boolean; overageAllowed: boolean }
		| null
		| undefined
): boolean {
	return Boolean(
		balance &&
			(balance.unlimited || balance.overageAllowed || balance.granted > 0)
	);
}

export const INVESTIGATION_ALLOWANCES = {
	intelligence: 100,
	intelligence_scale: 250,
} as const;

export const PLAN_COPY = {
	free: {
		description: "For personal sites and trying Databuddy out.",
		positioning: null,
	},
	hobby: {
		description: "For solo builders and side projects.",
		positioning: null,
	},
	pro: {
		description: "For growing teams shipping production apps.",
		positioning: null,
	},
	intelligence: {
		description:
			"An always-on product investigator for founders and engineers.",
		positioning: "Recommended",
	},
	intelligence_scale: {
		description:
			"Adds SSO, audit logs, and onboarding for compliance-bound teams.",
		positioning: null,
	},
	enterprise: {
		description: "Custom volume, security review, and SLAs.",
		positioning: null,
	},
} as const satisfies Record<
	string,
	{ description: string; positioning: string | null }
>;

export const AGENT_CREDIT_ALLOWANCES = {
	free: { month: 10 },
	hobby: { month: 20, day: 1 },
	pro: { month: 350, day: 5 },
	scale: { month: 500 },
	intelligence: { month: 1500 },
	intelligence_scale: { month: 3000 },
} as const satisfies Record<string, { day?: number; month: number }>;

export const SCALE_PLAN = {
	id: "scale",
	name: "Enterprise",
} as const;

export const investigationQuantitySchema = number()
	.int()
	.min(1)
	.max(INVESTIGATION_USAGE.maxPurchase);
