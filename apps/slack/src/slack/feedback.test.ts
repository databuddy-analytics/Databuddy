import { describe, expect, it } from "bun:test";
import { classifySlackReactionSentiment } from "@/slack/feedback";

describe("Slack feedback reactions", () => {
	it("classifies explicit positive reactions", () => {
		expect(classifySlackReactionSentiment("+1")).toBe("positive");
		expect(classifySlackReactionSentiment(":thumbsup:")).toBe("positive");
		expect(classifySlackReactionSentiment("rocket")).toBe("positive");
	});

	it("classifies explicit negative reactions", () => {
		expect(classifySlackReactionSentiment("-1")).toBe("negative");
		expect(classifySlackReactionSentiment(":thumbsdown:")).toBe("negative");
		expect(classifySlackReactionSentiment("confused")).toBe("negative");
	});

	it("keeps unmapped reactions neutral", () => {
		expect(classifySlackReactionSentiment("rabbit")).toBe("neutral");
	});
});
