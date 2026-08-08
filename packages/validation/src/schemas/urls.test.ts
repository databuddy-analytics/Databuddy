import { describe, expect, test } from "bun:test";
import { httpUrlSchema } from "./urls";

describe("httpUrlSchema", () => {
	test("accepts absolute HTTP(S) URLs", () => {
		for (const url of [
			"https://example.com/path?query=value",
			"http://localhost:3000/path",
		]) {
			expect(httpUrlSchema.safeParse(url).success).toBe(true);
		}
	});

	test("rejects non-HTTP(S) URL schemes", () => {
		for (const url of [
			"javascript:alert(1)",
			"data:text/html,hello",
			"file:///etc/passwd",
			"exampleapp://open/profile",
		]) {
			expect(httpUrlSchema.safeParse(url).success).toBe(false);
		}
	});
});
