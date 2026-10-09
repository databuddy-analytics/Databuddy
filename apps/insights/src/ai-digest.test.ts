import { expect, test } from "bun:test";

test("skips digest dispatch before accessing unavailable services when email is disabled", async () => {
	const child = Bun.spawn([process.execPath, "--no-env-file", "-"], {
		cwd: import.meta.dir,
		env: {
			NODE_ENV: "test",
			DATABASE_URL: "postgres://test:test@127.0.0.1:1/test",
			REDIS_URL: "redis://127.0.0.1:1",
			BULLMQ_REDIS_URL: "redis://127.0.0.1:1",
			CLICKHOUSE_URL: "http://default:@127.0.0.1:1/test",
			BETTER_AUTH_SECRET: "example-test-secret-longer-than-32-chars",
			RESEND_API_KEY: "",
		},
		stdin: new Blob([
			`
import assert from "node:assert/strict";
import { dispatchAiDigests } from "./ai-digest.ts";
assert.deepEqual(await dispatchAiDigests(), { reason: "email_not_configured", status: "skipped" });
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
}, 10_000);
