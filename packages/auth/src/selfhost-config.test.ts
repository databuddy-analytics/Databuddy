import { describe, expect, it } from "bun:test";

describe("auth deployment settings", () => {
	it.each([
		{
			name: "hosted production",
			env: {},
			domain: ".databuddy.cc",
			verify: true,
		},
		{
			name: "self-hosted single host",
			env: { SELFHOST: "true" },
			domain: undefined,
			verify: false,
		},
		{
			name: "self-hosted empty domain",
			env: { SELFHOST: "true", BETTER_AUTH_COOKIE_DOMAIN: "  " },
			domain: undefined,
			verify: false,
		},
		{
			name: "self-hosted subdomains",
			env: { SELFHOST: "true", BETTER_AUTH_COOKIE_DOMAIN: " .example.com " },
			domain: ".example.com",
			verify: false,
		},
		{
			name: "self-hosted verification opt-in",
			env: { SELFHOST: "true", REQUIRE_EMAIL_VERIFICATION: "true" },
			domain: undefined,
			verify: true,
		},
		{
			name: "hosted verification opt-out",
			env: { REQUIRE_EMAIL_VERIFICATION: "false" },
			domain: ".databuddy.cc",
			verify: false,
		},
	])("$name", async ({ env, domain, verify }) => {
		// Import the real auth options with only inert local service URLs.
		const child = Bun.spawn([process.execPath, "--no-env-file", "-"], {
			cwd: import.meta.dir,
			env: {
				NODE_ENV: "production",
				DATABASE_URL: "postgres://test:test@127.0.0.1:1/test",
				REDIS_URL: "redis://127.0.0.1:1",
				BULLMQ_REDIS_URL: "redis://127.0.0.1:1",
				CLICKHOUSE_URL: "http://default:@127.0.0.1:1/test",
				BETTER_AUTH_URL: "https://app.example.com",
				BETTER_AUTH_SECRET: "example-test-secret-longer-than-32-chars",
				...env,
			},
			stdin: new Blob([
				`
import assert from "node:assert/strict";
import { getCookies } from "better-auth/cookies";
import { auth } from "./auth.ts";
const cookie = getCookies(auth.options).sessionToken;
assert.equal(cookie.name, "__Secure-databuddy.session_token");
assert.equal(cookie.attributes.domain, ${JSON.stringify(domain)});
assert.equal(cookie.attributes.secure, true);
assert.equal(cookie.attributes.httpOnly, true);
assert.equal(cookie.attributes.sameSite, "lax");
assert.equal(auth.options.emailAndPassword.requireEmailVerification, ${verify});
assert.equal(auth.options.emailVerification.sendOnSignUp, ${verify});
assert.equal(auth.options.emailVerification.sendOnSignIn, ${verify});
process.exit(0);
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
});
