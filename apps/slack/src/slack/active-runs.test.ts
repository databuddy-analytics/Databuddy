import { describe, expect, it } from "bun:test";
import { abortSlackActiveRun, registerSlackActiveRun } from "@/slack/active-runs";

describe("Slack active runs", () => {
	it("aborts a registered run by Slack message reference", () => {
		const controller = registerSlackActiveRun({
			channelId: "C123",
			messageTs: "171234.567",
			teamId: "T123",
			text: "What changed?",
			threadTs: "171234.567",
			trigger: "app_mention",
			userId: "U123",
		});

		expect(controller?.signal.aborted).toBe(false);
		expect(
			abortSlackActiveRun({
				channelId: "C123",
				messageTs: "171234.567",
				teamId: "T123",
			})
		).toBe(true);
		expect(controller?.signal.aborted).toBe(true);
	});
});
