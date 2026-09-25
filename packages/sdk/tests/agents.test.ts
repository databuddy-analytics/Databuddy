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
	it("sends the path without the query and the first forwarded IP", async () => {
		const bodies: unknown[] = [];
		globalThis.fetch = mock((_url: string, init?: RequestInit) => {
			bodies.push(JSON.parse(String(init?.body)));
			return Promise.resolve(new Response(null, { status: 200 }));
		}) as typeof fetch;
		await trackAgentTraffic(
			agentRequest("/pricing?token=secret", {
				headers: { "x-forwarded-for": "20.171.206.7, 10.0.0.1" },
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
