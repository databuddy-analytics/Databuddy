import { createServiceAuth } from "@databuddy/rpc";

export const INSIGHTS_SERVICE_AUTH_SCOPES = ["read:data"] as const;

export function createInsightsServiceAuth(organizationId: string) {
	return createServiceAuth(organizationId, [...INSIGHTS_SERVICE_AUTH_SCOPES]);
}
