import { describe, expect, test } from "bun:test";
import { getTrustedClientIp } from "./trusted-client-ip";

function resolve(headers: Record<string, string>) {
	return getTrustedClientIp(new Headers(headers));
}

describe("getTrustedClientIp", () => {
	test("reads the Cloudflare client ip", () => {
		expect(resolve({ "cf-connecting-ip": "203.0.113.10" })).toBe("203.0.113.10");
	});

	test("accepts IPv6", () => {
		expect(resolve({ "cf-connecting-ip": "2001:db8::1" })).toBe("2001:db8::1");
	});

	test("trims surrounding whitespace", () => {
		expect(resolve({ "cf-connecting-ip": "  203.0.113.10  " })).toBe(
			"203.0.113.10"
		);
	});

	test("ignores forwarding headers a client can set", () => {
		expect(
			resolve({
				"x-forwarded-for": "203.0.113.10",
				"x-real-ip": "203.0.113.11",
			})
		).toBeUndefined();
	});

	test("rejects values that are not addresses", () => {
		expect(resolve({ "cf-connecting-ip": "not-an-ip" })).toBeUndefined();
		expect(resolve({ "cf-connecting-ip": "203.0.113.10:443" })).toBeUndefined();
		expect(
			resolve({ "cf-connecting-ip": "203.0.113.10, 198.51.100.4" })
		).toBeUndefined();
		expect(resolve({ "cf-connecting-ip": "" })).toBeUndefined();
	});

	test("returns nothing when the header is absent", () => {
		expect(resolve({})).toBeUndefined();
	});
});
