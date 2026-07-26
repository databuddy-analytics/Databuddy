import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

describe("generateAgentPrompt", () => {
	test("does not ask an AI assistant to send installation telemetry", () => {
		const promptSource = readFileSync(
			new URL("./step-install-tracking.tsx", import.meta.url),
			"utf8"
		);

		expect(promptSource).not.toContain("agent-telemetry");
		expect(promptSource).not.toContain("Report Back");
		expect(promptSource).not.toContain("Always send this report");
		expect(promptSource).not.toContain("trackPerformance");
		expect(promptSource).not.toContain("trackScreenViews");
		expect(promptSource).not.toContain("trackSessions");
	});
});
