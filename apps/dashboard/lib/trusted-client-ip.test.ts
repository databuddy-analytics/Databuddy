import { afterEach, describe, expect, test } from "bun:test";
import { getTrustedClientIp } from "./trusted-client-ip";

const originalVerified = process.env.IP_HEADER_VERIFIED;
const originalHeader = process.env.TRUSTED_IP_HEADER;

afterEach(() => {
	if (originalVerified === undefined) {
		delete process.env.IP_HEADER_VERIFIED;
	} else {
		process.env.IP_HEADER_VERIFIED = originalVerified;
	}
	if (originalHeader === undefined) {
		delete process.env.TRUSTED_IP_HEADER;
	} else {
		process.env.TRUSTED_IP_HEADER = originalHeader;
	}
});

describe("getTrustedClientIp", () => {
	test("ignores forwarding headers without an explicit trusted-proxy boundary", () => {
		delete process.env.IP_HEADER_VERIFIED;
		process.env.TRUSTED_IP_HEADER = "x-forwarded-for";

		expect(
			getTrustedClientIp(new Headers({ "x-forwarded-for": "203.0.113.10" }))
		).toBeUndefined();
	});

	test("reads only the explicitly configured trusted header", () => {
		process.env.IP_HEADER_VERIFIED = "true";
		process.env.TRUSTED_IP_HEADER = "cf-connecting-ip";

		expect(
			getTrustedClientIp(
				new Headers({
					"cf-connecting-ip": "203.0.113.10",
					"x-forwarded-for": "198.51.100.4",
				})
			)
		).toBe("203.0.113.10");
	});

	test("uses the first address only when a trusted proxy owns x-forwarded-for", () => {
		process.env.IP_HEADER_VERIFIED = "true";
		process.env.TRUSTED_IP_HEADER = "x-forwarded-for";

		expect(
			getTrustedClientIp(
				new Headers({
					"x-forwarded-for": "203.0.113.10, 198.51.100.4",
				})
			)
		).toBe("203.0.113.10");
	});

	test("does not persist malformed values", () => {
		process.env.IP_HEADER_VERIFIED = "true";
		process.env.TRUSTED_IP_HEADER = "cf-connecting-ip";

		expect(
			getTrustedClientIp(new Headers({ "cf-connecting-ip": "not-an-ip" }))
		).toBeUndefined();
	});
});
