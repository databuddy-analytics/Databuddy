import { describe, expect, it } from "bun:test";
import { generateNpmCode, generateScriptTag } from "./code-generators";
import { RECOMMENDED_DEFAULTS } from "./tracking-defaults";

describe("recommended tracking snippets", () => {
	it.each([
		undefined,
		"false",
		"true",
	])("overrides ingestion endpoints only for SELFHOST=%s", async (selfhost) => {
		const child = Bun.spawn(
			[
				process.execPath,
				"--no-env-file",
				"-e",
				`
import assert from "node:assert/strict";
import { generateAgentPrompt, generateNodeCode, generateNpmCode, generateScriptTag, generateVueCode } from "./code-generators";
import { RECOMMENDED_DEFAULTS } from "./tracking-defaults";
const snippets = [
  generateScriptTag("example-client-id", RECOMMENDED_DEFAULTS),
  generateNpmCode("example-client-id", RECOMMENDED_DEFAULTS),
  generateNodeCode("example-client-id"),
  generateVueCode("example-client-id", RECOMMENDED_DEFAULTS),
];
for (const snippet of snippets) {
  assert.equal(snippet.includes("https://events.example.com"), ${selfhost === "true"});
  assert.equal(/apiUrl|api-url/.test(snippet), ${selfhost === "true"});
}
const prompt = generateAgentPrompt("example-client-id");
assert.equal(prompt.includes("https://events.example.com"), ${selfhost === "true"});
assert.equal(prompt.includes("Store the Client ID in an env var"), ${selfhost !== "true"});
assert.equal(prompt.includes("basket.databuddy.cc"), ${selfhost !== "true"});
`,
			],
			{
				cwd: import.meta.dir,
				env: {
					NODE_ENV: "production",
					NEXT_PUBLIC_SELFHOST: selfhost,
					NEXT_PUBLIC_BASKET_URL: "https://events.example.com",
				},
				stdout: "ignore",
				stderr: "pipe",
			}
		);
		const [exitCode, stderr] = await Promise.all([
			child.exited,
			new Response(child.stderr).text(),
		]);
		expect(exitCode, stderr).toBe(0);
	});

	it("keeps zero-config page views and performance tracking enabled", () => {
		const script = generateScriptTag("example-client-id", RECOMMENDED_DEFAULTS);
		const npm = generateNpmCode("example-client-id", RECOMMENDED_DEFAULTS);

		expect(script).toContain('data-track-web-vitals="true"');
		expect(script).not.toContain("track-performance");
		expect(npm).toContain("trackWebVitals={true}");
		expect(npm).not.toContain("trackPerformance");
		expect(npm).not.toContain("trackScreenViews");
		expect(npm).not.toContain("trackSessions");
	});
});
