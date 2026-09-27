import { describe, expect, test } from "bun:test";
import { generateAgentPrompt } from "../../websites/[id]/_components/utils/code-generators";

describe("generateAgentPrompt", () => {
	test("does not ask an AI assistant to send installation telemetry", () => {
		const prompt = generateAgentPrompt("example-client-id");

		expect(prompt).not.toContain("agent-telemetry");
		expect(prompt).not.toContain("Report Back");
		expect(prompt).not.toContain("Always send this report");
		expect(prompt).not.toContain("trackPerformance");
		expect(prompt).not.toContain("trackScreenViews");
		expect(prompt).not.toContain("trackSessions");
	});
});
