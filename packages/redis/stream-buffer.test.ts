import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";

const store = new Map<string, string>();

let xrangeEntries: [string, string[]][] = [];

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
	xrange: mock(
		async (
			_key: string,
			_start: string,
			_end: string,
			_countKeyword: "COUNT",
			_count: number
		) => xrangeEntries
	),
};

mock.module("./redis", () => ({
	getRedisCache: () => mockRedisClient,
}));

const {
	activeStreamKey,
	clearActiveStream,
	getActiveStream,
	readStreamHistory,
	setActiveStream,
} = await import("./stream-buffer");

afterAll(() => {
	mock.restore();
});

beforeEach(() => {
	store.clear();
	xrangeEntries = [];
	mockRedisClient.del.mockClear();
	mockRedisClient.eval.mockClear();
	mockRedisClient.get.mockClear();
	mockRedisClient.setex.mockClear();
	mockRedisClient.xrange.mockClear();
});

describe("readStreamHistory", () => {
	it("reads from the beginning when no since-id is given", async () => {
		await readStreamHistory("stream-key");

		expect(mockRedisClient.xrange).toHaveBeenCalledWith(
			"stream-key",
			"-",
			"+",
			"COUNT",
			2000
		);
	});

	it("resumes exclusively after the given entry id", async () => {
		await readStreamHistory("stream-key", "5-1", 100);

		expect(mockRedisClient.xrange).toHaveBeenCalledWith(
			"stream-key",
			"(5-1",
			"+",
			"COUNT",
			100
		);
	});

	it("decodes base64 chunks and flags the end marker as done", async () => {
		const payload = Buffer.from("hello").toString("base64");
		xrangeEntries = [
			["1-0", ["d", payload]],
			["2-0", ["end", "1"]],
		];

		const entries = await readStreamHistory("stream-key");

		expect(entries).toHaveLength(2);
		expect(entries[0]).toEqual({
			id: "1-0",
			data: new Uint8Array(Buffer.from("hello")),
			done: false,
		});
		expect(entries[1]).toEqual({
			id: "2-0",
			data: new Uint8Array(0),
			done: true,
		});
	});
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
