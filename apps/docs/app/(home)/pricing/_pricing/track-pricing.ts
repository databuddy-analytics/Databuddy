import { flush, track } from "@databuddy/sdk";

type PricingPlacement =
	| "pricing_comparison_table"
	| "pricing_estimator"
	| "pricing_intelligence";

export function trackPricingPlanClick(
	planId: string,
	placement: PricingPlacement
) {
	track("pricing_plan_clicked", { plan: planId, placement });
	flush();
}
