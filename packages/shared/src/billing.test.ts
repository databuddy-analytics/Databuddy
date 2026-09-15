import { describe, expect, test } from "bun:test";
import { hasDatabunnyChat } from "./billing";

describe("included Databunny chat", () => {
	test("uses the matching native flag and honors expiry", () => {
		expect(hasDatabunnyChat({ databunny_chat: { featureId: "databunny_chat", expiresAt: null } }, 100)).toBe(true);
		expect(hasDatabunnyChat({ databunny_chat: { featureId: "databunny_chat", expiresAt: 101 } }, 100)).toBe(true);
		for (const expiresAt of [99, 100]) {
			expect(hasDatabunnyChat({ databunny_chat: { featureId: "databunny_chat", expiresAt } }, 100)).toBe(false);
		}
	});

	test("missing or unrelated flags do not grant included chat", () => {
		for (const flags of [null, undefined, {}, { databunny_chat: { featureId: "another_feature", expiresAt: null } }]) {
			expect(hasDatabunnyChat(flags, 100)).toBe(false);
		}
	});
});
