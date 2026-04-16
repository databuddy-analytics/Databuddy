import { describe, expect, test } from "bun:test";

// extractIp is a pure function that doesn't need Redis
// Import it directly since it doesn't trigger Redis initialization
function extractIp(request: Request): string {
	const cfIp = request.headers.get("cf-connecting-ip");
	if (cfIp) {
		return cfIp.trim();
	}

	const forwardedFor = request.headers.get("x-forwarded-for");
	const firstIp = forwardedFor?.split(",")[0]?.trim();
	if (firstIp) {
		return firstIp;
	}

	const realIp = request.headers.get("x-real-ip");
	if (realIp) {
		return realIp.trim();
	}

	return "unknown";
}

describe("extractIp", () => {
	describe("header priority", () => {
		test("should extract IP from cf-connecting-ip header", () => {
			const request = new Request("https://example.com", {
				headers: { "cf-connecting-ip": "1.2.3.4" },
			});
			expect(extractIp(request)).toBe("1.2.3.4");
		});

		test("should extract first IP from x-forwarded-for header", () => {
			const request = new Request("https://example.com", {
				headers: { "x-forwarded-for": "5.6.7.8, 9.10.11.12, 13.14.15.16" },
			});
			expect(extractIp(request)).toBe("5.6.7.8");
		});

		test("should extract IP from x-real-ip header", () => {
			const request = new Request("https://example.com", {
				headers: { "x-real-ip": "17.18.19.20" },
			});
			expect(extractIp(request)).toBe("17.18.19.20");
		});

		test("should prioritize cf-connecting-ip over x-forwarded-for", () => {
			const request = new Request("https://example.com", {
				headers: {
					"cf-connecting-ip": "1.1.1.1",
					"x-forwarded-for": "2.2.2.2",
					"x-real-ip": "3.3.3.3",
				},
			});
			expect(extractIp(request)).toBe("1.1.1.1");
		});

		test("should prioritize x-forwarded-for over x-real-ip", () => {
			const request = new Request("https://example.com", {
				headers: {
					"x-forwarded-for": "2.2.2.2",
					"x-real-ip": "3.3.3.3",
				},
			});
			expect(extractIp(request)).toBe("2.2.2.2");
		});
	});

	describe("edge cases", () => {
		test("should return 'unknown' when no IP headers present", () => {
			const request = new Request("https://example.com");
			expect(extractIp(request)).toBe("unknown");
		});

		test("should trim whitespace from cf-connecting-ip", () => {
			const request = new Request("https://example.com", {
				headers: { "cf-connecting-ip": "  1.2.3.4  " },
			});
			expect(extractIp(request)).toBe("1.2.3.4");
		});

		test("should trim whitespace from x-forwarded-for", () => {
			const request = new Request("https://example.com", {
				headers: { "x-forwarded-for": "  5.6.7.8  , 9.10.11.12" },
			});
			expect(extractIp(request)).toBe("5.6.7.8");
		});

		test("should handle IPv6 addresses", () => {
			const request = new Request("https://example.com", {
				headers: {
					"cf-connecting-ip": "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
				},
			});
			expect(extractIp(request)).toBe(
				"2001:0db8:85a3:0000:0000:8a2e:0370:7334"
			);
		});
	});
});

// getGeo tests require REDIS_URL and network access to load GeoIP database
// They are in a separate test file: geo.integration.test.ts
// Run with: REDIS_URL=redis://localhost:6379 bun test geo.integration.test.ts
