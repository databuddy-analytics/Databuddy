import { describe, expect, test } from "vitest";
import { normalizeWideEventForAxiom } from "./evlog-basket";

describe("normalizeWideEventForAxiom", () => {
	test("downgrades a catalog client error to warn", () => {
		const event: Record<string, unknown> = {
			level: "error",
			error_message: "Event quota exceeded",
		};
		normalizeWideEventForAxiom(event);
		expect(event.level).toBe("warn");
		expect(event.client_http_error).toBe(true);
	});

	test("downgrades based on a 4xx http_status", () => {
		const event: Record<string, unknown> = {
			level: "error",
			http_status: 429,
		};
		normalizeWideEventForAxiom(event);
		expect(event.level).toBe("warn");
		expect(event.client_http_error).toBe(true);
	});

	test("keeps a 5xx catalog error at error level", () => {
		const event: Record<string, unknown> = {
			level: "error",
			error_message: "Website lookup temporarily unavailable",
		};
		normalizeWideEventForAxiom(event);
		expect(event.level).toBe("error");
		expect(event.client_http_error).toBeUndefined();
	});

	test("keeps an unknown error at error level", () => {
		const event: Record<string, unknown> = {
			level: "error",
			error_message: "Failed to get website by ID V2",
		};
		normalizeWideEventForAxiom(event);
		expect(event.level).toBe("error");
	});

	test("flattens a string error onto error_message", () => {
		const event: Record<string, unknown> = {
			level: "error",
			error: "Event quota exceeded",
		};
		normalizeWideEventForAxiom(event);
		expect(event.error).toBeUndefined();
		expect(event.error_message).toBe("Event quota exceeded");
		expect(event.level).toBe("warn");
	});
});
