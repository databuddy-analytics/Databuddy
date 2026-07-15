import { LEGACY_SCALE_PLAN } from "@databuddy/shared/billing";

export function getCustomerPlanName(
	planId: string | null | undefined,
	fallbackName: string
): string {
	if (!planId) {
		return fallbackName;
	}

	return planId === LEGACY_SCALE_PLAN.id
		? LEGACY_SCALE_PLAN.name
		: fallbackName;
}
