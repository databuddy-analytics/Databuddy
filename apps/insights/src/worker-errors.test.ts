import { describe, expect, it } from "bun:test";
import { getInsightsWorkerErrorLevel } from "./worker-errors";

describe("getInsightsWorkerErrorLevel", () => {
	it("downgrades transient Redis worker errors to warn", () => {
		const transientMessages = [
			"READONLY You can't write against a read only replica.",
			"ERR caller gone",
			"connect ECONNRESET 127.0.0.1:6379",
			"Connection is closed.",
			"Socket closed unexpectedly",
		];

		for (const message of transientMessages) {
			expect(getInsightsWorkerErrorLevel(new Error(message))).toBe("warn");
		}
	});

	it("keeps unknown worker errors at error", () => {
		expect(getInsightsWorkerErrorLevel(new Error("bad job payload"))).toBe(
			"error"
		);
	});
});
