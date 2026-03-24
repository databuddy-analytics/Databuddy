import { resolveApiKeyOwnerId } from "@hooks/auth";
import { getApiKeyFromHeader, hasKeyScope } from "@lib/api-key";
import { checkAutumnUsage } from "@lib/billing";
import { insertAICallSpans } from "@lib/event-service";
import { basketErrors } from "@lib/structured-errors";
import { Elysia } from "elysia";
import { createError, EvlogError } from "evlog";
import { useLogger } from "evlog/elysia";
import { z } from "zod";

const aiCallSchema = z.object({
	timestamp: z.union([z.date(), z.number(), z.string()]),
	traceId: z.string().optional(),
	type: z.enum(["generate", "stream"]),
	model: z.string(),
	provider: z.string(),
	finishReason: z.string().optional(),
	input: z.array(z.unknown()).optional(),
	output: z.array(z.unknown()).optional(),
	usage: z.object({
		inputTokens: z.number(),
		outputTokens: z.number(),
		totalTokens: z.number(),
		cachedInputTokens: z.number().optional(),
		cacheCreationInputTokens: z.number().optional(),
		reasoningTokens: z.number().optional(),
		webSearchCount: z.number().optional(),
	}),
	cost: z.object({
		inputTokenCostUSD: z.number().optional(),
		outputTokenCostUSD: z.number().optional(),
		totalTokenCostUSD: z.number().optional(),
	}),
	tools: z.object({
		toolCallCount: z.number(),
		toolResultCount: z.number(),
		toolCallNames: z.array(z.string()),
		availableTools: z.array(z.string()).optional(),
	}),
	error: z
		.object({
			name: z.string(),
			message: z.string(),
			stack: z.string().optional(),
		})
		.optional(),
	durationMs: z.number(),
	httpStatus: z.number().optional(),
	params: z.record(z.string(), z.unknown()).optional(),
});

const app = new Elysia().post("/llm", async (context) => {
	const { body, request } = context as {
		body: unknown;
		request: Request;
	};
	const log = useLogger();
	log.set({ route: "llm" });

	try {
		const apiKey = await getApiKeyFromHeader(request.headers);
		if (apiKey === null) {
			log.set({ rejected: "missing_api_key" });
			throw basketErrors.llmMissingApiKey();
		}
		if (!hasKeyScope(apiKey, "write:llm")) {
			log.set({ rejected: "missing_scope" });
			throw basketErrors.llmMissingScope();
		}

		const ownerId = apiKey.organizationId ?? apiKey.userId;
		if (!ownerId) {
			log.set({ rejected: "missing_owner" });
			throw basketErrors.llmMissingOwner();
		}

		log.set({ ownerId, apiKeyId: apiKey.id });

		const billingOwnerId = await resolveApiKeyOwnerId(
			apiKey.organizationId ?? null
		);
		if (!billingOwnerId) {
			log.set({ rejected: "billing_resolve_failed" });
			throw basketErrors.llmBillingOwnerUnresolved();
		}

		const billing = await checkAutumnUsage(billingOwnerId, "events", {
			api_key_id: apiKey.id,
		});
		if ("exceeded" in billing) {
			log.set({ rejected: "billing_exceeded" });
			return billing.response;
		}

		const parseResult = z
			.union([aiCallSchema, z.array(aiCallSchema)])
			.safeParse(body);

		if (!parseResult.success) {
			log.set({ rejected: "schema" });
			throw basketErrors.llmInvalidBody();
		}

		const calls = Array.isArray(parseResult.data)
			? parseResult.data
			: [parseResult.data];

		log.set({ count: calls.length });

		const now = Date.now();
		const spans = calls.map((call) => {
			const timestamp =
				typeof call.timestamp === "number"
					? call.timestamp
					: call.timestamp instanceof Date
						? call.timestamp.getTime()
						: new Date(call.timestamp).getTime();

			return {
				owner_id: ownerId,
				timestamp: timestamp || now,
				type: call.type,
				model: call.model,
				provider: call.provider,
				finish_reason: call.finishReason,
				input_tokens: call.usage.inputTokens,
				output_tokens: call.usage.outputTokens,
				total_tokens: call.usage.totalTokens,
				cached_input_tokens: call.usage.cachedInputTokens,
				cache_creation_input_tokens: call.usage.cacheCreationInputTokens,
				reasoning_tokens: call.usage.reasoningTokens,
				web_search_count: call.usage.webSearchCount,
				input_token_cost_usd: call.cost.inputTokenCostUSD,
				output_token_cost_usd: call.cost.outputTokenCostUSD,
				total_token_cost_usd: call.cost.totalTokenCostUSD,
				tool_call_count: call.tools.toolCallCount,
				tool_result_count: call.tools.toolResultCount,
				tool_call_names: call.tools.toolCallNames,
				duration_ms: call.durationMs,
				trace_id: call.traceId,
				http_status: call.httpStatus,
				error_name: call.error?.name,
				error_message: call.error?.message,
				error_stack: call.error?.stack,
			};
		});

		await insertAICallSpans(spans);

		return new Response(
			JSON.stringify({
				status: "success",
				type: "ai_call",
				count: spans.length,
			}),
			{
				status: 200,
				headers: { "Content-Type": "application/json" },
			}
		);
	} catch (error) {
		if (error instanceof EvlogError) {
			throw error;
		}
		const err = error instanceof Error ? error : new Error(String(error));
		log.error(err);
		throw createError({
			message: "Internal server error",
			status: 500,
			why: process.env.NODE_ENV === "development" ? err.message : undefined,
			cause: err,
		});
	}
});

export default app;
