import {
	INVESTIGATION_USAGE,
	investigationQuantitySchema,
} from "@databuddy/shared/billing";
import { array, literal, strictObject } from "zod";

const purchaseSchema = strictObject({
	planId: literal(INVESTIGATION_USAGE.topupPlanId),
	featureQuantities: array(
		strictObject({
			featureId: literal(INVESTIGATION_USAGE.featureId),
			quantity: investigationQuantitySchema,
		})
	).length(1),
});

function referencesInvestigationPlan(value: unknown): boolean {
	if (!value || typeof value !== "object") {
		return false;
	}
	return Object.entries(value).some(([key, entry]) => {
		if (["planId", "plan_id", "productId", "product_id"].includes(key)) {
			return entry === INVESTIGATION_USAGE.topupPlanId;
		}
		return (
			["plans", "products"].includes(key) &&
			Array.isArray(entry) &&
			entry.some(referencesInvestigationPlan)
		);
	});
}

export function isInvestigationPurchaseValid(body: unknown, route: string) {
	if (!referencesInvestigationPlan(body)) {
		return true;
	}
	// Only the supported manual checkout can purchase this SKU. Identity comes
	// from the authenticated Autumn identify callback, never request fields.
	return (
		(route === "attach" || route === "previewAttach") &&
		purchaseSchema.safeParse(body).success
	);
}
