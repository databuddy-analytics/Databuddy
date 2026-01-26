import { describe, expect, test } from "bun:test";
import {
	isValidIpFromSettings,
	isValidOriginFromSettings,
} from "@hooks/auth";
import { getWebsiteSecuritySettings } from "./request-validation";

describe("getWebsiteSecuritySettings", () => {
	test("should return null for null settings", () => {
		expect(getWebsiteSecuritySettings(null)).toBeNull();
	});

	test("should return null for undefined settings", () => {
		expect(getWebsiteSecuritySettings(undefined)).toBeNull();
	});

	test("should return null for non-object settings", () => {
		expect(getWebsiteSecuritySettings("string")).toBeNull();
		expect(getWebsiteSecuritySettings(123)).toBeNull();
		expect(getWebsiteSecuritySettings(true)).toBeNull();
	});

	test("should return null for array settings", () => {
		expect(getWebsiteSecuritySettings([])).toBeNull();
		expect(getWebsiteSecuritySettings([1, 2, 3])).toBeNull();
	});

	test("should return empty object for empty settings object", () => {
		const result = getWebsiteSecuritySettings({});
		expect(result).toEqual({ allowedOrigins: undefined, allowedIps: undefined });
	});

	test("should extract allowedOrigins array", () => {
		const settings = {
			allowedOrigins: ["cal.com", "*.example.com"],
		};
		const result = getWebsiteSecuritySettings(settings);
		expect(result?.allowedOrigins).toEqual(["cal.com", "*.example.com"]);
	});

	test("should extract allowedIps array", () => {
		const settings = {
			allowedIps: ["192.168.1.1", "10.0.0.0/8"],
		};
		const result = getWebsiteSecuritySettings(settings);
		expect(result?.allowedIps).toEqual(["192.168.1.1", "10.0.0.0/8"]);
	});

	test("should extract both allowedOrigins and allowedIps", () => {
		const settings = {
			allowedOrigins: ["cal.com"],
			allowedIps: ["192.168.1.1"],
		};
		const result = getWebsiteSecuritySettings(settings);
		expect(result?.allowedOrigins).toEqual(["cal.com"]);
		expect(result?.allowedIps).toEqual(["192.168.1.1"]);
	});

	test("should filter out non-string values from allowedOrigins", () => {
		const settings = {
			allowedOrigins: ["cal.com", 123, null, "*.example.com", undefined],
		};
		const result = getWebsiteSecuritySettings(settings);
		expect(result?.allowedOrigins).toEqual(["cal.com", "*.example.com"]);
	});

	test("should filter out non-string values from allowedIps", () => {
		const settings = {
			allowedIps: ["192.168.1.1", true, "10.0.0.0/8", {}],
		};
		const result = getWebsiteSecuritySettings(settings);
		expect(result?.allowedIps).toEqual(["192.168.1.1", "10.0.0.0/8"]);
	});

	test("should return undefined for non-array allowedOrigins", () => {
		const settings = {
			allowedOrigins: "not-an-array",
		};
		const result = getWebsiteSecuritySettings(settings);
		expect(result?.allowedOrigins).toBeUndefined();
	});

	test("should return undefined for non-array allowedIps", () => {
		const settings = {
			allowedIps: 123,
		};
		const result = getWebsiteSecuritySettings(settings);
		expect(result?.allowedIps).toBeUndefined();
	});
});

