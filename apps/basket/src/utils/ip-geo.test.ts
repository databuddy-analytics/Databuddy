import { afterAll, describe, expect, test, vi } from "vitest";
import { randomIPv4, randomPublicIPv4, req } from "../test-helpers";
import {
	anonymizeIp,
	closeGeoIPReader,
	extractIpFromRequest,
	getGeo,
} from "./ip-geo";

const HEX12 = /^[a-f0-9]{12}$/;

afterAll(() => closeGeoIPReader());

describe("anonymizeIp", () => {
	test("empty → empty", () => expect(anonymizeIp("")).toBe(""));

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

describe("extractIpFromRequest", () => {
	const table: [string, Record<string, string>, string][] = [
		["cf-connecting-ip", { "cf-connecting-ip": "1.2.3.4" }, "1.2.3.4"],
		[
			"x-forwarded-for alone is not trusted by default",
			{ "x-forwarded-for": "5.6.7.8, 9.10.11.12" },
			"",
		],
		[
			"cf > xff priority",
			{
				"cf-connecting-ip": "1.1.1.1",
				"x-forwarded-for": "2.2.2.2",
			},
			"1.1.1.1",
		],
		["trims whitespace", { "cf-connecting-ip": "  1.2.3.4  " }, "1.2.3.4"],
		["no headers → empty", {}, ""],
	];

	for (const [label, headers, expected] of table) {
		test(label, () =>
			expect(extractIpFromRequest(req("https://x.com", headers))).toBe(expected)
		);
	}

	test("x-forwarded-for is honored only when configured as trusted header", () => {
		const request = req("https://x.com", {
			"x-forwarded-for": "5.6.7.8, 9.10.11.12",
		});

		expect(extractIpFromRequest(request, "x-forwarded-for")).toBe("5.6.7.8");
	});
});

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

	test("falls back to the Cloudflare country header when MaxMind is unavailable", async () => {
		closeGeoIPReader();
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockRejectedValue(new Error("CDN unreachable"));
		try {
			const withHeader = await getGeo(
				randomPublicIPv4(),
				req("https://x.com", { "cf-ipcountry": "US" })
			);
			expect(withHeader.country).toBe("US");
			expect(withHeader.region).toBeUndefined();
			expect(withHeader.city).toBeUndefined();

			const badHeader = await getGeo(
				randomPublicIPv4(),
				req("https://x.com", { "cf-ipcountry": "USA" })
			);
			expect(badHeader.country).toBeUndefined();
		} finally {
			fetchSpy.mockRestore();
			closeGeoIPReader();
		}
	});

	test("accepts compressed and ipv4-mapped IPv6 addresses", async () => {
		closeGeoIPReader();
		const fetchSpy = vi
			.spyOn(globalThis, "fetch")
			.mockRejectedValue(new Error("CDN unreachable"));
		try {
			for (const ip of [
				"2a00:1450:4009:81f::200e",
				"2001:db8::1",
				"::ffff:8.8.8.8",
			]) {
				const r = await getGeo(
					ip,
					req("https://x.com", { "cf-ipcountry": "DE" })
				);
				expect(r.country).toBe("DE");
			}
		} finally {
			fetchSpy.mockRestore();
			closeGeoIPReader();
		}
	});
});
