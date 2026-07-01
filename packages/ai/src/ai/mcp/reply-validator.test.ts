import { describe, expect, it } from "vitest";
import { validateSlackReply } from "./reply-validator";

describe("validateSlackReply", () => {
	it("accepts a clean receipt with proper channel mention", () => {
		const result = validateSlackReply(
			"Routed insight digests to <#C082WC4PPGS> on a weekly cadence."
		);
		expect(result.valid).toBe(true);
		expect(result.issues).toHaveLength(0);
	});

	it("accepts empty input", () => {
		expect(validateSlackReply("").valid).toBe(true);
		expect(validateSlackReply("   \n  ").valid).toBe(true);
	});

	it("flags a banned opening", () => {
		const result = validateSlackReply(
			"Done. Routed insight digests to <#C082WC4PPGS> on a weekly cadence."
		);
		expect(result.valid).toBe(false);
		expect(result.issues.map((i) => i.code)).toContain("banned_opening");
	});

	it("flags several banned openings", () => {
		for (const opener of [
			"Sure",
			"Got it",
			"Great",
			"Perfect",
			"Here's the deal",
			"Thinking about it",
			"I've routed",
			"Let me check",
			"I'll route",
		]) {
			const result = validateSlackReply(`${opener}, routed to <#C123ABCDE>.`);
			expect(result.valid, opener).toBe(false);
			expect(result.issues[0]?.code, opener).toBe("banned_opening");
		}
	});

	it("flags a raw channel ID not wrapped in <#...>", () => {
		const result = validateSlackReply(
			"Routed insight digests to (# C082WC4PPGS) on a weekly cadence."
		);
		expect(result.valid).toBe(false);
		expect(result.issues.map((i) => i.code)).toContain("raw_channel_id");
		expect(result.issues[0]?.detail).toContain("C082WC4PPGS");
	});

	it("flags multiple distinct raw IDs but only once each", () => {
		const result = validateSlackReply(
			"Sending to C082WC4PPGS and also G012345678. C082WC4PPGS again."
		);
		const rawIssues = result.issues.filter(
			(i) => i.code === "raw_channel_id"
		);
		expect(rawIssues).toHaveLength(2);
		expect(rawIssues.map((i) => i.detail.match(/"([CGD][A-Z0-9]+)"/)?.[1])).toEqual(
			["C082WC4PPGS", "G012345678"]
		);
	});

	it("does not flag a channel ID that is part of a valid mention", () => {
		const result = validateSlackReply(
			"Routed to <#C082WC4PPGS> and <#G012345678>."
		);
		expect(result.valid).toBe(true);
	});

	it("does not flag short IDs that aren't channel-shaped", () => {
		const result = validateSlackReply(
			"Cadence: daily -> weekly. Next run: Friday."
		);
		expect(result.valid).toBe(true);
	});
});
