import { describe, expect, test } from "bun:test";
import {
	normalizeHttpWideEventForAxiom,
	normalizeWideEventForAxiom,
} from "./evlog-axiom";

describe("normalizeWideEventForAxiom", () => {
	test("moves string errors and adds a numeric duration", () => {
		const event: Record<string, unknown> = {
			error: "request failed",
			duration: "1.25s",
			level: "error",
		};

		normalizeWideEventForAxiom(event);

		expect(event.error).toBeUndefined();
		expect(event.error_message).toBe("request failed");
		expect(event.duration_ms).toBe(1250);
	});

	test("downgrades structured 4xx errors", () => {
		const event: Record<string, unknown> = {
			error: { status: 429 },
			level: "error",
		};

		normalizeHttpWideEventForAxiom(event);

		expect(event.level).toBe("warn");
		expect(event.client_http_error).toBe(true);
	});

	test("keeps structured server errors at error level", () => {
		const event: Record<string, unknown> = {
			error: { status: 503 },
			level: "error",
		};

		normalizeHttpWideEventForAxiom(event);

		expect(event.level).toBe("error");
		expect(event.client_http_error).toBeUndefined();
	});
});
