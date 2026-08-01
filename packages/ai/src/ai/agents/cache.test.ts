import * as actualRedis from "@databuddy/redis";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface RedisEntry {
	ttl: number;
	value: string;
}

const redisStore = new Map<string, RedisEntry>();
let failGet = false;
let failSet = false;
let memoryEnabled = true;

const getSnapshotKey = (
	userId: string,
	websiteId: string,
	organizationId?: string | null
) => `agent:context-snapshot:${organizationId ?? userId}:${websiteId}`;

const mockRedisClient = {
	get: vi.fn(async (key: string) => {
		if (failGet) {
			throw new Error("redis get failed");
		}
		return redisStore.get(key)?.value ?? null;
	}),
	setex: vi.fn(async (key: string, ttl: number, value: string) => {
		if (failSet) {
			throw new Error("redis set failed");
		}
		redisStore.set(key, { ttl, value });
		return "OK";
	}),
};

const mockCaptureError = vi.fn(
	(_error: unknown, _fields?: Record<string, string | number | boolean>) => {}
);

const mockEnrichAgentContext = vi.fn(
	async (opts: {
		organizationId: string | null;
		userId: string;
		websiteId: string;
	}) => `fresh:${opts.organizationId ?? opts.userId}:${opts.websiteId}`
);

vi.mock("@databuddy/auth", () => ({
	auth: {},
	websitesApi: {
		hasPermission: vi.fn(async () => ({ success: true })),
	},
}));

const redisModule = { ...actualRedis };

vi.mock("@databuddy/redis", () => ({
	...redisModule,
	getRedisCache: () => mockRedisClient,
}));

vi.mock("../../lib/supermemory", () => ({
	formatMemoryForPrompt: vi.fn(() => ""),
	forgetMemory: vi.fn(async () => ({ success: true })),
	getMemoryContext: vi.fn(async () => null),
	isMemoryEnabled: () => memoryEnabled,
	sanitizeMemoryContent: vi.fn((content: string) => content),
	saveCuratedMemory: vi.fn(async () => ({ id: "memory-1" })),
	searchMemories: vi.fn(async () => []),
	storeAnalyticsSummary: vi.fn(async () => undefined),
	storeConversation: vi.fn(async () => undefined),
}));

vi.mock("../../lib/tracing", () => ({
	captureError: mockCaptureError,
	captureWarning: vi.fn(() => {}),
	mergeWideEvent: vi.fn(() => {}),
}));

vi.mock("../config/enrich-context", () => ({
	enrichAgentContext: mockEnrichAgentContext,
}));

const { getAgentContextSnapshot, shouldLoadMemoryContext } = await import(
	"./cache"
);

const snapshot = (context: string, refreshedAt = new Date().toISOString()) =>
	JSON.stringify({ context, refreshedAt });

async function flushBackgroundRefresh() {
	await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
	redisStore.clear();
	failGet = false;
	failSet = false;
	memoryEnabled = true;
	mockRedisClient.get.mockClear();
	mockRedisClient.setex.mockClear();
	mockEnrichAgentContext.mockClear();
	mockCaptureError.mockClear();
});

afterEach(() => {
	failGet = false;
	failSet = false;
	memoryEnabled = true;
});

describe("shouldLoadMemoryContext", () => {
	it("keeps ordinary analytics prompts off the inline memory path", () => {
		expect(shouldLoadMemoryContext("show me bounce rate for last week")).toBe(
			false
		);
	});

	it("loads memory inline when the user explicitly asks for remembered context", () => {
		expect(shouldLoadMemoryContext("remember my usual conversion goal?")).toBe(
			true
		);
	});

	it("stays disabled when memory is not configured", () => {
		memoryEnabled = false;

		expect(shouldLoadMemoryContext("what do you know about me?")).toBe(false);
	});
});

describe("getAgentContextSnapshot", () => {
	it("returns a fresh cache hit without rebuilding context", async () => {
		const key = getSnapshotKey("user-1", "site-1", "org-1");
		redisStore.set(key, { ttl: 86_400, value: snapshot("cached") });

		const result = await getAgentContextSnapshot("user-1", "site-1", "org-1");

		expect(result).toEqual({ context: "cached", source: "hit" });
		expect(mockEnrichAgentContext).not.toHaveBeenCalled();
	});

	it("serves stale context immediately and refreshes it in the background", async () => {
		const key = getSnapshotKey("user-1", "site-1", "org-1");
		redisStore.set(key, {
			ttl: 86_400,
			value: snapshot("old", "1970-01-01T00:00:00.000Z"),
		});

		const result = await getAgentContextSnapshot("user-1", "site-1", "org-1");
		await flushBackgroundRefresh();

		expect(result).toEqual({ context: "old", source: "stale" });
		expect(mockEnrichAgentContext).toHaveBeenCalledTimes(1);
		expect(JSON.parse(redisStore.get(key)?.value ?? "{}")).toMatchObject({
			context: "fresh:org-1:site-1",
		});
		expect(redisStore.get(key)?.ttl).toBe(86_400);
	});

	it("returns a miss fast and warms the snapshot for the next request", async () => {
		const key = getSnapshotKey("user-1", "site-1", "org-1");

		const result = await getAgentContextSnapshot("user-1", "site-1", "org-1");
		await flushBackgroundRefresh();

		expect(result).toEqual({ context: "", source: "miss" });
		expect(mockEnrichAgentContext).toHaveBeenCalledTimes(1);
		expect(JSON.parse(redisStore.get(key)?.value ?? "{}")).toMatchObject({
			context: "fresh:org-1:site-1",
		});
	});

	it("treats invalid snapshot payloads as misses and replaces them", async () => {
		const key = getSnapshotKey("user-1", "site-1", "org-1");
		redisStore.set(key, { ttl: 86_400, value: JSON.stringify({}) });

		const result = await getAgentContextSnapshot("user-1", "site-1", "org-1");
		await flushBackgroundRefresh();

		expect(result).toEqual({ context: "", source: "miss" });
		expect(JSON.parse(redisStore.get(key)?.value ?? "{}")).toMatchObject({
			context: "fresh:org-1:site-1",
		});
	});

	it("does not block the request when Redis get fails", async () => {
		const key = getSnapshotKey("user-1", "site-1", null);
		failGet = true;

		const result = await getAgentContextSnapshot("user-1", "site-1", null);
		await flushBackgroundRefresh();

		expect(result).toEqual({ context: "", source: "error" });
		expect(JSON.parse(redisStore.get(key)?.value ?? "{}")).toMatchObject({
			context: "fresh:user-1:site-1",
		});
	});

	it("captures background refresh failures", async () => {
		failSet = true;

		const result = await getAgentContextSnapshot("user-1", "site-1", "org-1");
		await flushBackgroundRefresh();

		expect(result).toEqual({ context: "", source: "miss" });
		expect(mockCaptureError).toHaveBeenCalledTimes(1);
		expect(mockCaptureError.mock.calls[0]?.[1]).toMatchObject({
			agent_context_snapshot_refresh_error: true,
			agent_snapshot_key: getSnapshotKey("user-1", "site-1", "org-1"),
		});
	});
});
