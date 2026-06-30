import {
	PLAN_CAPABILITIES,
	PLAN_IDS,
	type PlanId,
} from "@databuddy/shared/types/features";
import { RAW_PLANS } from "@/app/(home)/pricing/data";

const APP_SIGNUP = "https://app.databuddy.cc/register";
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
	}
> {
	return {
		[PLAN_IDS.FREE]: {
			limits: PLAN_CAPABILITIES[PLAN_IDS.FREE].limits,
		},
		[PLAN_IDS.HOBBY]: {
			limits: PLAN_CAPABILITIES[PLAN_IDS.HOBBY].limits,
		},
		[PLAN_IDS.PRO]: {
			limits: PLAN_CAPABILITIES[PLAN_IDS.PRO].limits,
		},
		[PLAN_IDS.SCALE]: {
			limits: PLAN_CAPABILITIES[PLAN_IDS.SCALE].limits,
		},
	};
}

export function buildPricingApiPayload(request: Request) {
	const url = new URL(request.url);

	return {
		schemaVersion: 1 as const,
		meta: {
			description: "Public billing and entitlements (same source as /pricing).",
			currency: "USD" as const,
		},
		links: {
			self: `${PUBLIC_DOCS_ORIGIN}${url.pathname}`,
			pricingPage: `${PUBLIC_DOCS_ORIGIN}/pricing`,
			pricingMarkdown: `${PUBLIC_DOCS_ORIGIN}/pricing.md`,
			signUp: APP_SIGNUP,
		},
		plans: mapRawPlans(),
		entitlements: buildEntitlements(),
		notes: {
			enterpriseCheckoutUsesEntitlementsPlanId: "scale" as const,
		},
		signUpUrl: APP_SIGNUP,
		pricingPageUrl: `${PUBLIC_DOCS_ORIGIN}/pricing`,
		currency: "USD" as const,
	};
}

export type PricingApiPayload = ReturnType<typeof buildPricingApiPayload>;
