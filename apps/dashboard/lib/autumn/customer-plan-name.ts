const CUSTOMER_PLAN_NAMES: Record<string, string> = {
	scale: "Enterprise",
};

export function getCustomerPlanName(
	planId: string | null | undefined,
	fallbackName: string
): string {
	if (!planId) {
		return fallbackName;
	}

	return CUSTOMER_PLAN_NAMES[planId] ?? fallbackName;
}
