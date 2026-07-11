import { describe, expect, it } from "bun:test";
import { getErrorsPerAffectedUser } from "./utils";

describe("getErrorsPerAffectedUser", () => {
	it("reports occurrences per affected user", () => {
		expect(getErrorsPerAffectedUser(12, 3)).toBe(4);
	});

	it("does not divide by zero", () => {
		expect(getErrorsPerAffectedUser(12, 0)).toBe(0);
	});
});
