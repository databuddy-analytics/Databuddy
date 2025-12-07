import { afterAll, describe, expect, test } from "bun:test";
import {
	anonymizeIp,
	closeGeoIPReader,
	extractIpFromRequest,
	getGeo,
} from "./ip-geo";

const ipRegex = /^[a-f0-9]{12}$/;

function generateRandomIPv4(): string {
	const octets = Array.from({ length: 4 }, () =>
		Math.floor(Math.random() * 256)
	);
	return octets.join(".");
}

function generatePublicIPv4(): string {
	const privateRanges = [
		{ start: [10, 0, 0, 0], end: [10, 255, 255, 255] },
		{ start: [172, 16, 0, 0], end: [172, 31, 255, 255] },
		{ start: [192, 168, 0, 0], end: [192, 168, 255, 255] },
		{ start: [127, 0, 0, 0], end: [127, 255, 255, 255] },
	];

	let ip: string;
	let isPrivate: boolean;

	do {
		const octets = [
			Math.floor(Math.random() * 223) + 1,
			Math.floor(Math.random() * 256),
			Math.floor(Math.random() * 256),
			Math.floor(Math.random() * 256),
		];

		isPrivate = privateRanges.some(
			(range) =>
				octets[0] >= range.start[0] &&
				octets[0] <= range.end[0] &&
				octets[1] >= range.start[1] &&
				octets[1] <= range.end[1]
		);

		ip = octets.join(".");
	} while (isPrivate);

	return ip;
}

function generateIPv4InRange(
	start: [number, number, number, number],
	end: [number, number, number, number]
): string {
	const octets = start.map(
		(startOctet, index) =>
			startOctet + Math.floor(Math.random() * (end[index] - startOctet + 1))
	);
	return octets.join(".");
}

function generateRandomIPv6(): string {
	const segments = Array.from({ length: 8 }, () =>
		Math.floor(Math.random() * 65_536)
			.toString(16)
			.padStart(4, "0")
	);
	return segments.join(":");
}

function isValidGeoResponse(result: {
	anonymizedIP: string;
	country: string | undefined;
	region: string | undefined;
	city: string | undefined;
}): boolean {
	return (
		typeof result.anonymizedIP === "string" &&
		(result.country === undefined || typeof result.country === "string") &&
		(result.region === undefined || typeof result.region === "string") &&
		(result.city === undefined || typeof result.city === "string")
	);
}

