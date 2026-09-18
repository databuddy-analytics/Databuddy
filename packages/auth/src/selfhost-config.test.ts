import { describe, expect, it } from "bun:test";

describe("auth deployment settings", () => {
	it.each([
		{
			name: "hosted production",
			env: {},
			domain: ".databuddy.cc",
			verify: true,
			sendVerification: true,
		},
		{
			name: "self-hosted single host",
			env: { SELFHOST: "true" },
			domain: undefined,
			verify: false,
			sendVerification: false,
		},
		{
			name: "self-hosted empty domain",
			env: { SELFHOST: "true", BETTER_AUTH_COOKIE_DOMAIN: "  " },
			domain: undefined,
			verify: false,
			sendVerification: false,
		},
		{
			name: "self-hosted subdomains",
			env: { SELFHOST: "true", BETTER_AUTH_COOKIE_DOMAIN: " .example.com " },
			domain: ".example.com",
			verify: false,
			sendVerification: false,
		},
		{
			name: "self-hosted verification opt-in",
			env: { SELFHOST: "true", REQUIRE_EMAIL_VERIFICATION: "true" },
			domain: undefined,
			verify: true,
			sendVerification: true,
		},
		{
			name: "hosted verification opt-out",
			env: { REQUIRE_EMAIL_VERIFICATION: "false" },
			domain: ".databuddy.cc",
			verify: false,
			sendVerification: true,
		},
		{
			name: "hosted explicit false with empty cookie domain",
			env: { SELFHOST: "false", BETTER_AUTH_COOKIE_DOMAIN: "" },
			domain: "app.example.com",
			verify: true,
			sendVerification: true,
		},
		{
			name: "hosted cookie domain retains configured whitespace",
			env: { BETTER_AUTH_COOKIE_DOMAIN: " .example.com " },
			domain: " .example.com ",
			verify: true,
			sendVerification: true,
		},
	])("$name", async ({ env, domain, verify, sendVerification }) => {
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
				DUB_API_KEY: "synthetic-dub-key",
				SLACK_WEBHOOK_URL: "https://hooks.slack.com/services/synthetic-test",
				...env,
			},
			stdin: new Blob([
				`
import assert from "node:assert/strict";
import { db } from "@databuddy/db";
import { SlackProvider } from "@databuddy/notifications";
import { getCookies } from "better-auth/cookies";
import { auth } from "./auth.ts";
import { runWithAuthAuditContext } from "./audit-context.ts";
const cookie = getCookies({ ...auth.options, baseURL: process.env.BETTER_AUTH_URL }).sessionToken;
assert.equal(cookie.name, "__Secure-databuddy.session_token");
assert.equal(cookie.attributes.domain, ${JSON.stringify(domain)});
assert.equal(cookie.attributes.secure, true);
assert.equal(cookie.attributes.httpOnly, true);
assert.equal(cookie.attributes.sameSite, "lax");
assert.equal(auth.options.emailAndPassword.requireEmailVerification, ${verify});
assert.equal(auth.options.emailVerification.sendOnSignUp, ${sendVerification});
assert.equal(auth.options.emailVerification.sendOnSignIn, ${sendVerification});
const requests = [];
let slackCalls = 0;
SlackProvider.prototype.send = async () => {
  slackCalls++;
  return { success: true };
};
globalThis.fetch = async url => {
  requests.push(String(url));
  return new Response("ok");
};
let inserts = 0;
db.transaction = async callback => callback({
  insert: () => ({ values: () => {
    inserts++;
    return { returning: async () => [{ id: "synthetic-audit" }] };
  } }),
});
await runWithAuthAuditContext({ dubClickId: "synthetic-click" }, () =>
  auth.options.databaseHooks.user.create.after({
    id: "synthetic-user", name: "Example", email: "user@example.com",
  })
);
assert.ok(inserts > 0, "signup still provisions the organization");
assert.deepEqual(requests, ${JSON.stringify(env.SELFHOST === "true" ? [] : ["https://api.dub.co/track/lead"])});
assert.equal(slackCalls, ${env.SELFHOST === "true" ? 0 : 1});
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
