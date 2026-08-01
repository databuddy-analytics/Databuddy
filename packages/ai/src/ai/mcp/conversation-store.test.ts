import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInertRedisModule } from "../../test-utils/redis-mock";

const redisStore = new Map<string, string>();
let failGet = false;
let failSet = false;
let redisUnavailable = false;

const mockRedisClient = {
	get: vi.fn(async (key: string) => {
		if (failGet) {
			throw new Error("redis get failed");
		}
		return redisStore.get(key) ?? null;
	}),
	setex: vi.fn(async (key: string, _ttl: number, value: string) => {
		if (failSet) {
			throw new Error("redis set failed");
		}
		redisStore.set(key, value);
		return "OK";
	}),
};

const bunRedisModule =
	typeof Bun === "undefined" ? undefined : await import("@databuddy/redis");

vi.mock("@databuddy/redis", async (importOriginal) => {
	const actualRedis = importOriginal
		? await importOriginal<typeof import("@databuddy/redis")>()
		: bunRedisModule;
	if (!actualRedis) {
		throw new Error("Unable to load the Redis test module");
	}
	return createInertRedisModule(actualRedis, {
		getRedisCache: () => {
			if (redisUnavailable) {
				throw new Error("redis unavailable");
			}
			return mockRedisClient;
		},
		redis: mockRedisClient,
	});
});

const { appendToConversation, getConversationHistory } = await import(
	"./conversation-store"
);

beforeEach(() => {
	redisStore.clear();
	failGet = false;
	failSet = false;
	redisUnavailable = false;
	mockRedisClient.get.mockClear();
	mockRedisClient.setex.mockClear();
});

afterEach(() => {
	failGet = false;
	failSet = false;
	redisUnavailable = false;
});

describe("conversation store", () => {
	it("returns no history when Redis is unavailable", async () => {
		redisUnavailable = true;

		await expect(
			getConversationHistory("conv-1", "user-1", null)
		).resolves.toEqual([]);
	});

	it("returns no history when Redis reads time out", async () => {
		failGet = true;

		await expect(
			getConversationHistory("conv-1", "user-1", null)
		).resolves.toEqual([]);
	});

	it("does not fail the caller when Redis writes time out", async () => {
		failSet = true;

		await expect(
			appendToConversation("conv-1", "user-1", null, "hello", "hi")
		).resolves.toBeUndefined();
	});

	it("persists the most recent turns", async () => {
		await appendToConversation("conv-1", "user-1", null, "hello", "hi");

		await expect(
			getConversationHistory("conv-1", "user-1", null)
		).resolves.toEqual([
			{ content: "hello", role: "user" },
			{ content: "hi", role: "assistant" },
		]);
	});
});
