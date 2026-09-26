import { afterEach, describe, expect, it, mock } from "bun:test";
import { AI_AGENTS } from "@databuddy/shared/bot-detection/ai-agents";
import { AI_AGENT_USER_AGENT, trackAgentTraffic } from "../src/agents/index";

const GPTBOT =
	"Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)";
const CHROME =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const originalFetch = globalThis.fetch;

function agentRequest(
	path: string,
	init: { method?: string; userAgent?: string; headers?: HeadersInit } = {}
): Request {
	const headers = new Headers(init.headers);
	headers.set("user-agent", init.userAgent ?? GPTBOT);
	return new Request(`https://example.com${path}`, {
		method: init.method ?? "GET",
		headers,
	});
}

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("AI_AGENT_USER_AGENT", () => {
	it("matches the shared AI agent registry", () => {
		const registry = AI_AGENTS.flatMap((agent) =>
			agent.patterns.map((pattern) => pattern.source)
		).join("|");
		expect(AI_AGENT_USER_AGENT.source).toBe(registry);
	});
});

describe("trackAgentTraffic", () => {
	it("sends the path without the query and the proxy-appended IP", async () => {
		const bodies: unknown[] = [];
		globalThis.fetch = mock((_url: string, init?: RequestInit) => {
			bodies.push(JSON.parse(String(init?.body)));
			return Promise.resolve(new Response(null, { status: 200 }));
		}) as typeof fetch;
		await trackAgentTraffic(
			agentRequest("/pricing?token=secret", {
				headers: { "x-forwarded-for": "132.196.86.1, 20.171.206.7" },
			}),
			{ apiKey: "dbdy_test", websiteId: "site_1" }
		);
		expect(bodies).toEqual([
			expect.objectContaining({
				websiteId: "site_1",
				path: "/pricing",
				ip: "20.171.206.7",
				userAgent: GPTBOT,
			}),
		]);
	});

	it.each([
		[
			"ignores a client-sent cf-connecting-ip outside Workers",
			{ "cf-connecting-ip": "132.196.86.1", "x-real-ip": "203.0.113.9" },
			false,
			undefined,
			"203.0.113.9",
		],
		[
			"trusts cf-connecting-ip on Workers",
			{ "cf-connecting-ip": "132.196.86.1", "x-real-ip": "203.0.113.9" },
			true,
			undefined,
			"132.196.86.1",
		],
		[
			"prefers an explicit ip option",
			{ "x-real-ip": "203.0.113.9" },
			false,
			"198.51.100.4",
			"198.51.100.4",
		],
	])("%s", async (_label, headers, onWorkers, ip, expected) => {
		const bodies: { ip: string }[] = [];
		globalThis.fetch = mock((_url: string, init?: RequestInit) => {
			bodies.push(JSON.parse(String(init?.body)));
			return Promise.resolve(new Response(null, { status: 202 }));
		}) as typeof fetch;
		const request = agentRequest("/pricing", { headers });
		if (onWorkers) {
			Object.defineProperty(request, "cf", { value: {} });
		}
		await trackAgentTraffic(request, {
			apiKey: "dbdy_test",
			websiteId: "site_1",
			ip,
		});
		expect(bodies[0]?.ip).toBe(expected);
	});

	it.each([
		["/docs/intro.md", {}, "markdown"],
		["/docs/intro", { accept: "text/markdown, text/html, */*" }, "markdown"],
		["/llms-full.txt", {}, "llms"],
		["/docs/intro", { accept: "text/html" }, "html"],
	])("reports %s %o as %s", async (path, headers, expected) => {
		const bodies: { format: string }[] = [];
		globalThis.fetch = mock((_url: string, init?: RequestInit) => {
			bodies.push(JSON.parse(String(init?.body)));
			return Promise.resolve(new Response(null, { status: 202 }));
		}) as typeof fetch;
		await trackAgentTraffic(agentRequest(path, { headers }), {
			apiKey: "dbdy_test",
			websiteId: "site_1",
		});
		expect(bodies[0]?.format).toBe(expected);
	});

	it("never rejects when basket is unreachable", async () => {
		globalThis.fetch = mock(() =>
			Promise.reject(new Error("network down"))
		) as typeof fetch;
		await expect(
			trackAgentTraffic(agentRequest("/pricing"), {
				apiKey: "dbdy_test",
				websiteId: "site_1",
			})
		).resolves.toBeUndefined();
	});

	it.each([
		["/pricing", {}, 1],
		["/llms.txt", {}, 1],
		["/docs/intro.md", {}, 1],
		["/pricing", { method: "HEAD" }, 1],
		["/pricing", { method: "POST" }, 0],
		["/pricing", { userAgent: CHROME }, 0],
		["/_next/static/chunks/app.js", {}, 0],
		["/logo.PNG", {}, 0],
		["/fonts/inter.woff2", {}, 0],
	])("%s %o sends %i hits", async (path, init, expected) => {
		const fetchMock = mock(() =>
			Promise.resolve(new Response(null, { status: 202 }))
		);
		globalThis.fetch = fetchMock as typeof fetch;
		await trackAgentTraffic(agentRequest(path, init), {
			apiKey: "dbdy_test",
			websiteId: "site_1",
		});
		expect(fetchMock).toHaveBeenCalledTimes(expected);
	});
});
