import { afterEach, describe, expect, it, mock } from "bun:test";
import { AI_AGENTS } from "@databuddy/shared/bot-detection/ai-agents";
import { AI_AGENT_USER_AGENT, proxy, trackAgents } from "../src/agents/index";

const GPTBOT =
	"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)";
const CLAUDE_CODE =
	"Claude-User (claude-code/2.1.280; +https://support.anthropic.com/)";
const CHROME =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const OPTIONS = { apiKey: "dbdy_test", websiteId: "site_1" };
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

function request(
	path: string,
	init: { accept?: string; method?: string; userAgent?: string } = {}
): Request {
	const headers = new Headers({ "user-agent": init.userAgent ?? GPTBOT });
	if (init.accept) {
		headers.set("accept", init.accept);
	}
	return new Request(`https://example.com${path}`, {
		headers,
		method: init.method ?? "GET",
	});
}

function captureBodies() {
	const bodies: Record<string, unknown>[] = [];
	globalThis.fetch = mock((_url: string, init?: RequestInit) => {
		bodies.push(JSON.parse(String(init?.body)));
		return Promise.resolve(new Response(null, { status: 202 }));
	}) as typeof fetch;
	return bodies;
}

afterEach(() => {
	globalThis.fetch = originalFetch;
	process.env = { ...originalEnv };
});

describe("trackAgents", () => {
	it("recognizes exactly the shared registry's agents", () => {
		const registry = AI_AGENTS.flatMap((agent) =>
			agent.patterns.map((pattern) => pattern.source)
		).join("|");
		expect(AI_AGENT_USER_AGENT.source).toBe(registry);
	});

	it.each([
		["/pricing", {}, { format: "html", path: "/pricing" }],
		["/pricing?token=secret", {}, { format: "html", path: "/pricing" }],
		["/docs/intro.md", {}, { format: "markdown" }],
		[
			"/docs/intro",
			{ accept: "text/markdown, text/html, */*", userAgent: CLAUDE_CODE },
			{ format: "markdown" },
		],
		["/llms-full.txt", {}, { format: "llms" }],
		["/pricing", { method: "HEAD" }, { format: "html" }],
		["/pricing", { method: "POST" }, null],
		["/pricing", { userAgent: CHROME }, null],
		["/_next/static/chunks/app.js", {}, null],
		["/logo.PNG", {}, null],
	])("reports %s %o as %o", async (path, init, expected) => {
		const bodies = captureBodies();
		await trackAgents(request(path, init), OPTIONS);
		expect(bodies[0] ?? null).toEqual(
			expected ? expect.objectContaining(expected) : null
		);
	});

	it("accepts a Node or Express request", async () => {
		const bodies = captureBodies();
		await trackAgents(
			{
				headers: { "user-agent": CLAUDE_CODE, accept: "text/markdown" },
				method: "GET",
				url: "/docs/intro?ref=cli",
			},
			OPTIONS
		);
		expect(bodies).toEqual([
			expect.objectContaining({ format: "markdown", path: "/docs/intro" }),
		]);
	});

	it("hands the request to waitUntil when used as a drop-in proxy", async () => {
		process.env.DATABUDDY_API_KEY = "dbdy_env";
		process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID = "site_env";
		const bodies = captureBodies();
		const pending: Promise<unknown>[] = [];
		proxy(request("/llms.txt"), { waitUntil: (p) => pending.push(p) });
		await Promise.all(pending);
		expect(bodies).toEqual([expect.objectContaining({ format: "llms" })]);
	});

	it("reads the key and site id from the environment", async () => {
		process.env.DATABUDDY_API_KEY = "dbdy_env";
		process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID = "site_env";
		const bodies = captureBodies();
		await trackAgents(request("/pricing"));
		expect(bodies).toEqual([
			expect.objectContaining({ websiteId: "site_env" }),
		]);
	});

	it("sends nothing without a key", async () => {
		process.env.DATABUDDY_API_KEY = "";
		const bodies = captureBodies();
		await trackAgents(request("/pricing"), { websiteId: "site_1" });
		expect(bodies).toEqual([]);
	});

	it("never rejects when basket is unreachable", async () => {
		globalThis.fetch = mock(() =>
			Promise.reject(new Error("network down"))
		) as typeof fetch;
		await expect(
			trackAgents(request("/pricing"), OPTIONS)
		).resolves.toBeUndefined();
	});
});
