import {
	DATABUNNY_USAGE,
	INVESTIGATION_USAGE,
} from "@databuddy/shared/billing";

interface FeatureDisplay {
	plural: string;
	singular: string;
}
interface RawFeature {
	display: FeatureDisplay;
	id: string;
	name: string;
	type: "single_use";
}
export type RawItem =
	| {
			type: "price";
			interval: "month";
			price: number;
			feature_id: null;
			feature: null;
	  }
	| {
			type: "feature";
			feature_id: string;
			feature_type: "single_use";
			feature: RawFeature;
			included_usage: number | "inf";
			interval: "day" | "month" | null;
	  }
	| {
			type: "priced_feature";
			feature_id: string;
			feature_type: "single_use";
			feature: RawFeature;
			included_usage: number | "inf";
			interval: "month" | null;
			price?: number;
			tiers?: Array<{ to: number | "inf"; amount: number }>;
			usage_model: "pay_per_use";
	  }
	| {
			type: "enterprise";
	  };

export interface RawPlan {
	id: string;
	items: RawItem[];
	name: string;
}

const AGENT_CREDITS_FEATURE: RawFeature = {
	id: "agent_credits",
	name: DATABUNNY_USAGE.name,
	type: "single_use",
	display: {
		singular: "AI credit",
		plural: DATABUNNY_USAGE.unit,
	},
};

const INVESTIGATION_ITEM: RawItem = {
	type: "feature",
	feature_id: INVESTIGATION_USAGE.featureId,
	feature_type: "single_use",
	feature: {
		id: INVESTIGATION_USAGE.featureId,
		name: INVESTIGATION_USAGE.name,
		type: "single_use",
		display: { singular: "investigation", plural: INVESTIGATION_USAGE.unit },
	},
	included_usage: 0,
	interval: null,
};

const EVENTS_FEATURE: RawFeature = {
	id: "events",
	name: "Events",
	type: "single_use",
	display: { singular: "event", plural: "events" },
};

const EVENT_TIERS = [
	{ to: 2_000_000, amount: 0.000_035 },
	{ to: 10_000_000, amount: 0.000_03 },
	{ to: 50_000_000, amount: 0.000_02 },
	{ to: 250_000_000, amount: 0.000_015 },
	{ to: "inf" as const, amount: 0.000_01 },
];

export const RAW_PLANS: RawPlan[] = [
	{
		id: "free",
		name: "Free",
		items: [
			INVESTIGATION_ITEM,
			{
				type: "feature",
				feature_id: "events",
				feature_type: "single_use",
				feature: EVENTS_FEATURE,
				included_usage: 10_000,
				interval: "month",
			},
			{
				type: "feature",
				feature_id: "agent_credits",
				feature_type: "single_use",
				feature: AGENT_CREDITS_FEATURE,
				included_usage: 10,
				interval: "month",
			},
		],
	},
	{
		id: "hobby",
		name: "Hobby",
		items: [
			INVESTIGATION_ITEM,
			{
				type: "price",
				interval: "month",
				price: 9.99,
				feature_id: null,
				feature: null,
			},
			{
				type: "priced_feature",
				feature_id: "events",
				feature_type: "single_use",
				feature: EVENTS_FEATURE,
				included_usage: 30_000,
				interval: "month",
				tiers: EVENT_TIERS.map((tier) => ({
					...tier,
					to: tier.to === "inf" ? "inf" : tier.to + 30_000,
				})),
				usage_model: "pay_per_use",
			},
			{
				type: "feature",
				feature_id: "agent_credits",
				feature_type: "single_use",
				feature: AGENT_CREDITS_FEATURE,
				included_usage: 20,
				interval: "month",
			},
			{
				type: "feature",
				feature_id: "agent_credits",
				feature_type: "single_use",
				feature: AGENT_CREDITS_FEATURE,
				included_usage: 1,
				interval: "day",
			},
		],
	},
	{
		id: "pro",
		name: "Pro",
		items: [
			INVESTIGATION_ITEM,
			{
				type: "price",
				interval: "month",
				price: 49.99,
				feature_id: null,
				feature: null,
			},
			{
				type: "priced_feature",
				feature_id: "events",
				feature_type: "single_use",
				feature: EVENTS_FEATURE,
				included_usage: 1_000_000,
				interval: "month",
				tiers: EVENT_TIERS,
				usage_model: "pay_per_use",
			},
			{
				type: "feature",
				feature_id: "agent_credits",
				feature_type: "single_use",
				feature: AGENT_CREDITS_FEATURE,
				included_usage: 350,
				interval: "month",
			},
			{
				type: "feature",
				feature_id: "agent_credits",
				feature_type: "single_use",
				feature: AGENT_CREDITS_FEATURE,
				included_usage: 5,
				interval: "day",
			},
		],
	},
	{
		id: "intelligence",
		name: "Business",
		items: [
			INVESTIGATION_ITEM,
			{
				type: "price",
				interval: "month",
				price: 299,
				feature_id: null,
				feature: null,
			},
			{
				type: "priced_feature",
				feature_id: "events",
				feature_type: "single_use",
				feature: EVENTS_FEATURE,
				included_usage: 2_000_000,
				interval: "month",
				tiers: EVENT_TIERS.filter(
					(tier) => tier.to === "inf" || tier.to > 2_000_000
				),
				usage_model: "pay_per_use",
			},
			{
				type: "feature",
				feature_id: "agent_credits",
				feature_type: "single_use",
				feature: AGENT_CREDITS_FEATURE,
				included_usage: 1500,
				interval: "month",
			},
		],
	},
	{
		id: "intelligence_scale",
		name: "Scale",
		items: [
			INVESTIGATION_ITEM,
			{
				type: "price",
				interval: "month",
				price: 799,
				feature_id: null,
				feature: null,
			},
			{
				type: "priced_feature",
				feature_id: "events",
				feature_type: "single_use",
				feature: EVENTS_FEATURE,
				included_usage: 10_000_000,
				interval: "month",
				tiers: EVENT_TIERS.filter(
					(tier) => tier.to === "inf" || tier.to > 10_000_000
				),
				usage_model: "pay_per_use",
			},
			{
				type: "feature",
				feature_id: "agent_credits",
				feature_type: "single_use",
				feature: AGENT_CREDITS_FEATURE,
				included_usage: 5000,
				interval: "month",
			},
		],
	},
	{
		id: "enterprise",
		name: "Enterprise",
		items: [{ type: "enterprise" }],
	},
];

export const INTELLIGENCE_PLAN_TABLE_IDS = [
	"intelligence",
	"intelligence_scale",
] as const;