describe("ip-geo utilities", () => {
	afterAll(() => {
		closeGeoIPReader();
	});

	describe("anonymizeIp", () => {
		test("should anonymize valid IPv4 address", () => {
			const ip = "192.168.1.1";
			const anonymized = anonymizeIp(ip);

			expect(anonymized).toBeTruthy();
			expect(anonymized.length).toBe(12);
			expect(anonymized).toMatch(ipRegex);
		});

		test("should anonymize valid IPv6 address", () => {
			const ip = "2001:0db8:85a3:0000:0000:8a2e:0370:7334";
			const anonymized = anonymizeIp(ip);

			expect(anonymized).toBeTruthy();
			expect(anonymized.length).toBe(12);
		});

		test("should return consistent hash for same IP", () => {
			const ip = "8.8.8.8";
			const hash1 = anonymizeIp(ip);
			const hash2 = anonymizeIp(ip);

			expect(hash1).toBe(hash2);
		});

		test("should return different hashes for different IPs", () => {
			const ip1 = "8.8.8.8";
			const ip2 = "1.1.1.1";
			const hash1 = anonymizeIp(ip1);
			const hash2 = anonymizeIp(ip2);

			expect(hash1).not.toBe(hash2);
		});

		test("should handle empty string", () => {
			const result = anonymizeIp("");
			expect(result).toBe("");
		});

		test("should generate unique hashes for 1000 random IPs", () => {
			const hashes = new Set<string>();
			const ips = Array.from({ length: 1000 }, () => generateRandomIPv4());

			for (const ip of ips) {
				const hash = anonymizeIp(ip);
				expect(hash.length).toBe(12);
				expect(hash).toMatch(ipRegex);
				hashes.add(hash);
			}

			expect(hashes.size).toBe(ips.length);
		});
	});

	describe("extractIpFromRequest", () => {
		test("should extract IP from cf-connecting-ip header", () => {
			const request = new Request("https://example.com", {
				headers: {
					"cf-connecting-ip": "1.2.3.4",
				},
			});

			const ip = extractIpFromRequest(request);
			expect(ip).toBe("1.2.3.4");
		});

		test("should extract IP from x-forwarded-for header", () => {
			const request = new Request("https://example.com", {
				headers: {
					"x-forwarded-for": "5.6.7.8, 9.10.11.12",
				},
			});

			const ip = extractIpFromRequest(request);
			expect(ip).toBe("5.6.7.8");
		});

		test("should extract IP from x-real-ip header", () => {
			const request = new Request("https://example.com", {
				headers: {
					"x-real-ip": "13.14.15.16",
				},
			});

			const ip = extractIpFromRequest(request);
			expect(ip).toBe("13.14.15.16");
		});

		test("should prioritize cf-connecting-ip over other headers", () => {
			const request = new Request("https://example.com", {
				headers: {
					"cf-connecting-ip": "1.2.3.4",
					"x-forwarded-for": "5.6.7.8",
					"x-real-ip": "9.10.11.12",
				},
			});

			const ip = extractIpFromRequest(request);
			expect(ip).toBe("1.2.3.4");
		});

		test("should prioritize x-forwarded-for over x-real-ip", () => {
			const request = new Request("https://example.com", {
				headers: {
					"x-forwarded-for": "5.6.7.8",
					"x-real-ip": "9.10.11.12",
				},
			});

			const ip = extractIpFromRequest(request);
			expect(ip).toBe("5.6.7.8");
		});

		test("should trim whitespace from IP addresses", () => {
			const request = new Request("https://example.com", {
				headers: {
					"cf-connecting-ip": "  1.2.3.4  ",
				},
			});

			const ip = extractIpFromRequest(request);
			expect(ip).toBe("1.2.3.4");
		});

		test("should return empty string when no IP headers present", () => {
			const request = new Request("https://example.com");
			const ip = extractIpFromRequest(request);
			expect(ip).toBe("");
		});

		test("should extract 100 random IPs from headers", () => {
			for (let i = 0; i < 100; i++) {
				const randomIp = generateRandomIPv4();
				const request = new Request("https://example.com", {
					headers: {
						"cf-connecting-ip": randomIp,
					},
				});

				const extractedIp = extractIpFromRequest(request);
				expect(extractedIp).toBe(randomIp);
			}
		});
	});

	describe("getGeo - basic functionality", () => {
		test("should return undefined geo data for empty IP", async () => {
			const result = await getGeo("");

			expect(result.anonymizedIP).toBe("");
			expect(result.country).toBeUndefined();
			expect(result.region).toBeUndefined();
			expect(result.city).toBeUndefined();
		});

		test("should return undefined geo data for localhost IPv4", async () => {
			const result = await getGeo("127.0.0.1");

			expect(result.anonymizedIP).toBeTruthy();
			expect(result.country).toBeUndefined();
			expect(result.region).toBeUndefined();
			expect(result.city).toBeUndefined();
		});

		test("should return undefined geo data for localhost IPv6", async () => {
			const result = await getGeo("::1");

			expect(result.anonymizedIP).toBeTruthy();
			expect(result.country).toBeUndefined();
			expect(result.region).toBeUndefined();
			expect(result.city).toBeUndefined();
		});

		test("should return undefined geo data for invalid IP format", async () => {
			const result = await getGeo("not-an-ip");

			expect(result.anonymizedIP).toBeTruthy();
			expect(result.country).toBeUndefined();
			expect(result.region).toBeUndefined();
			expect(result.city).toBeUndefined();
		});

		test("should handle 100 invalid IP formats", async () => {
			const invalidFormats = [
				...Array.from({ length: 30 }, () => `${Math.random()}`),
				...Array.from({ length: 30 }, () => `invalid-${Math.random()}`),
				...Array.from({ length: 40 }, () => {
					const parts = Math.floor(Math.random() * 3) + 1;
					return Array.from({ length: parts }, () =>
						Math.floor(Math.random() * 256)
					).join(".");
				}),
			];

			for (const invalid of invalidFormats) {
				const result = await getGeo(invalid);
				expect(result.country).toBeUndefined();
				expect(result.region).toBeUndefined();
				expect(result.city).toBeUndefined();
			}
		});
	});

	describe("getGeo - massive random IP testing", () => {
		test("should handle 500 random public IPv4 addresses", async () => {
			const ips = Array.from({ length: 500 }, () => generatePublicIPv4());
			const results = await Promise.all(ips.map((ip) => getGeo(ip)));

			for (const result of results) {
				expect(isValidGeoResponse(result)).toBe(true);
				expect(result.anonymizedIP).toBeTruthy();
				expect(result.anonymizedIP.length).toBe(12);
			}
		});

		test("should handle 200 random IPv6 addresses", async () => {
			const ips = Array.from({ length: 200 }, () => generateRandomIPv6());
			const results = await Promise.all(ips.map((ip) => getGeo(ip)));

			for (const result of results) {
				expect(isValidGeoResponse(result)).toBe(true);
			}
		});

		test("should handle 300 private IP addresses", async () => {
			const privateRanges = [
				{ start: [10, 0, 0, 0], end: [10, 255, 255, 255] },
				{ start: [172, 16, 0, 0], end: [172, 31, 255, 255] },
				{ start: [192, 168, 0, 0], end: [192, 168, 255, 255] },
			];

			const ips = Array.from({ length: 300 }, (_, i) => {
				const range = privateRanges[i % privateRanges.length];
				return generateIPv4InRange(
					range.start as [number, number, number, number],
					range.end as [number, number, number, number]
				);
			});

			const results = await Promise.all(ips.map((ip) => getGeo(ip)));

			for (const result of results) {
				expect(isValidGeoResponse(result)).toBe(true);
				expect(result.anonymizedIP).toBeTruthy();
			}
		});
	});

	describe("getGeo - known IP ranges geolocation validation", () => {
		test("should lookup geolocation for 100 IPs in US range", async () => {
			const ips = Array.from({ length: 100 }, () =>
				generateIPv4InRange([8, 0, 0, 0], [8, 255, 255, 255])
			);

			const results = await Promise.all(ips.map((ip) => getGeo(ip)));

			for (const result of results) {
				expect(isValidGeoResponse(result)).toBe(true);
				if (result.country) {
					expect(typeof result.country).toBe("string");
					expect(result.country.length).toBeGreaterThan(0);
				}
			}
		});

		test("should lookup geolocation for 100 IPs in EU range", async () => {
			const ips = Array.from({ length: 100 }, () =>
				generateIPv4InRange([2, 0, 0, 0], [2, 255, 255, 255])
			);

			const results = await Promise.all(ips.map((ip) => getGeo(ip)));

			for (const result of results) {
				expect(isValidGeoResponse(result)).toBe(true);
			}
		});

		test("should lookup geolocation for 100 IPs in APNIC range", async () => {
			const ips = Array.from({ length: 100 }, () =>
				generateIPv4InRange([1, 0, 0, 0], [1, 255, 255, 255])
			);

			const results = await Promise.all(ips.map((ip) => getGeo(ip)));

			for (const result of results) {
				expect(isValidGeoResponse(result)).toBe(true);
			}
		});

		test("should lookup geolocation for 100 IPs in ARIN range", async () => {
			const ips = Array.from({ length: 100 }, () =>
				generateIPv4InRange([3, 0, 0, 0], [3, 255, 255, 255])
			);

			const results = await Promise.all(ips.map((ip) => getGeo(ip)));

			for (const result of results) {
				expect(isValidGeoResponse(result)).toBe(true);
			}
		});

		test("should lookup geolocation for 100 IPs in LACNIC range", async () => {
			const ips = Array.from({ length: 100 }, () =>
				generateIPv4InRange([200, 0, 0, 0], [200, 255, 255, 255])
			);

			const results = await Promise.all(ips.map((ip) => getGeo(ip)));

			for (const result of results) {
				expect(isValidGeoResponse(result)).toBe(true);
			}
		});

		test("should lookup geolocation for 100 IPs in AfriNIC range", async () => {
			const ips = Array.from({ length: 100 }, () =>
				generateIPv4InRange([41, 0, 0, 0], [41, 255, 255, 255])
			);

			const results = await Promise.all(ips.map((ip) => getGeo(ip)));

			for (const result of results) {
				expect(isValidGeoResponse(result)).toBe(true);
			}
		});
	});

	describe("getGeo - stress testing with diverse IP patterns", () => {
		test("should handle 1000 IPs from diverse ranges", async () => {
			const ranges = [
				[1, 255],
				[2, 255],
				[3, 255],
				[4, 255],
				[5, 255],
				[8, 255],
				[12, 255],
				[13, 255],
				[14, 255],
				[15, 255],
			];

			const ips = Array.from({ length: 1000 }, (_, i) => {
				const range = ranges[i % ranges.length];
				return generateIPv4InRange(
					[range[0], 0, 0, 0],
					[range[0], range[1], 255, 255]
				);
			});

			const results = await Promise.all(ips.map((ip) => getGeo(ip)));

			let countriesFound = 0;
			let regionsFound = 0;
			let citiesFound = 0;

			for (const result of results) {
				expect(isValidGeoResponse(result)).toBe(true);
				expect(result.anonymizedIP).toBeTruthy();
				expect(result.anonymizedIP.length).toBe(12);

				if (result.country) {
					countriesFound += 1;
				}
				if (result.region) {
					regionsFound += 1;
				}
				if (result.city) {
					citiesFound += 1;
				}
			}

			console.log(
				`Stats: ${countriesFound} countries, ${regionsFound} regions, ${citiesFound} cities found out of 1000 IPs`
			);
		});

		test("should handle 500 edge case IPs", async () => {
			const edgeCases = [
				...Array.from({ length: 100 }, () =>
					generateIPv4InRange([0, 0, 0, 1], [0, 255, 255, 254])
				),
				...Array.from({ length: 100 }, () =>
					generateIPv4InRange([255, 0, 0, 0], [255, 255, 255, 255])
				),
				...Array.from({ length: 100 }, () =>
					generateIPv4InRange([224, 0, 0, 0], [239, 255, 255, 255])
				),
				...Array.from({ length: 100 }, () =>
					generateIPv4InRange([240, 0, 0, 0], [255, 255, 255, 254])
				),
				...Array.from({ length: 100 }, () =>
					generateIPv4InRange([100, 64, 0, 0], [100, 127, 255, 255])
				),
			];

			const results = await Promise.all(edgeCases.map((ip) => getGeo(ip)));

			for (const result of results) {
				expect(isValidGeoResponse(result)).toBe(true);
			}
		});
	});

	describe("getGeo - consistency and caching behavior", () => {
		test("should return consistent results for same IP called multiple times", async () => {
			const ip = generatePublicIPv4();
			const results = await Promise.all(
				Array.from({ length: 10 }, () => getGeo(ip))
			);

			const firstResult = results[0];
			for (const result of results) {
				expect(result.anonymizedIP).toBe(firstResult.anonymizedIP);
				expect(result.country).toBe(firstResult.country);
				expect(result.region).toBe(firstResult.region);
				expect(result.city).toBe(firstResult.city);
			}
		});

		test("should handle rapid sequential lookups of 200 different IPs", async () => {
			const ips = Array.from({ length: 200 }, () => generatePublicIPv4());

			const startTime = Date.now();
			const results = await Promise.all(ips.map((ip) => getGeo(ip)));
			const duration = Date.now() - startTime;

			expect(results.length).toBe(200);
			for (const result of results) {
				expect(isValidGeoResponse(result)).toBe(true);
			}

			console.log(`200 lookups completed in ${duration}ms`);
		});
	});

	describe("getGeo - comprehensive validation", () => {
		test("should validate data types and structure for 500 lookups", async () => {
			const ips = Array.from({ length: 500 }, () => generatePublicIPv4());
			const results = await Promise.all(ips.map((ip) => getGeo(ip)));

			for (const result of results) {
				expect(result).toHaveProperty("anonymizedIP");
				expect(result).toHaveProperty("country");
				expect(result).toHaveProperty("region");
				expect(result).toHaveProperty("city");

				expect(typeof result.anonymizedIP).toBe("string");
				expect(result.anonymizedIP).toMatch(ipRegex);

				if (result.country !== undefined) {
					expect(typeof result.country).toBe("string");
					expect(result.country.length).toBeGreaterThan(0);
				}

				if (result.region !== undefined) {
					expect(typeof result.region).toBe("string");
					expect(result.region.length).toBeGreaterThan(0);
				}

				if (result.city !== undefined) {
					expect(typeof result.city).toBe("string");
					expect(result.city.length).toBeGreaterThan(0);
				}
			}
		});

		test("should handle mixed valid and invalid IPs (500 total)", async () => {
			const validIps = Array.from({ length: 250 }, () => generatePublicIPv4());
			const invalidIps = Array.from(
				{ length: 250 },
				() => `invalid-${Math.random()}`
			);
			const mixedIps = [...validIps, ...invalidIps].sort(
				() => Math.random() - 0.5
			);

			const results = await Promise.all(mixedIps.map((ip) => getGeo(ip)));

			expect(results.length).toBe(500);
			for (const result of results) {
				expect(isValidGeoResponse(result)).toBe(true);
			}
		});
	});

	describe("closeGeoIPReader", () => {
		test("should not throw when called", () => {
			expect(() => closeGeoIPReader()).not.toThrow();
		});

		test("should allow subsequent getGeo calls after closing", async () => {
			closeGeoIPReader();
			const result = await getGeo("8.8.8.8");
			expect(result).toBeDefined();
		});
	});
});
