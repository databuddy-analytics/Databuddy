import { describe, expect, test } from "bun:test";
import { getClientIp } from "./client-ip";

function resolve(headers: Record<string, string>) {
	return getClientIp(new Headers(headers));
}

describe("getClientIp", () => {
	test("prefers the Cloudflare header", () => {
		expect(
			resolve({
				"cf-connecting-ip": "203.0.113.10",
				"x-forwarded-for": "198.51.100.4",
			})
		).toBe("203.0.113.10");
	});

	test("falls back to the first x-forwarded-for hop", () => {
		expect(
			resolve({ "x-forwarded-for": "203.0.113.10, 198.51.100.4, 10.0.0.1" })
		).toBe("203.0.113.10");
	});

	test("falls back to x-real-ip last", () => {
		expect(resolve({ "x-real-ip": "203.0.113.10" })).toBe("203.0.113.10");
	});

	test("returns nothing when no header is present", () => {
		expect(resolve({})).toBeUndefined();
	});
});
