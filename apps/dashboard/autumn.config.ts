import { AGENT_CREDIT_SCHEMA } from "./lib/credit-schema";
import { TOPUP_MAX_QUANTITY, TOPUP_TIERS } from "./lib/topup-math";
import {
	DATABUNNY_USAGE,
	INVESTIGATION_USAGE,
	LEGACY_SCALE_PLAN,
} from "@databuddy/shared/billing";
import { feature, item, plan } from "atmn";

export const events = feature({
	id: "events",
	name: "Events",
	type: "metered",
	consumable: true,
	eventNames: ["Events"],
});

export const agent_input_tokens = feature({
	id: "agent_input_tokens",
	name: "Agent Input Tokens",
	type: "metered",
	consumable: true,
});

export const agent_output_tokens = feature({
	id: "agent_output_tokens",
	name: "Agent Output Tokens",
	type: "metered",
	consumable: true,
});

export const agent_cache_read_tokens = feature({
	id: "agent_cache_read_tokens",
	name: "Agent Cache Read Tokens",
	type: "metered",
	consumable: true,
});

export const agent_cache_write_tokens = feature({
	id: "agent_cache_write_tokens",
	name: "Agent Cache Write Tokens",
	type: "metered",
	consumable: true,
});

export const agent_credits = feature({
	id: "agent_credits",
	name: DATABUNNY_USAGE.name,
	type: "credit_system",
	creditSchema: [
		{
			meteredFeatureId: "agent_input_tokens",
			creditCost: AGENT_CREDIT_SCHEMA.input,
		},
		{
			meteredFeatureId: "agent_output_tokens",
			creditCost: AGENT_CREDIT_SCHEMA.output,
		},
		{
			meteredFeatureId: "agent_cache_read_tokens",
			creditCost: AGENT_CREDIT_SCHEMA.cacheRead,
		},
		{
			meteredFeatureId: "agent_cache_write_tokens",
			creditCost: AGENT_CREDIT_SCHEMA.cacheWrite,
		},
	],
});

export const investigation_runs = feature({
	id: INVESTIGATION_USAGE.featureId,
	name: INVESTIGATION_USAGE.name,
	type: "metered",
	consumable: true,
});

const EVENT_OVERAGE_TIERS = [
	{ to: 2_000_000, amount: 0.000_035 },
	{ to: 10_000_000, amount: 0.000_03 },
	{ to: 50_000_000, amount: 0.000_02 },
	{ to: 250_000_000, amount: 0.000_015 },
	{ to: "inf" as const, amount: 0.000_01 },
];

function eventsOverageItem(included: number) {
	return item({
		featureId: events.id,
		included,
		price: {
			tiers: EVENT_OVERAGE_TIERS.map((tier) => ({
				to: tier.to,
				amount: tier.amount,
			})),
			tierBehaviour: "graduated",
			billingUnits: 1,
			billingMethod: "usage_based",
			interval: "month",
		},
	});
}

export const free = plan({
	id: "free",
	name: "Free",
	addOn: false,
	autoEnable: true,
	items: [
		item({ featureId: investigation_runs.id, included: 0 }),
		item({
			featureId: events.id,
			included: 10_000,
			reset: {
				interval: "month",
			},
		}),
		item({
			featureId: agent_credits.id,
			included: 10,
			reset: {
				interval: "month",
			},
		}),
	],
});

export const hobby = plan({
	id: "hobby",
	name: "Hobby",
	addOn: false,
	autoEnable: false,
	price: {
		amount: 9.99,
		interval: "month",
	},
	items: [
		item({ featureId: investigation_runs.id, included: 0 }),
		item({
			featureId: events.id,
			included: 30_000,
			price: {
				tiers: [
					{ to: 2_030_000, amount: 0.000_035 },
					{ to: 10_030_000, amount: 0.000_03 },
					{ to: 50_030_000, amount: 0.000_02 },
					{ to: 250_030_000, amount: 0.000_015 },
					{ to: "inf", amount: 0.000_01 },
				],
				tierBehaviour: "graduated",
				billingUnits: 1,
				billingMethod: "usage_based",
				interval: "month",
			},
		}),
		item({
			featureId: agent_credits.id,
			included: 20,
			reset: {
				interval: "month",
			},
		}),
		item({
			featureId: agent_credits.id,
			included: 1,
			reset: {
				interval: "day",
			},
		}),
	],
});

