import { describe, expect, it } from "vitest";
import {
	buildAgentStreamRedisWarningPayload,
	type AgentStreamBackgroundFailure,
	getAgentStreamErrorLevel,
} from "./agent-stream-errors";

describe("agent stream error severity", () => {
	it.each([
		"append_stream_chunk",
		"clear_active_stream",
		"mark_stream_done",
	] satisfies AgentStreamBackgroundFailure[])(
		"treats %s as a warning",
		(failure) => {
			expect(getAgentStreamErrorLevel(failure)).toBe("warn");
		}
	);

	it("keeps broad storage reader failures as errors", () => {
		expect(getAgentStreamErrorLevel("storage_reader")).toBe("error");
	});
});

describe("buildAgentStreamRedisWarningPayload", () => {
	it("builds a consistent warning payload for Redis side effects", () => {
		const payload = buildAgentStreamRedisWarningPayload(
			new Error("redis timeout"),
			"append_stream_chunk",
			{ chatId: "chat_1", websiteId: "web_1" }
		);

		expect(payload).toEqual(
			expect.objectContaining({
				agent_chat_id: "chat_1",
				agent_stream_operation: "append_stream_chunk",
				agent_stream_redis_error: true,
				agent_website_id: "web_1",
				error_message: "redis timeout",
				error_name: "Error",
				service: "api",
			})
		);
		expect(typeof payload.error_stack).toBe("string");
	});

	it("omits the website field when no website is in scope", () => {
		const payload = buildAgentStreamRedisWarningPayload(
			"redis unavailable",
			"clear_active_stream",
			{ chatId: "chat_1", websiteId: null }
		);

		expect(payload.agent_website_id).toBeUndefined();
		expect(payload.error_message).toBe("redis unavailable");
	});
});
