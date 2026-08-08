import { describe, expect, it } from "bun:test";
import {
	FEEDBACK_NEGATIVE_SIGNAL,
	FEEDBACK_POSITIVE_SIGNAL,
} from "@/slack/blocks";
import { resolveSlackFeedbackSignal } from "@/slack/feedback";

describe("resolveSlackFeedbackSignal", () => {
	it("extracts the positive button value", () => {
		expect(
			resolveSlackFeedbackSignal({
				type: "feedback_buttons",
				value: FEEDBACK_POSITIVE_SIGNAL,
			})
		).toBe("thumbsup");
	});

	it("extracts the negative button value", () => {
		expect(
			resolveSlackFeedbackSignal({ value: FEEDBACK_NEGATIVE_SIGNAL })
		).toBe("thumbsdown");
	});

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
