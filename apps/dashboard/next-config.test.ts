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
	overrides: Record<string, string | undefined>,
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
	it.each([
		undefined,
		"true",
		"false",
	])("respects SELFHOST=%s in browser config and signup tracking", async (selfhost) => {
		const child = Bun.spawn([process.execPath, "--no-env-file", "-"], {
			cwd: import.meta.dir,
			env: {
				NODE_ENV: "production",
				SELFHOST: selfhost,
				NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID: "synthetic-pixel",
			},
			stdin: new Blob([
				`
import assert from "node:assert/strict";
const { default: config } = await import("./next.config");
assert.equal(config.env.NEXT_PUBLIC_SELFHOST, ${JSON.stringify(String(selfhost === "true"))});
process.env.NEXT_PUBLIC_SELFHOST = config.env.NEXT_PUBLIC_SELFHOST;
const pixelId = config.env.NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID;
assert.equal(pixelId, ${JSON.stringify(selfhost === "true" ? "" : "synthetic-pixel")});
// Apply the value Next inlines into the browser bundle before loading the client.
process.env.NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID = pixelId;
const { publicConfig, isSelfHosted } = await import("@databuddy/env/public");
assert.equal(isSelfHosted, ${selfhost === "true"});
assert.equal(publicConfig.urls.api, ${JSON.stringify(selfhost === "true" ? "http://localhost:3001" : "https://api.databuddy.cc")});
assert.equal(publicConfig.urls.dashboard, ${JSON.stringify(selfhost === "true" ? "http://localhost:3000" : "https://app.databuddy.cc")});
const scripts = [];
globalThis.window = { location: { hostname: "app.example.com" } };
globalThis.document = {
  createElement: () => ({}),
  head: { firstChild: null, insertBefore: script => scripts.push(script.src) },
};
const { trackOpenAiRegistrationCompleted } = await import("./components/openai-ads-pixel");
trackOpenAiRegistrationCompleted();
assert.deepEqual(scripts, ${JSON.stringify(selfhost === "true" ? [] : ["https://bzrcdn.openai.com/sdk/oaiq.min.js"])});
assert.equal(window.oaiq?.q?.some(args => args[0] === "measure") ?? false, ${selfhost !== "true"});
`,
			]),
			stdout: "ignore",
			stderr: "pipe",
		});
		const [exitCode, stderr] = await Promise.all([
			child.exited,
			new Response(child.stderr).text(),
		]);
		expect(exitCode, stderr).toBe(0);
	});

	it.each([
		undefined,
		"false",
		"true",
	])("adds configured origins only for SELFHOST=%s", async (selfhost) => {
		await withEnv(
			{
				NODE_ENV: "production",
				SELFHOST: selfhost,
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
					expect(connect?.includes("https://api.example.com")).toBe(
						selfhost === "true"
					);
					expect(connect?.includes("https://events.example.com:8443")).toBe(
						selfhost === "true"
					);
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

	it("allows the Dub conversion tracking script on app routes", async () => {
		await withEnv({ NODE_ENV: "production" }, async () => {
			const csp = await getCspHeader("/((?!demo|public).*)");

			expect(csp).toContain("https://www.dubcdn.com");
			expect(csp).toContain("https://api.dub.co");
		});
	});
});
