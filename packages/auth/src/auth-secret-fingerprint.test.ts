import { describe, expect, it } from "bun:test";

describe("dashboard auth secret check", () => {
	it.each([
		{
			name: "malformed JSON warns",
			body: "<html>Unavailable</html>",
			warns: true,
		},
		{ name: "missing fingerprint warns", body: "{}", warns: true },
		{
			name: "non-string fingerprint warns",
			body: '{"fingerprint":42}',
			warns: true,
		},
		{ name: "null body warns", body: "null", warns: true },
		{ name: "primitive body warns", body: '"unavailable"', warns: true },
		{ name: "failed fetch warns", fails: true, warns: true },
		{
			name: "non-OK response warns",
			status: 503,
			body: "unavailable",
			warns: true,
		},
		{ name: "matching secrets pass", fingerprint: "match" },
		{
			name: "mismatched secrets reject",
			fingerprint: "mismatch",
			rejects: true,
		},
		{ name: "self-hosted skips the request", selfhost: "true", skips: true },
		{ name: "development skips the request", mode: "development", skips: true },
	])("$name", async (scenario) => {
		// Import real auth in a fresh process; service URLs are inert and fetch is mocked.
		const child = Bun.spawn([process.execPath, "--no-env-file", "-"], {
			cwd: import.meta.dir,
			env: {
				NODE_ENV: scenario.mode ?? "production",
				SELFHOST: scenario.selfhost ?? "false",
				DATABASE_URL: "postgres://test:test@127.0.0.1:1/test",
				REDIS_URL: "redis://127.0.0.1:1",
				BULLMQ_REDIS_URL: "redis://127.0.0.1:1",
				CLICKHOUSE_URL: "http://default:@127.0.0.1:1/test",
				DASHBOARD_URL: "http://127.0.0.1:1",
				BETTER_AUTH_URL: "http://127.0.0.1:1",
				BETTER_AUTH_SECRET: "synthetic-auth-secret-longer-than-32-chars",
			},
			stdin: new Blob([
				`
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { log } from "evlog";
const require = createRequire(import.meta.resolve("@databuddy/redis"));
const { default: Redis } = await import(require.resolve("ioredis"));
Redis.prototype.connect = async () => undefined;
Redis.prototype.sendCommand = () => { throw new Error("Unexpected Redis command"); };
const scenario = ${JSON.stringify(scenario)};
const url = "http://127.0.0.1:1/api/auth/secret-fingerprint";
const warnings = [];
const requests = [];
let fingerprint;
log.warn = event => warnings.push(event);
globalThis.fetch = async input => {
  assert.equal(String(input), url, "only the fingerprint endpoint is requested");
  requests.push(String(input));
  if (scenario.fails) throw new Error("synthetic fetch failure");
  const body = scenario.fingerprint
    ? JSON.stringify({ fingerprint: scenario.fingerprint === "match" ? fingerprint : "different-secret" })
    : scenario.body;
  return new Response(body, { status: scenario.status ?? 200 });
};
const { auth, assertAuthSecretMatchesDashboard } = await import("./auth.ts");
({ fingerprint } = await auth.api.getSecretFingerprint());
assert.equal(typeof fingerprint, "string");
if (scenario.rejects) {
  await assert.rejects(assertAuthSecretMatchesDashboard(), /BETTER_AUTH_SECRET does not match/);
} else {
  await assertAuthSecretMatchesDashboard();
}
assert.deepEqual(requests, scenario.skips ? [] : [url]);
assert.deepEqual(warnings, scenario.warns ? [{
  auth: { secretCheck: "skipped", url, status: scenario.fails ? null : scenario.status ?? 200 },
}] : []);
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
	}, 30_000);
});
