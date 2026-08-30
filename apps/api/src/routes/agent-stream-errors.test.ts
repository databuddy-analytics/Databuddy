import { describe, expect, it } from "vitest";
import { buildAgentStreamRedisWarningPayload } from "./agent-stream-errors";

describe("buildAgentStreamRedisWarningPayload", () => {
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
