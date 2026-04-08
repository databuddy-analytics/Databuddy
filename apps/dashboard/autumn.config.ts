import { feature, item, plan } from "atmn";

/*
 * Features
 *
 * Types:
 * - metered consumable: usage that gets drawn down (events, agent tokens)
 * - metered non-consumable: countable resources (monitors, status pages)
 * - boolean: gated capability, no quantity
 * - credit_system: visible pool that auto-deducts from underlying meters
 *
 * Plan-tier gating for funnels/goals/feature_flags/target_groups/retention/
 * error_tracking/team_roles lives in packages/shared/src/types/features.ts.
 * Autumn only meters what it actually bills.
 */

// Analytics core ------------------------------------------------------------
export const events = feature({
	id: "events",
	name: "Events",
	type: "metered",
	consumable: true,
	eventNames: ["Events"],
});

// Team / collaboration -----------------------------------------------------
export const sso = feature({
	id: "sso",
	name: "Single Sign On",
	type: "boolean",
});

// Pulse — uptime monitoring + status pages ---------------------------------
export const monitors = feature({
	id: "monitors",
	name: "Uptime Monitors",
	type: "metered",
	consumable: false,
});

// Gates sub-5-minute check intervals. Only Pulse plans unlock 1-min checks.
export const uptime_minute_checks = feature({
	id: "uptime_minute_checks",
	name: "Sub-5-Minute Uptime Checks",
	type: "boolean",
});

export const status_pages = feature({
	id: "status_pages",
	name: "Status Pages",
	type: "metered",
	consumable: false,
});

export const status_page_custom_branding = feature({
	id: "status_page_custom_branding",
	name: "Status Page Custom Branding",
	type: "boolean",
});

export const status_page_custom_domain = feature({
	id: "status_page_custom_domain",
	name: "Status Page Custom Domain",
	type: "boolean",
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
		{ meteredFeatureId: "agent_input_tokens", creditCost: 0.000_72 },
		{ meteredFeatureId: "agent_output_tokens", creditCost: 0.0036 },
		{ meteredFeatureId: "agent_cache_read_tokens", creditCost: 0.000_072 },
		{ meteredFeatureId: "agent_cache_write_tokens", creditCost: 0.001_44 },
		{ meteredFeatureId: "agent_web_search_calls", creditCost: 5 },
	],
});

export const alarms = feature({
	id: "alarms",
	name: "Alarms",
	type: "metered",
	consumable: false,
	archived: true,
});

export const error_tracking = feature({
	id: "error_tracking",
	name: "Error Tracking",
	type: "boolean",
	archived: true,
});

export const goals = feature({
	id: "goals",
	name: "Goals",
	type: "metered",
	consumable: false,
	archived: true,
});

export const feature_flags = feature({
	id: "feature_flags",
	name: "Feature Flags",
	type: "metered",
	consumable: false,
	archived: true,
});

export const funnels = feature({
	id: "funnels",
	name: "Funnels",
	type: "metered",
	consumable: false,
	archived: true,
});

export const rbac = feature({
	id: "rbac",
	name: "Role Based Access Control",
	type: "boolean",
	archived: true,
});

export const seats = feature({
	id: "seats",
	name: "Seats",
	type: "metered",
	consumable: false,
	archived: true,
});

export const retention_analytics = feature({
	id: "retention_analytics",
	name: "Retention Analytics",
	type: "boolean",
	archived: true,
});

export const target_groups = feature({
	id: "target_groups",
	name: "Target Groups",
	type: "metered",
	consumable: false,
	archived: true,
});

export const webhook_alert_destinations = feature({
	id: "webhook_alert_destinations",
	name: "Webhook & Slack Alert Destinations",
	type: "boolean",
	archived: true,
});

// Plans ====================================================================
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
			included: 500,
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
			included: 2500,
			reset: {
				interval: "month",
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
			included: 25_000,
			price: {
				tiers: [
					{ to: 50_000, amount: 0.0012 },
					{ to: 250_000, amount: 0.001 },
					{ to: "inf", amount: 0.0008 },
				],
				tierBehaviour: "graduated",
				billingUnits: 1,
				billingMethod: "usage_based",
				interval: "month",
			},
			rollover: {
				max: 25_000,
				expiryDurationType: "month",
				expiryDurationLength: 1,
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
			included: 25_000,
			reset: {
				interval: "month",
			},
		}),
	],
});

export const sso_plan = plan({
	id: "sso",
	name: "SSO",
	addOn: true,
	autoEnable: false,
	price: {
		amount: 100,
		interval: "month",
	},
	items: [
		item({
			featureId: sso.id,
		}),
	],
});

// Pulse plans — uptime monitoring focused, larger monitor counts ----------
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
			featureId: monitors.id,
			included: 25,
		}),
		item({
			featureId: uptime_minute_checks.id,
		}),
		item({
			featureId: status_pages.id,
			included: 3,
		}),
		item({
			featureId: status_page_custom_branding.id,
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
			featureId: monitors.id,
			included: 150,
		}),
		item({
			featureId: uptime_minute_checks.id,
		}),
		item({
			featureId: status_pages.id,
			included: 10,
		}),
		item({
			featureId: status_page_custom_branding.id,
		}),
		item({
			featureId: status_page_custom_domain.id,
		}),
	],
});
