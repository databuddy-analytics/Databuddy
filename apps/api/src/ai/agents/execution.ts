import { getAutumn, getBillingCustomerId } from "@databuddy/rpc";
import type { LanguageModelUsage } from "ai";
import type { ApiKeyRow } from "../../lib/api-key";
import { trackAgentEvent } from "../../lib/databuddy";
import { captureError, mergeWideEvent } from "../../lib/tracing";
import {
	summarizeAgentUsage,
	type UsageTelemetry,
} from "../../lib/usage-telemetry";

interface AgentBillingPrincipal {
	apiKey?: ApiKeyRow | null;
	organizationId?: string | null;
	userId?: string | null;
}

interface AgentUsageTrackingInput {
	agentType?: string;
	billingCustomerId?: string | null;
	chatId?: string;
	modelId: string;
	organizationId?: string | null;
	source: "dashboard" | "mcp";
	usage: LanguageModelUsage;
	userId?: string | null;
	websiteId?: string;
}

export async function resolveAgentBillingCustomerId(
	principal: AgentBillingPrincipal
): Promise<string | null> {
	const ownerUserId = principal.userId ?? principal.apiKey?.userId ?? null;
	if (!ownerUserId) {
		return null;
	}

	return await getBillingCustomerId(
		ownerUserId,
		principal.organizationId ?? principal.apiKey?.organizationId ?? null
	);
}

export async function ensureAgentCreditsAvailable(
	billingCustomerId: string | null
): Promise<boolean> {
	if (!billingCustomerId) {
		return true;
	}

	const allowed = await getAutumn().check({
		customerId: billingCustomerId,
		featureId: "agent_credits",
	});
	return allowed.allowed !== false;
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
	const tokenTracks: [string, number][] = [
		["agent_input_tokens", summary.fresh_input_tokens],
		["agent_output_tokens", summary.output_tokens],
		["agent_cache_read_tokens", summary.cache_read_tokens],
		["agent_cache_write_tokens", summary.cache_write_tokens],
	];

	const results = await Promise.allSettled(
		tokenTracks
			.filter(([, value]) => value > 0)
			.map(([featureId, value]) =>
				autumn.track({
					customerId: input.billingCustomerId as string,
					featureId,
					value,
				})
			)
	);

	const rejected = results.find(
		(result): result is PromiseRejectedResult => result.status === "rejected"
	);
	if (rejected) {
		captureError(rejected.reason, {
			agent_usage_billing_error: true,
			agent_source: input.source,
			...(input.agentType ? { agent_type: input.agentType } : {}),
			...(input.chatId ? { agent_chat_id: input.chatId } : {}),
			...(input.websiteId ? { agent_website_id: input.websiteId } : {}),
		});
	}

	return summary;
}
