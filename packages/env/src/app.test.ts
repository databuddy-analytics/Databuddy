import { describe, expect, it } from "bun:test";
import { assertConfigured, createConfig, readBooleanEnv } from "./app";

const HOSTED = {
	AUTUMN_SECRET_KEY: "am_sk_test",
	BETTER_AUTH_SECRET: "a-secret-longer-than-32-characters-ok",
	NODE_ENV: "production",
};

describe("createConfig", () => {
	it("keeps production URL defaults local only when self-hosting", () => {
		expect(createConfig({ NODE_ENV: "production" }).urls).toEqual({
			api: "https://api.databuddy.cc",
			authorizationServer: "https://app.databuddy.cc/api/auth",
			basket: "https://basket.databuddy.cc",
			dashboard: "https://app.databuddy.cc",
			links: "https://dby.sh",
			mcp: "https://api.databuddy.cc/v1/mcp",
			status: "https://status.databuddy.cc",
		});
		expect(
			createConfig({ NODE_ENV: "production", SELFHOST: " TRUE " }).urls
		).toEqual({
			api: "http://localhost:3001",
			authorizationServer: "http://localhost:3000/api/auth",
			basket: "http://localhost:4000",
			dashboard: "http://localhost:3000",
			links: "http://localhost:2500",
			mcp: "http://localhost:3001/v1/mcp",
			status: "http://localhost:3002",
		});
	});

	it("prefers self-hosting urls and strips trailing slashes", () => {
		expect(
			createConfig({
				API_URL: "https://api.example.com/",
				DASHBOARD_URL: "https://app.example.com/",
				NODE_ENV: "production",
				SELFHOST: "true",
			})
		).toMatchObject({
			urls: {
				api: "https://api.example.com",
				dashboard: "https://app.example.com",
				mcp: "https://api.example.com/v1/mcp",
			},
		});
		expect(
			createConfig({
				API_URL: "https://api.example.com",
				MCP_URL: "https://app.example.com/",
				NODE_ENV: "production",
				SELFHOST: "true",
			}).urls
		).toMatchObject({
			api: "https://api.example.com",
			mcp: "https://app.example.com/v1/mcp",
		});
	});

	it("honors explicit loopback URLs in production", () => {
		expect(
			createConfig({
				API_URL: "http://127.0.0.1:3001/",
				BETTER_AUTH_URL: "http://localhost:3000",
				NODE_ENV: "production",
			})
		).toMatchObject({
			urls: {
				api: "http://127.0.0.1:3001",
				dashboard: "http://localhost:3000",
			},
		});
	});

	it("uses public URL fallbacks when server-only aliases are absent", () => {
		expect(
			createConfig({
				NEXT_PUBLIC_API_URL: "https://public-api.example.com",
				NEXT_PUBLIC_BASKET_URL: "https://public-basket.example.com",
				NEXT_PUBLIC_STATUS_URL: "https://public-status.example.com",
				NODE_ENV: "production",
			})
		).toMatchObject({
			urls: {
				api: "https://public-api.example.com",
				basket: "https://public-basket.example.com",
				status: "https://public-status.example.com",
			},
		});
	});

	it("uses configured public links URLs and removes trailing slashes", () => {
		expect(
			createConfig({
				LINKS_URL: "https://links.example.com/",
				NODE_ENV: "production",
			})
		).toMatchObject({
			urls: { links: "https://links.example.com" },
		});

		expect(
			createConfig({
				NEXT_PUBLIC_LINKS_URL: "https://public-links.example.com/",
				NODE_ENV: "production",
			})
		).toMatchObject({
			urls: { links: "https://public-links.example.com" },
		});
	});

	it("exposes the OpenAI Ads pixel ID through public config", () => {
		expect(
			createConfig({
				NEXT_PUBLIC_OPENAI_ADS_PIXEL_ID: "  px_123  ",
			})
		).toMatchObject({
			integrations: { openAiAdsPixelId: "px_123" },
		});
	});

	it("deduplicates API CORS origins from dashboard URLs", () => {
		expect(
			createConfig({
				API_CORS_ORIGINS: "https://extra.example.com/path, extra.example.com/",
				DASHBOARD_URL: "https://dashboard.example.com/",
				NODE_ENV: "production",
				RAILWAY_SERVICE_DASHBOARD_URL: "dashboard-production.up.railway.app",
			})
		).toMatchObject({
			cors: {
				apiOrigins: [
					"https://dashboard.example.com",
					"https://dashboard-production.up.railway.app",
					"https://extra.example.com",
				],
			},
		});
	});

	it("uses email sender overrides with alert-specific precedence", () => {
		expect(
			createConfig({
				ALERTS_EMAIL_FROM: "Alerts <alerts@example.com>",
				EMAIL_FROM: "App <app@example.com>",
			})
		).toMatchObject({
			email: {
				alertsFrom: "Alerts <alerts@example.com>",
				from: "App <app@example.com>",
			},
		});
	});

	it("falls alert email back to the normal sender before the default", () => {
		expect(createConfig({ EMAIL_FROM: "App <app@example.com>" })).toMatchObject(
			{
				email: {
					alertsFrom: "App <app@example.com>",
					from: "App <app@example.com>",
				},
			}
		);
	});
});

describe("assertConfigured", () => {
	it("accepts a complete hosted production environment", () => {
		expect(() => assertConfigured(HOSTED)).not.toThrow();
	});

	it("rejects an empty or missing secret instead of booting without it", () => {
		expect(() =>
			assertConfigured({ ...HOSTED, BETTER_AUTH_SECRET: "" })
		).toThrow("BETTER_AUTH_SECRET is unset or empty");
		expect(() =>
			assertConfigured({ ...HOSTED, AUTUMN_SECRET_KEY: undefined })
		).toThrow("AUTUMN_SECRET_KEY is unset or empty");
	});

	it("rejects a dashboard URL that falls back to loopback", () => {
		expect(() =>
			assertConfigured({ ...HOSTED, BETTER_AUTH_URL: "http://localhost:3000" })
		).toThrow("DASHBOARD_URL resolves to http://localhost:3000");
	});

	it("requires only the auth secret when self-hosting on loopback", () => {
		expect(() =>
			assertConfigured({
				BETTER_AUTH_SECRET: HOSTED.BETTER_AUTH_SECRET,
				NODE_ENV: "production",
				SELFHOST: "true",
			})
		).not.toThrow();
		expect(() =>
			assertConfigured({ NODE_ENV: "production", SELFHOST: "true" })
		).toThrow("BETTER_AUTH_SECRET is unset or empty");
	});

	it("still rejects half-configured object storage", () => {
		expect(() =>
			assertConfigured({ ...HOSTED, AWS_ACCESS_KEY_ID: "only-the-id" })
		).toThrow("Object storage is half-configured");
	});

	it("leaves development environments alone", () => {
		expect(() => assertConfigured({})).not.toThrow();
	});
});

describe("readBooleanEnv", () => {
	it("only enables an explicit true value", () => {
		for (const value of [undefined, "", "false", "0", "1", "yes"]) {
			expect(readBooleanEnv("FLAG", { FLAG: value })).toBe(false);
		}
	});

	it("accepts true without case or whitespace sensitivity", () => {
		expect(readBooleanEnv("FLAG", { FLAG: " TRUE " })).toBe(true);
	});
});
