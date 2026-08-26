import { afterEach, describe, expect, test } from "bun:test";
import { getTrustedClientIp } from "./trusted-client-ip";

const originalVerified = process.env.IP_HEADER_VERIFIED;
const originalHeader = process.env.TRUSTED_IP_HEADER;

function setEnv(name: string, value: string | undefined) {
	if (value === undefined) {
		delete process.env[name];
	} else {
		process.env[name] = value;
	}
}

afterEach(() => {
	setEnv("IP_HEADER_VERIFIED", originalVerified);
	setEnv("TRUSTED_IP_HEADER", originalHeader);
});

function resolve(
	headers: Record<string, string>,
	env: { header?: string; verified?: string }
) {
	setEnv("IP_HEADER_VERIFIED", env.verified);
	setEnv("TRUSTED_IP_HEADER", env.header);
	return getTrustedClientIp(new Headers(headers));
}

describe("getTrustedClientIp", () => {
	const untrustedBoundaryValues = [undefined, "false", "1", "yes", ""];

	for (const verified of untrustedBoundaryValues) {
		test(`ignores forwarding headers when IP_HEADER_VERIFIED is ${JSON.stringify(verified)}`, () => {
			expect(
				resolve(
					{ "x-forwarded-for": "203.0.113.10" },
					{ verified, header: "x-forwarded-for" }
				)
			).toBeUndefined();
		});
	}

	test("accepts a case-insensitive trusted-proxy boundary flag", () => {
		expect(
			resolve(
				{ "cf-connecting-ip": "203.0.113.10" },
				{ verified: "TRUE", header: "cf-connecting-ip" }
			)
		).toBe("203.0.113.10");
	});

	test("defaults to cf-connecting-ip when no header is configured", () => {
		expect(
			resolve(
				{
					"cf-connecting-ip": "203.0.113.10",
					"x-forwarded-for": "198.51.100.4",
				},
				{ verified: "true" }
			)
		).toBe("203.0.113.10");
	});

	test("reads only the explicitly configured trusted header", () => {
		expect(
			resolve(
				{
					"cf-connecting-ip": "203.0.113.10",
					"x-forwarded-for": "198.51.100.4",
				},
				{ verified: "true", header: "cf-connecting-ip" }
			)
		).toBe("203.0.113.10");
	});

	test("normalizes the configured header name", () => {
		expect(
			resolve(
				{ "cf-connecting-ip": "203.0.113.10" },
				{ verified: "true", header: " CF-Connecting-IP " }
			)
		).toBe("203.0.113.10");
	});

	test("uses the first hop only when a trusted proxy owns x-forwarded-for", () => {
		expect(
			resolve(
				{ "x-forwarded-for": "203.0.113.10, 198.51.100.4, 10.0.0.1" },
				{ verified: "true", header: "x-forwarded-for" }
			)
		).toBe("203.0.113.10");
	});

	test("rejects a spoofed non-IP first hop instead of falling through", () => {
		expect(
			resolve(
				{ "x-forwarded-for": "evil-value, 203.0.113.10" },
				{ verified: "true", header: "x-forwarded-for" }
			)
		).toBeUndefined();
	});

	test("rejects an empty first hop", () => {
		expect(
			resolve(
				{ "x-forwarded-for": ", 203.0.113.10" },
				{ verified: "true", header: "x-forwarded-for" }
			)
		).toBeUndefined();
	});

	test("does not split non-forwarding headers on commas", () => {
		expect(
			resolve(
				{ "cf-connecting-ip": "203.0.113.10, 198.51.100.4" },
				{ verified: "true", header: "cf-connecting-ip" }
			)
		).toBeUndefined();
	});

	test("accepts IPv6 addresses", () => {
		expect(
			resolve(
				{ "x-forwarded-for": "2001:db8::1, 203.0.113.10" },
				{ verified: "true", header: "x-forwarded-for" }
			)
		).toBe("2001:db8::1");
	});

	test("rejects malformed and missing trusted header values", () => {
		expect(
			resolve(
				{ "cf-connecting-ip": "not-an-ip" },
				{ verified: "true", header: "cf-connecting-ip" }
			)
		).toBeUndefined();
		expect(
			resolve(
				{ "cf-connecting-ip": "203.0.113.10:443" },
				{ verified: "true", header: "cf-connecting-ip" }
			)
		).toBeUndefined();
		expect(
			resolve({}, { verified: "true", header: "cf-connecting-ip" })
		).toBeUndefined();
	});
});