describe("isValidOriginFromSettings", () => {
	test("should allow all origins when allowedOrigins is empty", () => {
		expect(isValidOriginFromSettings("https://example.com", [])).toBe(true);
		expect(isValidOriginFromSettings("https://malicious.com", [])).toBe(true);
	});

	test("should allow all origins when allowedOrigins is undefined", () => {
		expect(isValidOriginFromSettings("https://example.com", undefined)).toBe(
			true
		);
	});

	test("should allow empty origin header", () => {
		expect(isValidOriginFromSettings("", ["cal.com"])).toBe(true);
		expect(isValidOriginFromSettings("   ", ["cal.com"])).toBe(true);
	});

	test("should allow all origins with wildcard *", () => {
		expect(isValidOriginFromSettings("https://example.com", ["*"])).toBe(true);
		expect(isValidOriginFromSettings("https://malicious.com", ["*"])).toBe(
			true
		);
		expect(isValidOriginFromSettings("http://localhost:3000", ["*"])).toBe(
			true
		);
	});

	test("should allow localhost when configured", () => {
		expect(
			isValidOriginFromSettings("http://localhost:3000", ["localhost"])
		).toBe(true);
		expect(
			isValidOriginFromSettings("http://localhost", ["localhost"])
		).toBe(true);
	});

	test("should reject non-localhost when only localhost is allowed", () => {
		expect(
			isValidOriginFromSettings("https://example.com", ["localhost"])
		).toBe(false);
	});

	test("should match exact domains", () => {
		expect(
			isValidOriginFromSettings("https://cal.com", ["cal.com"])
		).toBe(true);
		expect(
			isValidOriginFromSettings("https://cal.com", ["example.com"])
		).toBe(false);
	});

	test("should match domains with protocol", () => {
		expect(
			isValidOriginFromSettings("https://cal.com", ["cal.com"])
		).toBe(true);
		expect(
			isValidOriginFromSettings("http://cal.com", ["cal.com"])
		).toBe(true);
	});

	test("should match subdomains with wildcard pattern", () => {
		expect(
			isValidOriginFromSettings("https://app.cal.com", ["*.cal.com"])
		).toBe(true);
		expect(
			isValidOriginFromSettings("https://api.cal.com", ["*.cal.com"])
		).toBe(true);
		expect(
			isValidOriginFromSettings("https://cal.com", ["*.cal.com"])
		).toBe(true);
	});

	test("should reject non-matching subdomains with wildcard", () => {
		expect(
			isValidOriginFromSettings("https://example.com", ["*.cal.com"])
		).toBe(false);
		expect(
			isValidOriginFromSettings("https://cal.example.com", ["*.cal.com"])
		).toBe(false);
	});

	test("should match nested subdomains with wildcard", () => {
		expect(
			isValidOriginFromSettings("https://api.v1.cal.com", ["*.cal.com"])
		).toBe(true);
	});

	test("should handle multiple allowed origins", () => {
		const allowed = ["cal.com", "*.example.com", "localhost"];
		expect(
			isValidOriginFromSettings("https://cal.com", allowed)
		).toBe(true);
		expect(
			isValidOriginFromSettings("https://app.example.com", allowed)
		).toBe(true);
		expect(
			isValidOriginFromSettings("http://localhost:3000", allowed)
		).toBe(true);
		expect(
			isValidOriginFromSettings("https://malicious.com", allowed)
		).toBe(false);
	});

	test("should handle invalid origin URLs gracefully", () => {
		expect(
			isValidOriginFromSettings("not-a-url", ["cal.com"])
		).toBe(false);
		expect(
			isValidOriginFromSettings("ftp://example.com", ["cal.com"])
		).toBe(false);
	});

	test("should normalize domains correctly", () => {
		expect(
			isValidOriginFromSettings("https://www.cal.com", ["cal.com"])
		).toBe(true);
		expect(
			isValidOriginFromSettings("https://CAL.COM", ["cal.com"])
		).toBe(true);
	});

	test("should handle ports in origin URLs", () => {
		expect(
			isValidOriginFromSettings("https://cal.com:3000", ["cal.com"])
		).toBe(true);
		expect(
			isValidOriginFromSettings("http://localhost:8080", ["localhost"])
		).toBe(true);
	});
});

