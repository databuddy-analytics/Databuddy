import { describe, expect, test } from "vitest";
import { isOriginAllowed } from "@hooks/auth";
import {
	isValidIpFromSettings,
	isValidOriginFromSettings,
} from "@utils/origin-ip-validation";

describe("isValidOriginFromSettings", () => {
	const cases: [string, string[], boolean][] = [
		["https://example.com", ["*"], true],
		["https://a.example.com", ["*.example.com"], true],
		["https://example.com", ["*.example.com"], true],
		["https://deep.sub.example.com", ["*.example.com"], true],
		["https://example.com", ["https://example.com"], true],
		["http://localhost:3000", ["http://localhost:3000"], true],
		["http://localhost:3000", ["http://localhost:*"], true],
		["http://localhost:5173", ["http://localhost:*"], true],
		["https://app.cal.com", ["*.cal.com"], true],
		["https://a.example.com", ["*.example.com", "*.other.com"], true],

		["https://example.com", ["https://other.com"], false],
		["http://localhost:3000", ["https://example.com"], false],
		["https://example.com", ["*.cal.com"], false],
		["https://cal.example.com", ["*.cal.com"], false],
		["not-a-url", ["not-a-url"], false],
		["https://a.example.com", ["*.other.com", "*.diff.com"], false],
	];

	for (const [origin, allowed, expected] of cases) {
		const label = expected
			? `${origin} vs ${allowed.join(",")} → true`
			: `${origin} vs ${allowed.join(",")} → false`;
		test(label, () =>
			expect(isValidOriginFromSettings(origin, allowed)).toBe(expected)
		);
	}
});

describe("isOriginAllowed (domain + allowedOrigins additive)", () => {
	const cases: [string, string, string[] | undefined, boolean][] = [
		["https://example.com", "example.com", undefined, true],
		["https://www.example.com", "example.com", undefined, true],
		["https://app.example.com", "example.com", undefined, true],
		["https://example.com", "example.com", ["trusted.com"], true],
		["https://www.example.com", "example.com", ["trusted.com"], true],
		["https://trusted.com", "example.com", ["trusted.com"], true],
		["https://*.trusted.com", "example.com", ["*.trusted.com"], false],
		["https://sub.trusted.com", "example.com", ["*.trusted.com"], true],

		["https://evil.com", "example.com", undefined, false],
		["https://evil.com", "example.com", ["trusted.com"], false],
		["null", "example.com", ["trusted.com"], false],
	];

	for (const [origin, domain, allowed, expected] of cases) {
		const label = `${origin} vs domain=${domain} allowed=${
			allowed?.join(",") ?? "—"
		} → ${expected}`;
		test(label, () => expect(isOriginAllowed(origin, domain, allowed)).toBe(expected));
	}
});

describe("isValidIpFromSettings", () => {
	const cases: [string, string[], boolean][] = [
		["10.0.0.1", ["10.0.0.1"], true],
		["::1", ["::1"], true],
		["10.0.0.1", ["10.0.0.0/24"], true],
		["10.0.0.255", ["10.0.0.0/24"], true],
		["192.168.1.100", ["192.168.0.0/16"], true],
		["10.0.0.1", ["10.0.0.0/8"], true],
		["10.0.0.1", ["10.0.0.1/32"], true],
		["10.0.0.1", ["10.0.0.0/24", "172.16.0.0/12"], true],

		["10.0.0.2", ["10.0.0.1"], false],
		["::2", ["::1"], false],
		["10.0.1.0", ["10.0.0.0/24"], false],
		["10.0.0.2", ["10.0.0.1/32"], false],
		["192.169.0.0", ["192.168.0.0/16"], false],
		["11.0.0.1", ["10.0.0.0/8"], false],
		["10.0.0.1", ["10.0.0.0/33"], false],
		["10.0.0.1", ["10.0.0.0/-1"], false],
		["10.0.0.1", ["invalid/24"], false],
		["10.0.0.1", ["172.16.0.0/12", "192.168.0.0/16"], false],
		["0.0.0.1", ["0.0.0.0/32"], false],
	];

	for (const [ip, allowed, expected] of cases) {
		const label = expected
			? `${ip} vs ${allowed.join(",")} → true`
			: `${ip} vs ${allowed.join(",")} → false`;
		test(label, () =>
			expect(isValidIpFromSettings(ip, allowed)).toBe(expected)
		);
	}
});
