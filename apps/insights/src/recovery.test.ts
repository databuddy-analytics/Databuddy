import { describe, expect, it } from "bun:test";
import { summarizeItemErrors } from "./recovery";

describe("summarizeItemErrors", () => {
	it("returns null when no failed items have error messages", () => {
		expect(summarizeItemErrors([])).toBeNull();
		expect(
			summarizeItemErrors([
				{ errorMessage: null, status: "failed" },
				{ errorMessage: "ignored", status: "succeeded" },
			])
		).toBeNull();
	});

	it("picks the most frequent error and counts other error types", () => {
		expect(
			summarizeItemErrors([
				{ errorMessage: "Model timeout", status: "failed" },
				{ errorMessage: "Model timeout", status: "failed" },
				{ errorMessage: "Rate limited", status: "failed" },
				{ errorMessage: "ignored", status: "succeeded" },
			])
		).toBe("2 items: Model timeout (+1 other error types)");
	});
});
