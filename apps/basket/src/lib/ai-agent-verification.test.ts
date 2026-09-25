import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const redisStore = new Map<string, string>();
const reverse = vi.fn<(ip: string) => Promise<string[]>>();
const resolve4 = vi.fn<(hostname: string) => Promise<string[]>>();

vi.mock("@databuddy/redis/redis", () => ({
	getRedisCache: () => ({
		get: (key: string) => Promise.resolve(redisStore.get(key) ?? null),
		set: (key: string, value: string) => {
			redisStore.set(key, value);
			return Promise.resolve("OK");
		},
	}),
}));
vi.mock("@lib/tracing", () => ({ captureError: vi.fn() }));
vi.mock("node:dns/promises", () => ({
	Resolver: class {
		reverse = reverse;
		resolve4 = resolve4;
		resolve6 = vi.fn(() => Promise.resolve([]));
	},
}));

const GPTBOT_RANGES = "https://openai.com/gptbot.json";
const originalFetch = globalThis.fetch;

function serveRanges(ranges: Record<string, string[]>) {
	globalThis.fetch = vi.fn((url: string | URL | Request) => {
		const prefixes = ranges[String(url)];
		return Promise.resolve(
			prefixes
				? Response.json({
						prefixes: prefixes.map((ipv4Prefix) => ({ ipv4Prefix })),
					})
				: new Response(null, { status: 503 })
		);
	}) as typeof fetch;
}

async function loadVerifier() {
	vi.resetModules();
	const { verifyAiAgent } = await import("./ai-agent-verification");
	return verifyAiAgent;
}

beforeEach(() => {
	redisStore.clear();
	reverse.mockReset();
	resolve4.mockReset();
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("verifyAiAgent", () => {
	test("verifies an IP inside the agent's official ranges", async () => {
		serveRanges({ [GPTBOT_RANGES]: ["132.196.86.0/24"] });
		const verifyAiAgent = await loadVerifier();
		expect(await verifyAiAgent("openai-crawler", "132.196.86.7")).toBe(
			"ip_verified"
		);
		expect(await verifyAiAgent("openai-crawler", "::ffff:132.196.86.7")).toBe(
			"ip_verified"
		);
	});

	test("marks an IP outside published ranges as spoofed", async () => {
		serveRanges({ [GPTBOT_RANGES]: ["132.196.86.0/24"] });
		const verifyAiAgent = await loadVerifier();
		expect(await verifyAiAgent("openai-crawler", "51.38.1.1")).toBe("spoofed");
	});

	test("falls back to last known good ranges when the source is down", async () => {
		redisStore.set(
			`bot-ranges:${GPTBOT_RANGES}`,
			JSON.stringify(["132.196.86.0/24"])
		);
		serveRanges({});
		const verifyAiAgent = await loadVerifier();
		expect(await verifyAiAgent("openai-crawler", "132.196.86.7")).toBe(
			"ip_verified"
		);
	});

	test("cannot verify without ranges or DNS masks", async () => {
		serveRanges({});
		const verifyAiAgent = await loadVerifier();
		expect(await verifyAiAgent("openai-crawler", "132.196.86.7")).toBe(
			"ua_only"
		);
		expect(await verifyAiAgent("tavily-bot", "132.196.86.7")).toBe("ua_only");
		expect(await verifyAiAgent("openai-crawler", "")).toBe("ua_only");
	});

	test("verifies by forward-confirmed reverse DNS", async () => {
		serveRanges({});
		reverse.mockResolvedValue(["petalbot-114-119-148-56.petalsearch.com"]);
		resolve4.mockResolvedValue(["114.119.148.56"]);
		const verifyAiAgent = await loadVerifier();
		expect(await verifyAiAgent("petalsearch-crawler", "114.119.148.56")).toBe(
			"rdns_verified"
		);
	});

	test("marks a hostname that resolves elsewhere as spoofed", async () => {
		serveRanges({});
		reverse.mockResolvedValue(["petalbot-114-119-148-56.petalsearch.com"]);
		resolve4.mockResolvedValue(["114.119.148.99"]);
		const verifyAiAgent = await loadVerifier();
		expect(await verifyAiAgent("petalsearch-crawler", "114.119.148.56")).toBe(
			"spoofed"
		);
	});

	test("treats DNS failures as unverified, not spoofed", async () => {
		serveRanges({});
		reverse.mockRejectedValue(
			Object.assign(new Error("timeout"), { code: "ENOTFOUND" })
		);
		const verifyAiAgent = await loadVerifier();
		expect(await verifyAiAgent("petalsearch-crawler", "114.119.148.56")).toBe(
			"ua_only"
		);
	});
});