export const pro = plan({
	id: "pro",
	name: "Pro",
	addOn: false,
	autoEnable: false,
	price: {
		amount: 49.99,
		interval: "month",
	},
	items: [
		item({ featureId: investigation_runs.id, included: 0 }),
		eventsOverageItem(1_000_000),
		item({
			featureId: agent_credits.id,
			included: 350,
			reset: {
				interval: "month",
			},
		}),
		item({
			featureId: agent_credits.id,
			included: 5,
			reset: {
				interval: "day",
			},
		}),
	],
});

/*
 * Scale is being phased out — preserve current capability for existing
 * customers but do NOT add new feature items beyond what's necessary for
 * parity with Pro. No new bells, no overage tiers.
 */
export const scale = plan({
	id: LEGACY_SCALE_PLAN.id,
	name: LEGACY_SCALE_PLAN.name,
	addOn: false,
	autoEnable: false,
	price: {
		amount: 99.99,
		interval: "month",
	},
	items: [
		item({
			featureId: events.id,
			included: 3_000_000,
			price: {
				tiers: [
					{ to: 5_000_000, amount: 0.000_035 },
					{ to: 13_000_000, amount: 0.000_03 },
					{ to: 53_000_000, amount: 0.000_02 },
					{ to: 253_000_000, amount: 0.000_015 },
					{ to: "inf", amount: 0.000_01 },
				],
				tierBehaviour: "graduated",
				billingUnits: 1,
				billingMethod: "usage_based",
				interval: "month",
			},
		}),
		item({
			featureId: agent_credits.id,
			included: 500,
			reset: {
				interval: "month",
			},
		}),
	],
});

/*
 * New plan versions opt into fixed-price investigations with no bundled grant.
 * Existing agent_credits grants and prepaid prices remain for ordinary chat.
 * Do not migrate existing subscriptions: their attached versions retain legacy
 * investigation credit terms until they buy investigations or switch plan versions.
 *
 * These are invitation-only beta plans for now, so checkout stays contact-only
 * on the billing picker and public pricing docs. Keep them in the default
 * group so an attached beta plan replaces Free, Hobby, Pro, or legacy Scale
 * instead of stacking as a second base subscription.
 */
export const intelligence = plan({
	id: "intelligence",
	name: "Business",
	description: "An always-on product investigator for founders and engineers.",
	addOn: false,
	autoEnable: false,
	price: {
		amount: 299,
		interval: "month",
	},
	items: [
		item({ featureId: investigation_runs.id, included: 0 }),
		eventsOverageItem(2_000_000),
		item({
			featureId: agent_credits.id,
			included: 1500,
			reset: {
				interval: "month",
			},
		}),
		item({
			featureId: agent_credits.id,
			price: {
				tiers: TOPUP_TIERS.map((t) => ({ to: t.to, amount: t.amount })),
				tierBehaviour: "graduated",
				interval: "one_off",
				billingMethod: "prepaid",
				billingUnits: 1,
				maxPurchase: TOPUP_MAX_QUANTITY,
			},
		}),
	],
});

