import { roleHasPermission } from "@databuddy/auth/permissions";
import { MIN_AGENT_CREDIT_CHECK_BALANCE } from "@databuddy/shared/agent-credits";
import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";
import { z } from "zod";
import { getOrganizationOwnerId } from "../utils/organization";
import { getAutumn } from "./autumn-client";
import { logger } from "./logger";

export const businessContextGenerationAccessSchema = z.object({
	status: z.enum([
		"allowed",
		"credits-required",
		"unavailable",
		"not-configured",
		"read-only",
	]),
	billingMode: z.enum(["fixed", "legacy"]).nullable(),
	message: z.string(),
	action: z.enum(["generate", "billing", "retry", "contact-admin"]),
});

/** Read-only preflight; the worker rechecks before making provider calls. */
export async function businessContextGenerationAccess(
	organizationId: string,
	role: string | null
): Promise<z.infer<typeof businessContextGenerationAccessSchema>> {
	if (!(role && roleHasPermission(role, "organization", ["update"]))) {
		return {
			status: "read-only",
			billingMode: null,
			message:
				"Ask an organization admin to generate or edit business context.",
			action: "contact-admin",
		};
	}
	if (
		!(
			process.env.AI_GATEWAY_API_KEY?.trim() &&
			process.env.FIRECRAWL_API_KEY?.trim()
		) ||
		(!process.env.AUTUMN_SECRET_KEY?.trim() &&
			process.env.NODE_ENV === "production")
	) {
		return {
			status: "not-configured",
			billingMode: null,
			message:
				"AI draft generation is not configured. Contact your administrator, or edit the context manually.",
			action: "contact-admin",
		};
	}
	// Match the worker's local/self-hosted policy when billing is not configured.
	if (!process.env.AUTUMN_SECRET_KEY?.trim()) {
		return {
			status: "allowed",
			billingMode: null,
			message: "You can generate a draft from your website.",
			action: "generate",
		};
	}
	try {
		const customerId = await getOrganizationOwnerId(organizationId);
		if (!customerId) {
			throw new Error("The organization billing owner is unavailable");
		}
		const autumn = getAutumn({ strict: true });
		const customer = await autumn.customers.get({ customerId });
		if (customer.id !== customerId) {
			throw new Error(
				"The organization billing customer could not be verified"
			);
		}
		// A fixed-price balance with zero units must never fall back to legacy credits.
		const billingMode = Object.hasOwn(
			customer.balances,
			INVESTIGATION_USAGE.featureId
		)
			? "fixed"
			: "legacy";
		const access = await autumn.check({
			customerId,
			featureId:
				billingMode === "fixed"
					? INVESTIGATION_USAGE.featureId
					: "agent_credits",
			requiredBalance:
				billingMode === "fixed" ? 1 : MIN_AGENT_CREDIT_CHECK_BALANCE,
		});
		if (access.customerId !== customerId) {
			throw new Error(
				"The organization generation access could not be verified"
			);
		}
		if (access.allowed === true) {
			return {
				status: "allowed",
				billingMode,
				message:
					billingMode === "fixed"
						? "You can generate a draft with your investigation access."
						: "Generating a draft uses your AI credits.",
				action: "generate",
			};
		}
		return {
			status: "credits-required",
			billingMode,
			message:
				billingMode === "fixed"
					? "Investigation access is required to generate a draft. Review your investigation allowance and spending limit, or edit the context manually."
					: "AI credits are required to generate a draft. Review your AI credit balance and spending limit, or edit the context manually.",
			action: roleHasPermission(role, "subscription", ["update"])
				? "billing"
				: "contact-admin",
		};
	} catch (error) {
		logger.error(
			{ error, organizationId },
			"Business context generation access could not be checked"
		);
		return {
			status: "unavailable",
			billingMode: null,
			message:
				"Generation access could not be checked. Try again, or edit the context manually.",
			action: "retry",
		};
	}
}
