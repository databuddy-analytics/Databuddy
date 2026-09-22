import { describe, expect, it } from "bun:test";
import { getErrorsPerAffectedUser } from "./utils";

describe("getErrorsPerAffectedUser", () => {
	it("does not divide by zero", () => {
		expect(getErrorsPerAffectedUser(12, 0)).toBe(0);
	});
});
