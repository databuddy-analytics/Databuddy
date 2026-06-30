import { readBooleanEnv } from "@databuddy/env/boolean";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.DATABUDDY_E2E_PORT ?? 3000);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
	testDir: "./test/e2e/specs",
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL,
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		video: "retain-on-failure",
	},
	webServer: {
		command: `bash -c 'bun --cwd ../api src/index.ts --port 3001 & api_pid=$!; trap "kill $api_pid 2>/dev/null || true" EXIT; until curl -sf http://localhost:3001/health >/dev/null; do sleep 0.2; done; bun next dev -p ${PORT}'`,
		env: {
			DATABUDDY_E2E_MODE: process.env.DATABUDDY_E2E_MODE ?? "true",
			NEXT_PUBLIC_DATABUDDY_E2E_MODE:
				process.env.NEXT_PUBLIC_DATABUDDY_E2E_MODE ?? "true",
			DATABUDDY_E2E_TEST_KEY: process.env.DATABUDDY_E2E_TEST_KEY ?? "",
			DATABASE_URL: process.env.DATABASE_URL ?? "",
			REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
			BULLMQ_REDIS_URL:
				process.env.BULLMQ_REDIS_URL ??
				process.env.REDIS_URL ??
				"redis://localhost:6379",
			CLICKHOUSE_URL:
				process.env.CLICKHOUSE_URL ??
				"http://default:@localhost:8123/databuddy_analytics",
			BETTER_AUTH_SECRET:
				process.env.BETTER_AUTH_SECRET ??
				"databuddy-e2e-secret-at-least-32-bytes",
			RESEND_API_KEY: process.env.RESEND_API_KEY ?? "re_e2e_dummy",
			AUTUMN_SECRET_KEY: process.env.AUTUMN_SECRET_KEY ?? "e2e-autumn-secret",
			GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID ?? "e2e-github-client-id",
			GITHUB_CLIENT_SECRET:
				process.env.GITHUB_CLIENT_SECRET ?? "e2e-github-client-secret",
			GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? "e2e-google-client-id",
			GOOGLE_CLIENT_SECRET:
				process.env.GOOGLE_CLIENT_SECRET ?? "e2e-google-client-secret",
			BETTER_AUTH_URL: baseURL,
			DASHBOARD_URL: baseURL,
			API_URL: process.env.API_URL ?? "http://localhost:3001",
			NEXT_PUBLIC_APP_URL: baseURL,
			NEXT_PUBLIC_API_URL:
				process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001",
		},
		reuseExistingServer: readBooleanEnv("DATABUDDY_E2E_REUSE_SERVER"),
		timeout: 120_000,
		url: baseURL,
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
});
