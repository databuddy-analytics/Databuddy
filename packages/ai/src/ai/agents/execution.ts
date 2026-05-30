import type { ApiKeyRow } from "@databuddy/api-keys/resolve";
import { MIN_AGENT_CREDIT_CHECK_BALANCE } from "@databuddy/shared/agent-credits";
import { getAutumn } from "@databuddy/rpc/autumn";
import {
	getBillingCustomerId,
	getOrganizationOwnerId,
} from "@databuddy/rpc/billing";
import type { LanguageModelUsage } from "ai";
import { trackAgentEvent } from "../../lib/databuddy";
import { captureError, mergeWideEvent } from "../../lib/tracing";
import {
	summarizeAgentUsage,
	type UsageTelemetry,
} from "../../lib/usage-telemetry";

interface AgentUsageTrackingInput {
	agentType?: string;
	billingCustomerId?: string | null;
	chatId?: string;
	modelId: string;
	organizationId?: string | null;
	source: "dashboard" | "mcp" | "slack" | "insights";
	usage: LanguageModelUsage;
	userId?: string | null;
	websiteId?: string;
}

export async function resolveAgentBillingCustomerId(principal: {
	apiKey?: ApiKeyRow | null;
	organizationId?: string | null;
	userId?: string | null;
}): Promise<string | null> {
	const apiKeyOrganizationId = principal.apiKey?.organizationId ?? null;
	const organizationId = principal.organizationId ?? apiKeyOrganizationId;
	if (apiKeyOrganizationId) {
		const customerId = await getOrganizationOwnerId(apiKeyOrganizationId);
		mergeAgentBillingFields({
			apiKeyId: principal.apiKey?.id,
			apiKeyUserId: principal.apiKey?.userId,
			billingCustomerId: customerId,
			organizationId: apiKeyOrganizationId,
			resolution: customerId
				? "api_key_org_owner"
				: "api_key_org_owner_missing",
		});
		return customerId;
	}

	const ownerUserId = principal.userId ?? principal.apiKey?.userId ?? null;
	if (!ownerUserId) {
		const customerId = organizationId
			? await getOrganizationOwnerId(organizationId)
			: null;
		mergeAgentBillingFields({
			billingCustomerId: customerId,
			organizationId,
			resolution: customerId ? "org_owner" : "missing_principal",
		});
		return customerId;
	}
	const customerId = await getBillingCustomerId(ownerUserId, organizationId);
	mergeAgentBillingFields({
		apiKeyId: principal.apiKey?.id,
		apiKeyUserId: principal.apiKey?.userId,
		billingCustomerId: customerId,
		organizationId,
		resolution: organizationId ? "session_org_owner" : "user",
	});
	return customerId;
}

export async function ensureAgentCreditsAvailable(
	billingCustomerId: string | null
): Promise<boolean> {
	if (!billingCustomerId) {
		mergeWideEvent({
			agent_credits_allowed: true,
			agent_credits_check_skipped: true,
		});
		return true;
	}

	const startedAt = performance.now();
	try {
		const result = await getAutumn().check({
			customerId: billingCustomerId,
			featureId: "agent_credits",
			requiredBalance: MIN_AGENT_CREDIT_CHECK_BALANCE,
		});
		const allowed = result.allowed !== false;
		const balance = result.balance;
		mergeWideEvent({
			agent_credits_allowed: allowed,
			agent_credits_feature_id: "agent_credits",
			billing_customer_id: billingCustomerId,
			"timing.autumn_agent_credits_check_ms": Math.round(
				performance.now() - startedAt
			),
			...(balance
				? {
						agent_credits_granted: balance.granted,
						agent_credits_remaining: balance.remaining,
						agent_credits_unlimited: balance.unlimited,
						agent_credits_usage: balance.usage,
					}
				: {}),
		});
		return allowed;
	} catch (error) {
		captureError(error, {
			agent_credit_check_error: true,
			agent_credits_feature_id: "agent_credits",
			billing_customer_id: billingCustomerId,
		});
		throw error;
	}
}

function mergeAgentBillingFields(input: {
	apiKeyId?: string | null;
	apiKeyUserId?: string | null;
	billingCustomerId: string | null;
	organizationId?: string | null;
	resolution: string;
}): void {
	mergeWideEvent({
		agent_billing_resolution: input.resolution,
		...(input.apiKeyId ? { agent_api_key_id: input.apiKeyId } : {}),
		...(input.apiKeyUserId
			? { agent_api_key_user_id: input.apiKeyUserId }
			: {}),
		...(input.billingCustomerId
			? { billing_customer_id: input.billingCustomerId }
			: {}),
		...(input.organizationId ? { organization_id: input.organizationId } : {}),
	});
}

export async function trackAgentUsageAndBill(
	input: AgentUsageTrackingInput
): Promise<UsageTelemetry> {
	const summary = summarizeAgentUsage(input.modelId, input.usage);
	mergeWideEvent(summary);

	trackAgentEvent("agent_activity", {
		action: "chat_usage",
		source: input.source,
		agent_type: input.agentType,
		website_id: input.websiteId,
		organization_id: input.organizationId ?? null,
		user_id: input.userId ?? null,
		...summary,
	});

	if (!input.billingCustomerId) {
		return summary;
	}

	const autumn = getAutumn();
	const billingCustomerId = input.billingCustomerId;
	const creditsUsed = summary.agent_credits_used;

	const billingErrorContext = {
		agent_usage_billing_error: true,
		agent_source: input.source,
		...(input.agentType ? { agent_type: input.agentType } : {}),
		...(input.chatId ? { agent_chat_id: input.chatId } : {}),
		...(input.websiteId ? { agent_website_id: input.websiteId } : {}),
	};

	if (creditsUsed <= 0) {
		return summary;
	}

	await autumn
		.track({
			customerId: billingCustomerId,
			featureId: "agent_credits",
			value: creditsUsed,
			properties: {
				agent_source: input.source,
				cost_model_id: summary.cost_model_id,
				model_id: input.modelId,
				input_tokens: summary.input_tokens,
				output_tokens: summary.output_tokens,
				cache_read_tokens: summary.cache_read_tokens,
				cache_write_tokens: summary.cache_write_tokens,
			},
		})
		.catch((err) => captureError(err, billingErrorContext));

	return summary;
}
