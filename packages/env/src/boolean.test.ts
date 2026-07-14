import { describe, expect, it } from "bun:test";
import { readBooleanEnv } from "./boolean";

describe("readBooleanEnv", () => {
	it("only enables an explicit true value", () => {
		for (const value of [undefined, "", "false", "0", "1", "yes"]) {
			expect(readBooleanEnv("FLAG", { FLAG: value })).toBe(false);
		}
	});

	it("accepts true without case or whitespace sensitivity", () => {
		expect(readBooleanEnv("FLAG", { FLAG: " TRUE " })).toBe(true);
	});
});
