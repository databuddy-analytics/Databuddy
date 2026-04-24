import { AGENT_CREDIT_SCHEMA } from "@databuddy/shared/billing/credit-schema";
import {
	TOPUP_MAX_QUANTITY,
	TOPUP_TIERS,
} from "@databuddy/shared/billing/topup-math";
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

export const agent_web_search_calls = feature({
	id: "agent_web_search_calls",
	name: "Agent Web Search Calls",
	type: "metered",
	consumable: true,
});

export const agent_credits = feature({
	id: "agent_credits",
	name: "Agent Credits",
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
		{
			meteredFeatureId: "agent_web_search_calls",
			creditCost: AGENT_CREDIT_SCHEMA.webSearch,
		},
	],
});

export const free = plan({
	id: "free",
	name: "Free",
	addOn: false,
	autoEnable: true,
	items: [
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
		item({
			featureId: events.id,
			included: 1_000_000,
			price: {
				tiers: [
					{ to: 2_000_000, amount: 0.000_035 },
					{ to: 10_000_000, amount: 0.000_03 },
					{ to: 50_000_000, amount: 0.000_02 },
					{ to: 250_000_000, amount: 0.000_015 },
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
	id: "scale",
	name: "Scale",
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
 * Credit booster. Recurring add-on that grants 200 credits each month
 * on top of the base plan. Because these credits are paid for, they
 * roll over up to 400 and never expire until burned — unlike the
 * plan grants which reset monthly with no rollover.
 */
export const credits_booster = plan({
	id: "credits_booster",
	name: "Credit Booster",
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
	name: "Agent Credits",
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
