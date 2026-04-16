import { describe, expect, test } from "bun:test";

/**
 * Unit tests exposing the HttpClient double-read response body bug.
 *
 * When response.json() fails (e.g. invalid JSON), the code tries
 * response.text() — but the ReadableStream was already consumed
 * by the json() call, so text() returns empty or throws.
 *
 * See: src/core/client.ts lines 100-104
 */

describe("HttpClient response body double-read bug", () => {
	test("response.text() after failed response.json() returns empty on consumed stream", async () => {
		// Simulate what the browser does: a Response body can only be read once
		const invalidJson = "not-valid-json{{{";
		const response = new Response(invalidJson, {
			status: 200,
			headers: { "Content-Type": "text/plain" },
		});

		// First read: json() will fail
		let jsonFailed = false;
		try {
			await response.json();
		} catch {
			jsonFailed = true;
		}
		expect(jsonFailed).toBe(true);

		// Second read: text() on an already-consumed body
		// In browsers this throws TypeError: body stream already read
		// In Bun it may return empty string
		let textResult: string | null = null;
		let textFailed = false;
		try {
			textResult = await response.text();
		} catch {
			textFailed = true;
		}

		// The body was consumed — either text() throws or returns empty
		// Either way, the HttpClient's fallback `JSON.parse(text)` will fail silently
		const bodyWasConsumed = textFailed || textResult === "";
		expect(bodyWasConsumed).toBe(true);
	});
});
