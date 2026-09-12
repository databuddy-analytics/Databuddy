import {
	INVESTIGATION_USAGE,
	investigationQuantitySchema,
} from "@databuddy/shared/billing";
export function quoteInvestigationPurchase(quantity: number) {
	const validatedQuantity = investigationQuantitySchema.parse(quantity);
	return {
		costUsd: validatedQuantity * INVESTIGATION_USAGE.priceUsd,
		planId: INVESTIGATION_USAGE.topupPlanId,
		featureQuantities: [
			{ featureId: INVESTIGATION_USAGE.featureId, quantity: validatedQuantity },
		],
	};
}
