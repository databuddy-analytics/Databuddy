import { log } from "evlog";

export type AgentStreamRedisOperation =
	| "append_stream_chunk"
	| "clear_active_stream"
	| "mark_stream_done";

export function buildAgentStreamRedisWarningPayload(
	error: unknown,
	operation: AgentStreamRedisOperation,
	context: { chatId: string; websiteId?: null | string }
): Record<string, unknown> {
	const err = error instanceof Error ? error : new Error(String(error));
	return {
		agent_chat_id: context.chatId,
		agent_stream_operation: operation,
		agent_stream_redis_error: true,
		error_message: err.message,
		error_name: err.name,
		service: "api",
		...(err.stack ? { error_stack: err.stack } : {}),
		...(context.websiteId ? { agent_website_id: context.websiteId } : {}),
	};
}

export function warnAgentStreamRedisSideEffect(
	error: unknown,
	operation: AgentStreamRedisOperation,
	context: { chatId: string; websiteId?: null | string }
): void {
	log.warn(buildAgentStreamRedisWarningPayload(error, operation, context));
}
