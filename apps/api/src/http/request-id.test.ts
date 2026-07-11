import { describe, expect, it } from "vitest";
import { getRequestId } from "./request-id";

describe("getRequestId", () => {
	it("returns a stable generated ID for the same request", () => {
		const request = new Request("https://api.example.com/test");
		const requestId = getRequestId(request);

		expect(requestId).toMatch(/^req_[a-f0-9]{16}$/);
		expect(getRequestId(request)).toBe(requestId);
	});

	it("preserves a safe caller-supplied ID", () => {
		const request = new Request("https://api.example.com/test", {
			headers: { "x-request-id": "trace_partner-123" },
		});

		expect(getRequestId(request)).toBe("trace_partner-123");
	});

	it("replaces unsafe caller-supplied IDs", () => {
		const request = new Request("https://api.example.com/test", {
			headers: { "x-request-id": "not safe for logs" },
		});

		expect(getRequestId(request)).toMatch(/^req_[a-f0-9]{16}$/);
	});
});
