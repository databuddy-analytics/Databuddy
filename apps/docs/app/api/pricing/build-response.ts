import {
	DATABUNNY_CHAT,
	INVESTIGATION_ALLOWANCES,
	INVESTIGATION_USAGE,
} from "@databuddy/shared/billing";
import {
	PLAN_CAPABILITIES,
	PLAN_IDS,
	type PlanId,
} from "@databuddy/shared/types/features";
import { RAW_PLANS } from "@/app/(home)/pricing/data";

const APP_SIGNUP = "https://app.databuddy.cc/register";

interface PricingFeature {
	id: string;
	included: boolean | number | "unlimited";
	interval: "day" | "month" | null;
	name: string;
	overageBillingInterval?: "month";
	overagePricePerUnit?: number;
	overageTierBasis?: "total_monthly_events";
	overageTiers?: Array<{ upTo: number | "unlimited"; pricePerUnit: number }>;
	type: "boolean" | "metered";
}
const PUBLIC_DOCS_ORIGIN =
	process.env.NEXT_PUBLIC_SITE_URL ||
	process.env.SITE_URL ||
	"https://www.databuddy.cc";

function toIncludedUsage(usage: number | "inf"): number | "unlimited" {
	if (usage === "inf") {
		return "unlimited";
	}
	return usage;
}

function mapRawPlans() {
	return RAW_PLANS.map((plan) => {
		const priceItem = plan.items.find((i) => i.type === "price") as
			| Extract<(typeof plan.items)[number], { type: "price" }>
			| undefined;

		const billingModel =
			plan.id === "enterprise"
				? ("custom" as const)
				: plan.id === "free"
					? ("free" as const)
					: ("subscription" as const);

		const pricePerMonth =
			plan.id === "enterprise"
				? 0
				: plan.id === "free"
					? 0
					: (priceItem?.price ?? 0);

		const features: PricingFeature[] = plan.items
			.filter(
				(
					i
				): i is Extract<
					(typeof plan.items)[number],
					{ type: "feature" | "priced_feature" }
				> => i.type === "feature" || i.type === "priced_feature"
			)
			.map((f) => ({
				id: f.feature_id,
				name: f.feature.name,
				type: "metered" as const,
				included: toIncludedUsage(f.included_usage),
				interval: f.interval,
				...(f.type === "priced_feature" && typeof f.price === "number"
					? {
							overagePricePerUnit: f.price,
							overageBillingInterval: "month" as const,
						}
					: {}),
				...(f.type === "priced_feature" && f.tiers
					? {
							overageTierBasis: "total_monthly_events" as const,
							overageTiers: f.tiers.map((t) => ({
								upTo: t.to === "inf" ? ("unlimited" as const) : t.to,
								pricePerUnit: t.amount,
							})),
						}
					: {}),
			}));
		if (plan.chatIncluded !== null) {
			features.unshift({
				id: DATABUNNY_CHAT.featureId,
				name: DATABUNNY_CHAT.name,
				type: "boolean",
				included: plan.chatIncluded,
				interval: null,
			});
		}

		return {
			id: plan.id,
			name: plan.name,
			billingModel,
			pricePerMonth,
			features,
		};
	});
}

function publicEntitlement(planId: PlanId) {
	const { investigations, ...limits } = PLAN_CAPABILITIES[planId].limits;
	return { limits, investigationAccess: investigations !== false };
}

function buildEntitlements() {
	return {
		[PLAN_IDS.FREE]: publicEntitlement(PLAN_IDS.FREE),
		[PLAN_IDS.HOBBY]: publicEntitlement(PLAN_IDS.HOBBY),
		[PLAN_IDS.PRO]: publicEntitlement(PLAN_IDS.PRO),
		[PLAN_IDS.SCALE]: publicEntitlement(PLAN_IDS.SCALE),
	};
}

export function buildPricingApiPayload(request: Request) {
	const url = new URL(request.url);

	return {
		schemaVersion: 3 as const,
		meta: {
			description: "Current public plans (same source as /pricing).",
			currency: "USD" as const,
		},
		links: {
			self: `${PUBLIC_DOCS_ORIGIN}${url.pathname}`,
			pricingPage: `${PUBLIC_DOCS_ORIGIN}/pricing`,
			pricingMarkdown: `${PUBLIC_DOCS_ORIGIN}/pricing.md`,
			signUp: APP_SIGNUP,
		},
		investigations: {
			featureId: INVESTIGATION_USAGE.featureId,
			pricePerAdditionalInvestigation: INVESTIGATION_USAGE.priceUsd,
			currency: "USD" as const,
			billingModel: "usage_based" as const,
			interval: "month" as const,
			includedByPlan: INVESTIGATION_ALLOWANCES,
			description: INVESTIGATION_USAGE.description,
		},
		plans: mapRawPlans(),
		entitlements: buildEntitlements(),
		signUpUrl: APP_SIGNUP,
		pricingPageUrl: `${PUBLIC_DOCS_ORIGIN}/pricing`,
		currency: "USD" as const,
	};
}
