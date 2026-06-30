import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const store = new Map<string, string>();

const mockRedisClient = {
	del: mock(async (key: string) => (store.delete(key) ? 1 : 0)),
	eval: mock(
		async (_script: string, _numKeys: number, key: string, streamId: string) => {
			if (store.get(key) !== streamId) {
				return 0;
			}
			store.delete(key);
			return 1;
		}
	),
	get: mock(async (key: string) => store.get(key) ?? null),
	setex: mock(async (key: string, _ttl: number, value: string) => {
		store.set(key, value);
		return "OK" as const;
	}),
};

mock.module("./redis", () => ({
	getRedisCache: () => mockRedisClient,
}));

const { activeStreamKey, clearActiveStream, getActiveStream, setActiveStream } =
	await import("./stream-buffer");

afterAll(() => {
	mock.restore();
});

beforeEach(() => {
	store.clear();
	mockRedisClient.del.mockClear();
	mockRedisClient.eval.mockClear();
	mockRedisClient.get.mockClear();
	mockRedisClient.setex.mockClear();
});

describe("active stream markers", () => {
	it("only clears the marker for the stream that owns it", async () => {
		await setActiveStream("site-1", "chat-1", "stream-new");

		await clearActiveStream("site-1", "chat-1", "stream-old");

		expect(await getActiveStream("site-1", "chat-1")).toBe("stream-new");
		expect(store.get(activeStreamKey("site-1", "chat-1"))).toBe("stream-new");

		await clearActiveStream("site-1", "chat-1", "stream-new");

		expect(await getActiveStream("site-1", "chat-1")).toBeNull();
	});
});
