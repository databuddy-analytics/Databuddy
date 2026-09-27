import { readBooleanEnv } from "@databuddy/env/boolean";
import { roleHasPermission } from "@databuddy/auth/permissions";
import { MIN_AGENT_CREDIT_CHECK_BALANCE } from "@databuddy/shared/agent-credits";
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
	message: z.string(),
	action: z.enum(["generate", "billing", "retry", "contact-admin"]),
});

/** Read-only preflight; generation rechecks before making provider calls. */
export async function businessContextGenerationAccess(
	organizationId: string,
	role: string | null,
	hasProfile: boolean
): Promise<z.infer<typeof businessContextGenerationAccessSchema>> {
	if (!(role && roleHasPermission(role, "organization", ["update"]))) {
		return {
			status: "read-only",
			message:
				"Ask an organization admin to generate or edit business context.",
			action: "contact-admin",
		};
	}
	if (
		!(
			process.env.AI_GATEWAY_API_KEY?.trim() &&
			process.env.CONTEXT_DEV_API_KEY?.trim()
		) ||
		(!(readBooleanEnv("SELFHOST") || process.env.AUTUMN_SECRET_KEY?.trim()) &&
			process.env.NODE_ENV === "production")
	) {
		return {
			status: "not-configured",
			message:
				"AI draft generation is not configured. Contact your administrator, or edit the context manually.",
			action: "contact-admin",
		};
	}
	// Match generation's local/self-hosted policy when billing is not configured.
	if (readBooleanEnv("SELFHOST") || !process.env.AUTUMN_SECRET_KEY?.trim()) {
		return {
			status: "allowed",
			message: "You can generate a draft from your website.",
			action: "generate",
		};
	}
	if (!hasProfile) {
		return {
			status: "allowed",
			message: "Your first draft is included.",
			action: "generate",
		};
	}
	try {
		const customerId = await getOrganizationOwnerId(organizationId);
		if (!customerId) {
			throw new Error("The organization billing owner is unavailable");
		}
		const access = await getAutumn({ strict: true }).check({
			customerId,
			featureId: "agent_credits",
			requiredBalance: MIN_AGENT_CREDIT_CHECK_BALANCE,
		});
		if (access.customerId !== customerId) {
			throw new Error(
				"The organization generation access could not be verified"
			);
		}
		if (access.allowed === true) {
			return {
				status: "allowed",
				message: "Generating a draft uses your AI credits.",
				action: "generate",
			};
		}
		return {
			status: "credits-required",
			message:
				"AI credits are required to generate a draft. Review your AI credit balance and spending limit, or edit the context manually.",
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
			message:
				"Generation access could not be checked. Try again, or edit the context manually.",
			action: "retry",
		};
	}
}
