import { SCALE_PLAN } from "@databuddy/shared/billing";
import { INTELLIGENCE_PLAN_IDS } from "@databuddy/shared/types/features";

const PLAN_DISPLAY_NAMES: Record<string, string> = {
	[INTELLIGENCE_PLAN_IDS.ANALYST]: "Business",
	[INTELLIGENCE_PLAN_IDS.DATA_TEAM]: "Scale",
	[SCALE_PLAN.id]: SCALE_PLAN.name,
};

export function getCustomerPlanName(
	planId: string | null | undefined,
	fallbackName: string
): string {
	if (!planId) {
		return fallbackName;
	}

	return PLAN_DISPLAY_NAMES[planId] ?? fallbackName;
}
