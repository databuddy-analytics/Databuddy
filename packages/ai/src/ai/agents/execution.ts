import type { ApiKeyRow } from "@databuddy/api-keys/resolve";
import { MIN_AGENT_CREDIT_CHECK_BALANCE } from "@databuddy/shared/agent-credits";
import { hasDatabunnyChat } from "@databuddy/shared/billing";
import { getAutumn } from "@databuddy/rpc/autumn";
import { getBillingCustomerId } from "@databuddy/rpc/billing";
import { getOrganizationOwnerId } from "@databuddy/rpc/organization";
import type { LanguageModelUsage } from "ai";
import { trackAgentEvent } from "../../lib/databuddy";
import { captureError, mergeWideEvent } from "../../lib/tracing";
import {
	summarizeAgentUsage,
	type UsageTelemetry,
} from "../../lib/usage-telemetry";

interface AgentUsageTrackingInput {
	agentType?: string;
	billingAccess?: AgentBillingAccess;
	billingCustomerId?: string | null;
	chatId?: string;
	idempotencyKey?: string;
	modelId: string;
	organizationId?: string | null;
	source: "dashboard" | "mcp" | "slack" | "insights";
	usage: LanguageModelUsage;
	userId?: string | null;
	websiteId?: string;
}

export interface AgentBillingAccess {
	allowed: boolean;
	customerId: string | null;
	includedChat: boolean;
}

export function isAgentBillingConfigured(): boolean {
	return Boolean(process.env.AUTUMN_SECRET_KEY?.trim());
}

export async function resolveAgentBillingCustomerId(principal: {
	apiKey?: ApiKeyRow | null;
	organizationId?: string | null;
	userId?: string | null;
}): Promise<string | null> {
	if (!isAgentBillingConfigured()) {
		mergeAgentBillingFields({
			billingCustomerId: null,
			organizationId:
				principal.organizationId ?? principal.apiKey?.organizationId ?? null,
			resolution: "billing_disabled",
		});
		return null;
	}

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

export async function getAgentBillingAccess(
	billingCustomerId: string | null
): Promise<AgentBillingAccess> {
	if (!isAgentBillingConfigured()) {
		mergeWideEvent({
			agent_credits_allowed: true,
			agent_credits_check_skipped: true,
		});
		return {
			allowed: true,
			customerId: billingCustomerId,
			includedChat: false,
		};
	}
	if (!billingCustomerId) {
		throw new Error("The agent billing customer is unavailable");
	}

	const startedAt = performance.now();
	try {
		const autumn = getAutumn({ strict: true });
		const customer = await autumn.customers.get({
			customerId: billingCustomerId,
		});
		if (customer.id !== billingCustomerId) {
			throw new Error("The agent billing customer could not be verified");
		}
		if (hasDatabunnyChat(customer.flags)) {
			mergeWideEvent({
				agent_chat_included: true,
				billing_customer_id: billingCustomerId,
			});
			return {
				allowed: true,
				customerId: billingCustomerId,
				includedChat: true,
			};
		}
		const result = await autumn.check({
			customerId: billingCustomerId,
			featureId: "agent_credits",
			requiredBalance: MIN_AGENT_CREDIT_CHECK_BALANCE,
		});
		if (
			result.customerId !== billingCustomerId ||
			(result.allowed && result.balance?.featureId !== "agent_credits")
		) {
			throw new Error("The agent credit balance could not be verified");
		}
		const allowed = result.allowed === true;
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
		return { allowed, customerId: billingCustomerId, includedChat: false };
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

export function trackAgentUsage(
	input: AgentUsageTrackingInput
): UsageTelemetry {
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
	return summary;
}

export async function trackAgentUsageAndBill(
	input: AgentUsageTrackingInput
): Promise<UsageTelemetry> {
	const summary = trackAgentUsage(input);

	if (!(isAgentBillingConfigured() && input.billingCustomerId)) {
		return summary;
	}
	if (input.source !== "insights") {
		const access =
			input.billingAccess ??
			(await getAgentBillingAccess(input.billingCustomerId));
		if (access.customerId !== input.billingCustomerId) {
			throw new Error("The agent billing access belongs to another customer");
		}
		if (access.includedChat) {
			mergeWideEvent({ agent_chat_included: true });
			return summary;
		}
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

	const request = {
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
	};
	const tracked = input.idempotencyKey
		? autumn.track(request, {
				headers: { "Idempotency-Key": input.idempotencyKey },
			})
		: autumn.track(request);
	await tracked.catch((err) => captureError(err, billingErrorContext));

	return summary;
}
