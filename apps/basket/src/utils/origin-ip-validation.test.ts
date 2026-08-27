import { describe, expect, test } from "vitest";
import {
	isValidIpFromSettings,
	isValidOriginFromSettings,
	normalizeIpv6,
} from "./origin-ip-validation";

describe("normalizeIpv6", () => {
	test("expands compressed notation", () =>
		expect(normalizeIpv6("2001:db8::1")).toBe(
			"2001:0db8:0000:0000:0000:0000:0000:0001"
		));

	test("strips leading zeros before padding", () =>
		expect(normalizeIpv6("2001:0db8:0:0:0:0:0:0001")).toBe(
			"2001:0db8:0000:0000:0000:0000:0000:0001"
		));

	test("lowercases hex groups", () =>
		expect(normalizeIpv6("2001:DB8::A")).toBe(
			"2001:0db8:0000:0000:0000:0000:0000:000a"
		));

	test("handles loopback", () =>
		expect(normalizeIpv6("::1")).toBe(
			"0000:0000:0000:0000:0000:0000:0000:0001"
		));

	test("handles all zeros", () =>
		expect(normalizeIpv6("::")).toBe(
			"0000:0000:0000:0000:0000:0000:0000:0000"
		));

	test("handles IPv4-mapped addresses", () =>
		expect(normalizeIpv6("::ffff:192.168.1.1")).toBe(
			"0000:0000:0000:0000:0000:ffff:c0a8:0101"
		));

	test("rejects IPv4", () => expect(normalizeIpv6("192.168.1.1")).toBeNull());

	test("rejects double compression", () =>
		expect(normalizeIpv6("2001::db8::1")).toBeNull());

	test("rejects too many groups", () =>
		expect(normalizeIpv6("1:2:3:4:5:6:7:8:9")).toBeNull());

	test("rejects full-length address with compression marker", () =>
		expect(normalizeIpv6("1:2:3:4:5:6:7::8")).toBeNull());

	test("rejects invalid hex", () =>
		expect(normalizeIpv6("gggg::1")).toBeNull());

	test("rejects zone identifiers", () =>
		expect(normalizeIpv6("fe80::1%eth0")).toBeNull());
});

describe("isValidIpFromSettings IPv6", () => {
	test("compressed client matches expanded allowlist entry", () =>
		expect(
			isValidIpFromSettings("2001:db8::1", [
				"2001:0db8:0000:0000:0000:0000:0000:0001",
			])
		).toBe(true));

	test("expanded client matches compressed allowlist entry", () =>
		expect(
			isValidIpFromSettings("2001:0db8:0000:0000:0000:0000:0000:0001", [
				"2001:db8::1",
			])
		).toBe(true));

	test("partially compressed forms match", () =>
		expect(
			isValidIpFromSettings("2001:db8:0:0:0:0:0:1", ["2001:db8::1"])
		).toBe(true));

	test("case differences match", () =>
		expect(isValidIpFromSettings("2001:DB8::A", ["2001:db8::a"])).toBe(true));

	test("different IPv6 addresses do not match", () =>
		expect(isValidIpFromSettings("2001:db8::2", ["2001:db8::1"])).toBe(false));

	test("IPv6 client does not match IPv4 allowlist entry", () =>
		expect(isValidIpFromSettings("2001:db8::1", ["192.168.1.1"])).toBe(false));

	test("IPv4 client does not match IPv6 allowlist entry", () =>
		expect(isValidIpFromSettings("192.168.1.1", ["2001:db8::1"])).toBe(false));

	test("invalid IPv6 allowlist entry only matches exactly", () => {
		expect(isValidIpFromSettings("2001::db8::1", ["2001::db8::1"])).toBe(true);
		expect(isValidIpFromSettings("2001:db8::1", ["2001::db8::1"])).toBe(false);
	});

	test("exact IPv4 match still works", () =>
		expect(isValidIpFromSettings("192.168.1.1", ["192.168.1.1"])).toBe(true));

	test("IPv4 CIDR match still works", () =>
		expect(isValidIpFromSettings("192.168.1.42", ["192.168.1.0/24"])).toBe(
			true
		));

	test("empty allowlist accepts any ip", () =>
		expect(isValidIpFromSettings("2001:db8::1", [])).toBe(true));

	test("empty ip with allowlist is rejected", () =>
		expect(isValidIpFromSettings("", ["2001:db8::1"])).toBe(false));
});

describe("isValidOriginFromSettings", () => {
	test("missing origin header is accepted", () =>
		expect(isValidOriginFromSettings("", ["example.com"])).toBe(true));

	test("origin matching allowlist is accepted", () =>
		expect(
			isValidOriginFromSettings("https://example.com", ["example.com"])
		).toBe(true));

	test("origin not in allowlist is rejected", () =>
		expect(
			isValidOriginFromSettings("https://evil.com", ["example.com"])
		).toBe(false));
});