describe("isValidIpFromSettings", () => {
	test("should allow all IPs when allowedIps is empty", () => {
		expect(isValidIpFromSettings("192.168.1.1", [])).toBe(true);
		expect(isValidIpFromSettings("10.0.0.1", [])).toBe(true);
	});

	test("should allow all IPs when allowedIps is undefined", () => {
		expect(isValidIpFromSettings("192.168.1.1", undefined)).toBe(true);
	});

	test("should allow empty IP", () => {
		expect(isValidIpFromSettings("", ["192.168.1.1"])).toBe(true);
		expect(isValidIpFromSettings("   ", ["192.168.1.1"])).toBe(true);
	});

	test("should match exact IPv4 addresses", () => {
		expect(isValidIpFromSettings("192.168.1.1", ["192.168.1.1"])).toBe(
			true
		);
		expect(isValidIpFromSettings("10.0.0.1", ["10.0.0.1"])).toBe(true);
		expect(isValidIpFromSettings("192.168.1.2", ["192.168.1.1"])).toBe(
			false
		);
	});

	test("should match IPv6 addresses", () => {
		const ipv6 = "2001:0db8:85a3:0000:0000:8a2e:0370:7334";
		expect(isValidIpFromSettings(ipv6, [ipv6])).toBe(true);
		expect(
			isValidIpFromSettings(ipv6, ["2001:0db8:85a3:0000:0000:8a2e:0370:7335"])
		).toBe(false);
	});

	test("should match IPs within CIDR range", () => {
		expect(
			isValidIpFromSettings("192.168.1.100", ["192.168.1.0/24"])
		).toBe(true);
		expect(
			isValidIpFromSettings("192.168.1.255", ["192.168.1.0/24"])
		).toBe(true);
		expect(
			isValidIpFromSettings("192.168.1.0", ["192.168.1.0/24"])
		).toBe(true);
	});

	test("should reject IPs outside CIDR range", () => {
		expect(
			isValidIpFromSettings("192.168.2.1", ["192.168.1.0/24"])
		).toBe(false);
		expect(
			isValidIpFromSettings("192.169.1.1", ["192.168.1.0/24"])
		).toBe(false);
	});

	test("should handle /32 CIDR (single IP)", () => {
		expect(
			isValidIpFromSettings("192.168.1.1", ["192.168.1.1/32"])
		).toBe(true);
		expect(
			isValidIpFromSettings("192.168.1.2", ["192.168.1.1/32"])
		).toBe(false);
	});

	test("should handle /16 CIDR range", () => {
		expect(
			isValidIpFromSettings("192.168.1.1", ["192.168.0.0/16"])
		).toBe(true);
		expect(
			isValidIpFromSettings("192.168.255.255", ["192.168.0.0/16"])
		).toBe(true);
		expect(
			isValidIpFromSettings("192.169.0.1", ["192.168.0.0/16"])
		).toBe(false);
	});

	test("should handle /8 CIDR range", () => {
		expect(
			isValidIpFromSettings("10.1.2.3", ["10.0.0.0/8"])
		).toBe(true);
		expect(
			isValidIpFromSettings("10.255.255.255", ["10.0.0.0/8"])
		).toBe(true);
		expect(
			isValidIpFromSettings("11.0.0.1", ["10.0.0.0/8"])
		).toBe(false);
	});

	test("should handle multiple allowed IPs", () => {
		const allowed = ["192.168.1.1", "10.0.0.0/8", "172.16.0.0/12"];
		expect(isValidIpFromSettings("192.168.1.1", allowed)).toBe(true);
		expect(isValidIpFromSettings("10.5.5.5", allowed)).toBe(true);
		expect(isValidIpFromSettings("172.16.1.1", allowed)).toBe(true);
		expect(isValidIpFromSettings("8.8.8.8", allowed)).toBe(false);
	});

	test("should handle invalid CIDR notation gracefully", () => {
		expect(
			isValidIpFromSettings("192.168.1.1", ["192.168.1.0/33"])
		).toBe(false);
		expect(
			isValidIpFromSettings("192.168.1.1", ["192.168.1.0/-1"])
		).toBe(false);
		expect(
			isValidIpFromSettings("192.168.1.1", ["invalid/cidr"])
		).toBe(false);
	});

	test("should trim whitespace from IPs", () => {
		expect(
			isValidIpFromSettings("  192.168.1.1  ", ["192.168.1.1"])
		).toBe(true);
	});

	test("should handle edge cases for CIDR ranges", () => {
		expect(
			isValidIpFromSettings("0.0.0.0", ["0.0.0.0/32"])
		).toBe(true);
		expect(
			isValidIpFromSettings("255.255.255.255", ["255.255.255.255/32"])
		).toBe(true);
		expect(
			isValidIpFromSettings("0.0.0.1", ["0.0.0.0/32"])
		).toBe(false);
	});
});