export const intelligence_scale = plan({
	id: "intelligence_scale",
	name: "Scale",
	description:
		"More investigation capacity for products with higher traffic and faster release cycles.",
	addOn: false,
	autoEnable: false,
	price: {
		amount: 799,
		interval: "month",
	},
	items: [
		item({ featureId: investigation_runs.id, included: 0 }),
		eventsOverageItem(10_000_000),
		item({
			featureId: agent_credits.id,
			included: 5000,
			reset: {
				interval: "month",
			},
		}),
		item({
			featureId: agent_credits.id,
			price: {
				tiers: TOPUP_TIERS.map((t) => ({ to: t.to, amount: t.amount })),
				tierBehaviour: "graduated",
				interval: "one_off",
				billingMethod: "prepaid",
				billingUnits: 1,
				maxPurchase: TOPUP_MAX_QUANTITY,
			},
		}),
	],
});

/*
 * Pulse plans are frozen — keep them in the catalog for any remaining
 * subscribers, but do not sell, restyle, or add features. New uptime
 * customers use Free / Hobby / Pro.
 */
export const pulse_hobby = plan({
	id: "pulse_hobby",
	name: "Pulse Hobby",
	group: "Pulse",
	addOn: false,
	autoEnable: false,
	price: {
		amount: 14.99,
		interval: "month",
	},
	items: [
		item({
			featureId: events.id,
			included: 10_000,
			reset: {
				interval: "month",
			},
		}),
	],
});

export const pulse_pro = plan({
	id: "pulse_pro",
	name: "Pulse Pro",
	group: "Pulse",
	addOn: false,
	autoEnable: false,
	price: {
		amount: 49.99,
		interval: "month",
	},
	items: [
		item({
			featureId: events.id,
			included: 100_000,
			reset: {
				interval: "month",
			},
		}),
	],
});

/*
 * Credit booster. Recurring add-on for analytics plans only — Intelligence
 * plans already include on-plan prepaid top-up. Grants 200 credits each
 * month on top of the base plan. Because these credits are paid for, they
 * roll over up to 400 and never expire until burned — unlike the plan
 * grants which reset monthly with no rollover.
 */
export const credits_booster = plan({
	id: "credits_booster",
	name: "Monthly AI credits",
	description:
		"200 additional AI credits every month for chat and legacy billing terms.",
	addOn: true,
	autoEnable: false,
	price: {
		amount: 19,
		interval: "month",
	},
	items: [
		item({
			featureId: agent_credits.id,
			included: 200,
			reset: {
				interval: "month",
			},
			rollover: {
				max: 400,
				expiryDurationType: "forever",
			},
		}),
	],
});

/*
 * Agent credit top-up. Prepaid one-off SKU with graduated volume
 * discounts — user picks any quantity at checkout (e.g. 164 credits).
 * Purchased credits stack into the shared agent_credits pool and
 * persist until burned (no reset). Plan grants reset monthly; these
 * paid credits do not.
 */
export const credits_topup = plan({
	id: "credits_topup",
	name: "Additional AI credits",
	description:
		"Prepaid AI credits for chat and legacy billing terms; available until used.",
	addOn: true,
	autoEnable: false,
	items: [
		item({
			featureId: agent_credits.id,
			price: {
				tiers: TOPUP_TIERS.map((t) => ({ to: t.to, amount: t.amount })),
				tierBehaviour: "graduated",
				interval: "one_off",
				billingMethod: "prepaid",
				billingUnits: 1,
				maxPurchase: TOPUP_MAX_QUANTITY,
			},
		}),
	],
});

// Separate prepaid balance. No reset or expiry; never convert agent_credits.
export const investigations_topup = plan({
	id: INVESTIGATION_USAGE.topupPlanId,
	name: "Additional investigations",
	description: INVESTIGATION_USAGE.description,
	addOn: true,
	autoEnable: false,
	items: [
		item({
			featureId: investigation_runs.id,
			price: {
				amount: INVESTIGATION_USAGE.priceUsd,
				interval: "one_off",
				billingMethod: "prepaid",
				billingUnits: 1,
				maxPurchase: INVESTIGATION_USAGE.maxPurchase,
			},
		}),
	],
});
