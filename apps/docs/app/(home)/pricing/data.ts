import {
	INVESTIGATION_ALLOWANCES,
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
	chatIncluded: boolean | null;
	id: string;
	items: RawItem[];
	name: string;
}

const INVESTIGATION_FEATURE: RawFeature = {
	id: INVESTIGATION_USAGE.featureId,
	name: INVESTIGATION_USAGE.name,
	type: "single_use",
	display: { singular: "investigation", plural: INVESTIGATION_USAGE.unit },
};

function investigationAllowance(included: number): RawItem {
	return {
		type: "priced_feature",
		feature_id: INVESTIGATION_USAGE.featureId,
		feature_type: "single_use",
		feature: INVESTIGATION_FEATURE,
		included_usage: included,
		interval: "month",
		price: INVESTIGATION_USAGE.priceUsd,
		usage_model: "pay_per_use",
	};
}

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
		chatIncluded: true,
		name: "Free",
		items: [
			{
				type: "feature",
				feature_id: "events",
				feature_type: "single_use",
				feature: EVENTS_FEATURE,
				included_usage: 10_000,
				interval: "month",
			},
		],
	},
	{
		id: "hobby",
		chatIncluded: true,
		name: "Hobby",
		items: [
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
		],
	},
	{
		id: "pro",
		chatIncluded: true,
		name: "Pro",
		items: [
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
		],
	},
	{
		id: "intelligence",
		chatIncluded: true,
		name: "Business",
		items: [
			investigationAllowance(INVESTIGATION_ALLOWANCES.intelligence),
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
		],
	},
	{
		id: "intelligence_scale",
		chatIncluded: true,
		name: "Scale",
		items: [
			investigationAllowance(INVESTIGATION_ALLOWANCES.intelligence_scale),
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
		],
	},
	{
		id: "enterprise",
		chatIncluded: null,
		name: "Enterprise",
		items: [{ type: "enterprise" }],
	},
];
