import {
	ensureAgentCreditsAvailable,
	resolveAgentBillingCustomerId,
} from "@databuddy/ai/agents/execution";
import { captureInsightsError } from "./lib/evlog-insights";

export interface InsightsBillingDeps {
	ensureCreditsAvailable: (
		billingCustomerId: string | null
	) => Promise<boolean>;
	resolveBillingCustomerId: (principal: {
		organizationId?: string | null;
		userId?: string | null;
	}) => Promise<string | null>;
}

export interface InsightsBillingDecision {
	allowed: boolean;
	billingCustomerId: string | null;
}

const defaultBillingDeps: InsightsBillingDeps = {
	ensureCreditsAvailable: ensureAgentCreditsAvailable,
	resolveBillingCustomerId: resolveAgentBillingCustomerId,
};

export async function resolveInsightsBilling(
	principal: { organizationId: string; userId: string | null },
	deps: InsightsBillingDeps = defaultBillingDeps
): Promise<InsightsBillingDecision> {
	try {
		const billingCustomerId = await deps.resolveBillingCustomerId({
			organizationId: principal.organizationId,
			userId: principal.userId,
		});
		const allowed = await deps.ensureCreditsAvailable(billingCustomerId);
		return { allowed, billingCustomerId };
	} catch (error) {
		captureInsightsError(error, "billing.check_failed_open", {
			organization_id: principal.organizationId,
		});
		return { allowed: true, billingCustomerId: null };
	}
}
