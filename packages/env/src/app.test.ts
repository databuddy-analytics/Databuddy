import { describe, expect, it } from "bun:test";
import { createConfig } from "./app";

describe("createConfig", () => {
	it("uses local defaults outside production", () => {
		expect(createConfig({ NODE_ENV: "development" })).toMatchObject({
			urls: {
				api: "http://localhost:3001",
				basket: "http://localhost:4000",
				dashboard: "http://localhost:3000",
				status: "http://localhost:3002",
			},
		});
	});

	it("uses cloud defaults in production", () => {
		expect(createConfig({ NODE_ENV: "production" })).toMatchObject({
			urls: {
				api: "https://api.databuddy.cc",
				basket: "https://basket.databuddy.cc",
				dashboard: "https://app.databuddy.cc",
				status: "https://status.databuddy.cc",
			},
		});
	});

	it("prefers self-hosting urls and strips trailing slashes", () => {
		expect(
			createConfig({
				API_URL: "https://api.example.com/",
				DASHBOARD_URL: "https://app.example.com/",
				NODE_ENV: "production",
			})
		).toMatchObject({
			urls: {
				api: "https://api.example.com",
				dashboard: "https://app.example.com",
			},
		});
	});

	it("does not let localhost leak into production redirects", () => {
		expect(
			createConfig({
				BETTER_AUTH_URL: "http://localhost:3000",
				NODE_ENV: "production",
			})
		).toMatchObject({ urls: { dashboard: "https://app.databuddy.cc" } });
	});

	it("uses the documented env fallback order", () => {
		expect(
			createConfig({
				APP_URL: "https://legacy.example.com",
				DASHBOARD_URL: "https://dashboard.example.com",
				NEXT_PUBLIC_APP_URL: "https://public.example.com",
				NODE_ENV: "production",
			})
		).toMatchObject({
			urls: { dashboard: "https://dashboard.example.com" },
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
		expect(
			createConfig({ EMAIL_FROM: "App <app@example.com>" })
		).toMatchObject({
			email: {
				alertsFrom: "App <app@example.com>",
				from: "App <app@example.com>",
			},
		});
	});
});
