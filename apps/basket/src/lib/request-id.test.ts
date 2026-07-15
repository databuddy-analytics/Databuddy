import { describe, expect, it } from "vitest";
import { sanitizeRequestId } from "./request-id";

describe("sanitizeRequestId", () => {
	it("keeps bounded request identifiers used by common tracing systems", () => {
		expect(sanitizeRequestId("  req_123:trace-456.7  ")).toBe(
			"req_123:trace-456.7"
		);
	});

	it.each([
		null,
		"",
		"request id",
		"request\r\nid",
		"x".repeat(129),
	])("rejects unsafe inbound request IDs: %j", (value) => {
		expect(sanitizeRequestId(value)).toBeNull();
	});
});
