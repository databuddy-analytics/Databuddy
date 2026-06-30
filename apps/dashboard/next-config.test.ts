import { describe, expect, it } from "bun:test";
import nextConfig from "./next.config";

const officialDemoFrameAncestors = [
	"https://www.databuddy.cc",
	"https://databuddy.cc",
	"https://app.databuddy.cc",
	"https://preview.databuddy.cc",
	"https://staging.databuddy.cc",
] as const;

async function getCspHeader(source: string): Promise<string> {
	const headers = await nextConfig.headers?.();
	const routeHeaders = headers?.find(
		(route) => route.source === source
	)?.headers;
	const csp = routeHeaders?.find(
		(header) => header.key === "Content-Security-Policy"
	)?.value;

	if (!csp) {
		throw new Error(`Missing CSP header for ${source}`);
	}

	return csp;
}

async function withNodeEnv<T>(
	value: string,
	callback: () => Promise<T>
): Promise<T> {
	const original = process.env.NODE_ENV;
	process.env.NODE_ENV = value;
	try {
		return await callback();
	} finally {
		if (original === undefined) {
			delete process.env.NODE_ENV;
		} else {
			process.env.NODE_ENV = original;
		}
	}
}

describe("dashboard next config", () => {
	it("allows official docs and app origins to frame demo routes", async () => {
		await withNodeEnv("production", async () => {
			const csp = await getCspHeader("/demo/:path*");

			expect(csp).toContain(
				`frame-ancestors 'self' ${officialDemoFrameAncestors.join(" ")}`
			);
			expect(csp).not.toContain("ws://");
		});
	});

	it("applies the same frame ancestor policy to public dashboard routes", async () => {
		await withNodeEnv("production", async () => {
			const csp = await getCspHeader("/public/:path*");

			expect(csp).toContain("https://www.databuddy.cc");
			expect(csp).toContain("https://app.databuddy.cc");
		});
	});
});
