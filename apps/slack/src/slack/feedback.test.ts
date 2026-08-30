import { describe, expect, it } from "bun:test";
import { resolveSlackFeedbackSignal } from "@/slack/feedback";

describe("resolveSlackFeedbackSignal", () => {
	it("strips wrapping colons and lowercases", () => {
		expect(resolveSlackFeedbackSignal({ value: ":ThumbsUp:" })).toBe("thumbsup");
	});

	it("falls back to selected_option value", () => {
		expect(
			resolveSlackFeedbackSignal({ selected_option: { value: "thumbsdown" } })
		).toBe("thumbsdown");
	});

	it("returns null when no usable signal is present", () => {
		expect(resolveSlackFeedbackSignal({})).toBeNull();
		expect(resolveSlackFeedbackSignal(null)).toBeNull();
		expect(resolveSlackFeedbackSignal({ value: "" })).toBeNull();
	});
});
