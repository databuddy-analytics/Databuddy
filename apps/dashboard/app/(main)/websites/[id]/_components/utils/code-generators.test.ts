import { describe, expect, it } from "bun:test";
import {
	generateAgentPrompt,
	generateNextJsCode,
	generateNpmCode,
	generateScriptTag,
	generateTanStackCode,
} from "./code-generators";
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
assert.equal(prompt.includes("self-hosted Databuddy instance"), ${selfhost === "true"});
assert.equal(prompt.includes("basket.databuddy.cc"), ${selfhost !== "true"});
assert.ok(prompt.includes("Store the Client ID in an env var"));
assert.ok(prompt.includes("## Common issues"));
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

	it("leaves interaction tracking to the default and writes it out only when turned off", () => {
		const off = { ...RECOMMENDED_DEFAULTS, trackInteractions: false };

		expect(
			generateScriptTag("example-client-id", RECOMMENDED_DEFAULTS)
		).not.toContain("track-interactions");
		expect(generateScriptTag("example-client-id", off)).toContain(
			'data-track-interactions="false"'
		);
		expect(generateNpmCode("example-client-id", off)).toContain(
			"trackInteractions={false}"
		);
	});

	it("generates valid Next.js root layout snippet with options", () => {
		const nextJs = generateNextJsCode(
			"example-client-id",
			RECOMMENDED_DEFAULTS
		);
		expect(nextJs).toContain("RootLayout");
		expect(nextJs).toContain('clientId="example-client-id"');
		expect(nextJs).toContain("trackWebVitals={true}");
		expect(nextJs).toContain("@databuddy/sdk/react");
	});

	it("generates valid TanStack Router root route snippet with options", () => {
		const tanStack = generateTanStackCode(
			"example-client-id",
			RECOMMENDED_DEFAULTS
		);
		expect(tanStack).toContain("createRootRoute");
		expect(tanStack).toContain("@tanstack/react-router");
		expect(tanStack).toContain('clientId="example-client-id"');
		expect(tanStack).toContain("trackWebVitals={true}");
	});

	it("asks for optional install feedback without code or secrets, and only names real options", () => {
		const prompt = generateAgentPrompt("example-client-id");

		expect(prompt).toContain("/public/v1/agent-telemetry");
		expect(prompt).toContain("(optional)");
		expect(prompt).toContain("never include source code, environment values");
		expect(prompt).not.toContain("Required");
		expect(prompt).not.toContain("Always send this report");
		expect(prompt).toContain("@databuddy/sdk/agents");
		expect(prompt).toContain("identify(");
		expect(prompt).not.toContain("trackPerformance");
		expect(prompt).not.toContain("trackScreenViews");
		expect(prompt).not.toContain("trackSessions");
	});

	it("lists the site's suggested events and funnels when a brief is available", () => {
		const prompt = generateAgentPrompt("example-client-id", undefined, {
			brief: "# Acme\n\nAcme sells project management for agencies.",
			goals: [
				{
					name: "Trial started",
					type: "EVENT",
					target: "trial_started",
					reason: "The trial is the decision point.",
				},
				{
					name: "Pricing viewed",
					type: "PAGE_VIEW",
					target: "/pricing",
					reason: "Intent signal.",
				},
			],
			funnels: [
				{
					name: "Homepage to trial",
					reason: "Drop-off before the trial.",
					steps: [
						{ name: "Homepage", type: "PAGE_VIEW", target: "/" },
						{ name: "Trial started", type: "EVENT", target: "trial_started" },
					],
				},
			],
		});

		expect(prompt).toContain("## About this site");
		expect(prompt).toContain("Acme sells project management for agencies.");
		expect(prompt).toContain(
			'`track("trial_started")`: Trial started. The trial is the decision point.'
		);
		expect(prompt).toContain("Page-view goals need no code: /pricing");
		expect(prompt).toContain("Homepage to trial: / → trial_started");
		expect(generateAgentPrompt("example-client-id")).not.toContain(
			"## About this site"
		);
	});

	it("asks for live progress only when a setup session token is given", () => {
		expect(generateAgentPrompt("example-client-id")).not.toContain(
			"setupSession"
		);
		const prompt = generateAgentPrompt("example-client-id", "abc123def456");
		expect(prompt).toContain('"setupSession": "abc123def456"');
		expect(prompt).toContain('"status": "partial"');
	});
});
