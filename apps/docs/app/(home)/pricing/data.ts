import {
	AGENT_CREDIT_ALLOWANCES,
	INVESTIGATION_ALLOWANCES,
	INVESTIGATION_USAGE,
	PLAN_COPY,
} from "@databuddy/shared/billing";

interface RawFeature {
	display: { singular: string };
	id: string;
	name: string;
}
export type RawItem =
	| {
			type: "price";
			interval: "month";
			price: number;
	  }
	| {
			type: "feature";
			feature_id: string;
			feature: RawFeature;
			included_usage: number | "inf";
			interval: "day" | "month" | null;
	  }
	| {
			type: "priced_feature";
			feature_id: string;
			feature: RawFeature;
			included_usage: number | "inf";
			interval: "month" | null;
			price?: number;
			tiers?: Array<{ to: number | "inf"; amount: number }>;
	  }
	| {
			type: "enterprise";
	  };

export interface RawPlan {
	agentCredits: { day?: number; month: number } | null;
	description?: string;
	id: string;
	items: RawItem[];
	name: string;
	positioning?: string | null;
}

const INVESTIGATION_FEATURE: RawFeature = {
	id: INVESTIGATION_USAGE.featureId,
	name: INVESTIGATION_USAGE.name,
	display: { singular: "investigation" },
};

function investigationAllowance(included: number): RawItem {
	return {
		type: "priced_feature",
		feature_id: INVESTIGATION_USAGE.featureId,
		feature: INVESTIGATION_FEATURE,
		included_usage: included,
		interval: "month",
		price: INVESTIGATION_USAGE.priceUsd,
	};
}

const EVENTS_FEATURE: RawFeature = {
	id: "events",
	name: "Events",
	display: { singular: "event" },
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
		agentCredits: AGENT_CREDIT_ALLOWANCES.free,
		name: "Free",
		description: PLAN_COPY.free.description,
		positioning: PLAN_COPY.free.positioning,
		items: [
			{
				type: "feature",
				feature_id: "events",
				feature: EVENTS_FEATURE,
				included_usage: 10_000,
				interval: "month",
			},
		],
	},
	{
		id: "hobby",
		agentCredits: AGENT_CREDIT_ALLOWANCES.hobby,
		name: "Hobby",
		description: PLAN_COPY.hobby.description,
		positioning: PLAN_COPY.hobby.positioning,
		items: [
			{
				type: "price",
				interval: "month",
				price: 9.99,
			},
			{
				type: "priced_feature",
				feature_id: "events",
				feature: EVENTS_FEATURE,
				included_usage: 30_000,
				interval: "month",
				tiers: EVENT_TIERS.map((tier) => ({
					...tier,
					to: tier.to === "inf" ? "inf" : tier.to + 30_000,
				})),
			},
		],
	},
	{
		id: "pro",
		agentCredits: AGENT_CREDIT_ALLOWANCES.pro,
		name: "Pro",
		description: PLAN_COPY.pro.description,
		positioning: PLAN_COPY.pro.positioning,
		items: [
			{
				type: "price",
				interval: "month",
				price: 49.99,
			},
			{
				type: "priced_feature",
				feature_id: "events",
				feature: EVENTS_FEATURE,
				included_usage: 1_000_000,
				interval: "month",
				tiers: EVENT_TIERS,
			},
		],
	},
	{
		id: "intelligence",
		agentCredits: AGENT_CREDIT_ALLOWANCES.intelligence,
		name: "Business",
		description: PLAN_COPY.intelligence.description,
		positioning: PLAN_COPY.intelligence.positioning,
		items: [
			investigationAllowance(INVESTIGATION_ALLOWANCES.intelligence),
			{
				type: "price",
				interval: "month",
				price: 299,
			},
			{
				type: "priced_feature",
				feature_id: "events",
				feature: EVENTS_FEATURE,
				included_usage: 2_000_000,
				interval: "month",
				tiers: EVENT_TIERS.filter(
					(tier) => tier.to === "inf" || tier.to > 2_000_000
				),
			},
		],
	},
	{
		id: "intelligence_scale",
		agentCredits: AGENT_CREDIT_ALLOWANCES.intelligence_scale,
		name: "Scale",
		description: PLAN_COPY.intelligence_scale.description,
		positioning: PLAN_COPY.intelligence_scale.positioning,
		items: [
			investigationAllowance(INVESTIGATION_ALLOWANCES.intelligence_scale),
			{
				type: "price",
				interval: "month",
				price: 799,
			},
			{
				type: "priced_feature",
				feature_id: "events",
				feature: EVENTS_FEATURE,
				included_usage: 6_000_000,
				interval: "month",
				tiers: EVENT_TIERS.filter(
					(tier) => tier.to === "inf" || tier.to > 6_000_000
				),
			},
		],
	},
	{
		id: "enterprise",
		agentCredits: null,
		name: "Enterprise",
		description: PLAN_COPY.enterprise.description,
		positioning: PLAN_COPY.enterprise.positioning,
		items: [{ type: "enterprise" }],
	},
];
