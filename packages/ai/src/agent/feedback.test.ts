import { describe, expect, test } from "bun:test";
import { classifyAgentFeedbackSentiment } from "./feedback";

describe("agent feedback semantics", () => {
	test("leaves ambiguous reactions neutral", () => {
		expect(classifyAgentFeedbackSentiment("rabbit")).toBe("neutral");
		expect(classifyAgentFeedbackSentiment("eyes")).toBe("neutral");
	});
});
