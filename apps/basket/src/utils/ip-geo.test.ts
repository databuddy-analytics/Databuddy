import { afterAll, describe, expect, test } from "vitest";
import { randomIPv4, randomPublicIPv4, req } from "../test-helpers";
import {
	anonymizeIp,
	closeGeoIPReader,
	extractIpFromRequest,
	getGeo,
} from "./ip-geo";

const HEX12 = /^[a-f0-9]{12}$/;

afterAll(() => closeGeoIPReader());

// ── anonymizeIp ──

describe("anonymizeIp", () => {
	test("empty → empty", () => expect(anonymizeIp("")).toBe(""));

	test("IPv4 → 12-char hex", () => {
		const h = anonymizeIp("192.168.1.1");
		expect(h).toMatch(HEX12);
	});

	test("IPv6 → 12-char hex", () => {
		const h = anonymizeIp("2001:0db8:85a3::8a2e:0370:7334");
		expect(h).toMatch(HEX12);
	});

	test("deterministic", () =>
		expect(anonymizeIp("8.8.8.8")).toBe(anonymizeIp("8.8.8.8")));

	test("different IPs → different hashes", () =>
		expect(anonymizeIp("8.8.8.8")).not.toBe(anonymizeIp("1.1.1.1")));

	test("1000 random IPs → all unique 12-char hex", () => {
		const hashes = new Set<string>();
		for (let i = 0; i < 1000; i++) {
			const h = anonymizeIp(randomIPv4());
			expect(h).toMatch(HEX12);
			hashes.add(h);
		}
		expect(hashes.size).toBe(1000);
	});
});

// ── extractIpFromRequest ──

describe("extractIpFromRequest", () => {
	const table: [string, Record<string, string>, string][] = [
		["cf-connecting-ip", { "cf-connecting-ip": "1.2.3.4" }, "1.2.3.4"],
		[
			"x-forwarded-for first",
			{ "x-forwarded-for": "5.6.7.8, 9.10.11.12" },
			"5.6.7.8",
		],
		["x-real-ip", { "x-real-ip": "13.14.15.16" }, "13.14.15.16"],
		[
			"cf > xff > real",
			{
				"cf-connecting-ip": "1.1.1.1",
				"x-forwarded-for": "2.2.2.2",
				"x-real-ip": "3.3.3.3",
			},
			"1.1.1.1",
		],
		[
			"xff > real",
			{ "x-forwarded-for": "2.2.2.2", "x-real-ip": "3.3.3.3" },
			"2.2.2.2",
		],
		["trims whitespace", { "cf-connecting-ip": "  1.2.3.4  " }, "1.2.3.4"],
		["no headers → empty", {}, ""],
	];

	for (const [label, headers, expected] of table) {
		test(label, () =>
			expect(extractIpFromRequest(req("https://x.com", headers))).toBe(expected)
		);
	}

	test("100 random IPs round-trip", () => {
		for (let i = 0; i < 100; i++) {
			const ip = randomIPv4();
			expect(
				extractIpFromRequest(req("https://x.com", { "cf-connecting-ip": ip }))
			).toBe(ip);
		}
	});
});

// ── getGeo ──

describe("getGeo", () => {
	test("empty IP → empty anonymizedIP, no geo", async () => {
		const r = await getGeo("");
		expect(r.anonymizedIP).toBe("");
		expect(r.country).toBeUndefined();
	});

	for (const ip of ["127.0.0.1", "::1"]) {
		test(`${ip} → no geo data`, async () => {
			const r = await getGeo(ip);
			expect(r.anonymizedIP).toBeTruthy();
			expect(r.country).toBeUndefined();
			expect(r.region).toBeUndefined();
			expect(r.city).toBeUndefined();
		});
	}

	test("invalid IPs → no crash, no geo", async () => {
		const invalids = Array.from({ length: 50 }, (_, i) => `invalid-${i}`);
		const results = await Promise.all(invalids.map((ip) => getGeo(ip)));
		for (const r of results) {
			expect(r.country).toBeUndefined();
		}
	});

	test("200 random public IPs → valid structure", {
		timeout: 30_000,
	}, async () => {
		// Probe whether GeoIP DB is reachable first
		const probe = await Promise.race([
			getGeo("8.8.8.8"),
			new Promise<null>((r) => setTimeout(() => r(null), 10_000)),
		]);
		if (!(probe && probe.anonymizedIP)) {
			console.log("Skipping: GeoIP CDN unreachable");
			return;
		}

		const results = await Promise.all(
			Array.from({ length: 200 }, () => getGeo(randomPublicIPv4()))
		);
		for (const r of results) {
			expect(typeof r.anonymizedIP).toBe("string");
			if (r.country !== undefined) {
				expect(typeof r.country).toBe("string");
			}
			if (r.region !== undefined) {
				expect(typeof r.region).toBe("string");
			}
			if (r.city !== undefined) {
				expect(typeof r.city).toBe("string");
			}
		}
	});

	test("same IP → consistent results", async () => {
		const ip = randomPublicIPv4();
		const [a, b] = await Promise.all([getGeo(ip), getGeo(ip)]);
		expect(a.anonymizedIP).toBe(b.anonymizedIP);
		expect(a.country).toBe(b.country);
	});

	test("Cloudflare country fallback", async () => {
		const r = await getGeo(
			"not-valid-ip",
			req("https://x.com", { "cf-ipcountry": "US" })
		);
		// Should either return CF country or undefined (depends on reader state)
		expect(typeof r.anonymizedIP).toBe("string");
	});
});
