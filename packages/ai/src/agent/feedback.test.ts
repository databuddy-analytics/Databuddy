import { describe, expect, test } from "bun:test";
import {
	classifyAgentFeedbackSentiment,
	normalizeAgentFeedbackSignal,
} from "./feedback";

describe("agent feedback semantics", () => {
	test("normalizes Slack-style reaction names", () => {
		expect(normalizeAgentFeedbackSignal(":thumbsup:")).toBe("thumbsup");
		expect(normalizeAgentFeedbackSignal("Rocket")).toBe("rocket");
	});

	test("classifies explicit positive feedback", () => {
		expect(classifyAgentFeedbackSentiment("+1")).toBe("positive");
		expect(classifyAgentFeedbackSentiment(":heart:")).toBe("positive");
		expect(classifyAgentFeedbackSentiment("rocket")).toBe("positive");
	});

	test("classifies explicit negative feedback", () => {
		expect(classifyAgentFeedbackSentiment("-1")).toBe("negative");
		expect(classifyAgentFeedbackSentiment(":thumbsdown:")).toBe("negative");
		expect(classifyAgentFeedbackSentiment("confused")).toBe("negative");
	});

	test("leaves ambiguous reactions neutral", () => {
		expect(classifyAgentFeedbackSentiment("rabbit")).toBe("neutral");
		expect(classifyAgentFeedbackSentiment("eyes")).toBe("neutral");
	});
});
