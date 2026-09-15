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

async function withEnv<T>(
	overrides: Record<string, string>,
	callback: () => Promise<T>
): Promise<T> {
	const original = process.env;
	process.env = { ...original, ...overrides };
	try {
		return await callback();
	} finally {
		process.env = original;
	}
}

describe("dashboard next config", () => {
	it("allows configured API and ingestion origins in production", async () => {
		await withEnv(
			{
				NODE_ENV: "production",
				NEXT_PUBLIC_API_URL: "https://api.example.com/prefix",
				NEXT_PUBLIC_BASKET_URL: "https://events.example.com:8443",
			},
			async () => {
				for (const source of [
					"/demo/:path*",
					"/public/:path*",
					"/((?!demo|public).*)",
				]) {
					const csp = await getCspHeader(source);
					const connect = csp
						.split(";")
						.find((part) => part.trim().startsWith("connect-src"));
					expect(connect).toContain("https://api.example.com");
					expect(connect).toContain("https://events.example.com:8443");
					expect(connect).toContain("https://*.databuddy.cc");
					expect(connect).not.toContain("/prefix");
					expect(csp).not.toContain("'unsafe-eval'");
				}
			}
		);
	});

	it("allows official docs and app origins to frame demo routes", async () => {
		await withEnv({ NODE_ENV: "production" }, async () => {
			const csp = await getCspHeader("/demo/:path*");

			expect(csp).toContain(
				`frame-ancestors 'self' ${officialDemoFrameAncestors.join(" ")}`
			);
			expect(csp).not.toContain("ws://");
		});
	});

	it("applies the same frame ancestor policy to public dashboard routes", async () => {
		await withEnv({ NODE_ENV: "production" }, async () => {
			const csp = await getCspHeader("/public/:path*");

			expect(csp).toContain("https://www.databuddy.cc");
			expect(csp).toContain("https://app.databuddy.cc");
		});
	});

	it("allows the OpenAI Ads measurement pixel on app routes", async () => {
		await withEnv({ NODE_ENV: "production" }, async () => {
			const csp = await getCspHeader("/((?!demo|public).*)");

			expect(csp).toContain("https://bzrcdn.openai.com");
			expect(csp).toContain("https://bzr.openai.com");
		});
	});
});
