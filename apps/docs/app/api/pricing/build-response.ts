import {
	PLAN_CAPABILITIES,
	PLAN_IDS,
	type PlanId,
} from "@databuddy/shared/types/features";
import { RAW_PLANS } from "@/app/(home)/pricing/data";

const APP_SIGNUP = "https://app.databuddy.cc/register";

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

		const features = plan.items
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
				included: toIncludedUsage(f.included_usage),
				interval: f.interval,
				...(f.type === "priced_feature" && f.tiers
					? {
							overageTiers: f.tiers.map((t) => ({
								upTo: t.to === "inf" ? ("unlimited" as const) : t.to,
								pricePerUnit: t.amount,
							})),
						}
					: {}),
			}));

		return {
			id: plan.id,
			name: plan.name,
			billingModel,
			pricePerMonth,
			features,
		};
	});
}

function buildEntitlements(): Record<
	PlanId,
	{
		limits: (typeof PLAN_CAPABILITIES)[PlanId]["limits"];
		ai: (typeof PLAN_CAPABILITIES)[PlanId]["ai"];
	}
> {
	return {
		[PLAN_IDS.FREE]: {
			limits: PLAN_CAPABILITIES[PLAN_IDS.FREE].limits,
			ai: PLAN_CAPABILITIES[PLAN_IDS.FREE].ai,
		},
		[PLAN_IDS.HOBBY]: {
			limits: PLAN_CAPABILITIES[PLAN_IDS.HOBBY].limits,
			ai: PLAN_CAPABILITIES[PLAN_IDS.HOBBY].ai,
		},
		[PLAN_IDS.PRO]: {
			limits: PLAN_CAPABILITIES[PLAN_IDS.PRO].limits,
			ai: PLAN_CAPABILITIES[PLAN_IDS.PRO].ai,
		},
		[PLAN_IDS.SCALE]: {
			limits: PLAN_CAPABILITIES[PLAN_IDS.SCALE].limits,
			ai: PLAN_CAPABILITIES[PLAN_IDS.SCALE].ai,
		},
	};
}

export function buildPricingApiPayload(request: Request) {
	const url = new URL(request.url);
	const origin = url.origin;

	return {
		schemaVersion: 1 as const,
		meta: {
			description: "Public billing and entitlements (same source as /pricing).",
			currency: "USD" as const,
		},
		links: {
			self: `${origin}${url.pathname}`,
			pricingPage: `${origin}/pricing`,
			pricingMarkdown: `${origin}/pricing.md`,
			signUp: APP_SIGNUP,
		},
		plans: mapRawPlans(),
		entitlements: buildEntitlements(),
		notes: {
			enterpriseCheckoutUsesEntitlementsPlanId: "scale" as const,
		},
		signUpUrl: APP_SIGNUP,
		pricingPageUrl: `${origin}/pricing`,
		currency: "USD" as const,
	};
}

export type PricingApiPayload = ReturnType<typeof buildPricingApiPayload>;
