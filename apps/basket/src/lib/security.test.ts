import { vi, beforeEach, describe, expect, test } from "vitest";
import { checkDuplicate, saltAnonymousId } from "./security";

// ── saltAnonymousId (pure — no mocks needed) ──

describe("saltAnonymousId", () => {
	const salt = "test-salt-abc";

	test("returns 64-char hex (sha256)", () => {
		const result = saltAnonymousId("user_123", salt);
		expect(result).toMatch(/^[a-f0-9]{64}$/);
	});

	test("deterministic: same input → same output", () => {
		expect(saltAnonymousId("u1", salt)).toBe(saltAnonymousId("u1", salt));
	});

	test("different IDs → different hashes", () => {
		expect(saltAnonymousId("u1", salt)).not.toBe(saltAnonymousId("u2", salt));
	});

	test("different salts → different hashes", () => {
		expect(saltAnonymousId("u1", "salt-a")).not.toBe(
			saltAnonymousId("u1", "salt-b")
		);
	});

	test("empty ID → still returns hash (of '' + salt)", () => {
		const result = saltAnonymousId("", salt);
		expect(result).toMatch(/^[a-f0-9]{64}$/);
	});

	test("empty salt → still returns hash", () => {
		const result = saltAnonymousId("user_123", "");
		expect(result).toMatch(/^[a-f0-9]{64}$/);
	});

	test("1000 unique IDs → 1000 unique hashes", () => {
		const hashes = new Set<string>();
		for (let i = 0; i < 1000; i++) {
			hashes.add(saltAnonymousId(`user_${i}`, salt));
		}
		expect(hashes.size).toBe(1000);
	});

	test("long ID doesn't crash", () => {
		const longId = "a".repeat(10_000);
		const result = saltAnonymousId(longId, salt);
		expect(result).toMatch(/^[a-f0-9]{64}$/);
	});
});

// ── checkDuplicate (needs Redis mock) ──

const { mockRedisSet, mockLoggerSet } = vi.hoisted(() => ({
	mockRedisSet: vi.fn(() => Promise.resolve("OK")),
	mockLoggerSet: vi.fn(() => {}),
}));

vi.mock("@databuddy/redis/redis", () => ({
	redis: { set: mockRedisSet },
	getRedisCache: () => ({ set: mockRedisSet }),
}));
vi.mock("@databuddy/redis/cacheable", () => ({
	cacheable: (fn: () => Promise<any>) => fn,
}));

vi.mock("evlog/elysia", () => ({
	useLogger: () => ({ set: mockLoggerSet, warn: vi.fn(), error: vi.fn() }),
}));

vi.mock("@lib/tracing", () => ({
	record: (_name: string, fn: () => Promise<any>) =>
		Promise.resolve().then(() => fn()),
	captureError: vi.fn(),
}));

describe("checkDuplicate", () => {
	beforeEach(() => {
		mockRedisSet.mockReset();
		mockLoggerSet.mockReset();
	});

	test("first event (NX returns OK) → not duplicate", async () => {
		mockRedisSet.mockResolvedValue("OK");
		const result = await checkDuplicate("evt_1", "track");
		expect(result).toBe(false);
		expect(mockRedisSet).toHaveBeenCalledWith(
			"dedup:track:evt_1",
			"1",
			"EX",
			86_400,
			"NX"
		);
	});

	test("duplicate event (NX returns null) → is duplicate", async () => {
		mockRedisSet.mockResolvedValue(null);
		const result = await checkDuplicate("evt_1", "track");
		expect(result).toBe(true);
	});

	test("exit_ prefix → uses longer TTL (172800)", async () => {
		mockRedisSet.mockResolvedValue("OK");
		await checkDuplicate("exit_abc", "track");
		expect(mockRedisSet).toHaveBeenCalledWith(
			"dedup:track:exit_abc",
			"1",
			"EX",
			172_800,
			"NX"
		);
	});

	test("non-exit prefix → uses standard TTL (86400)", async () => {
		mockRedisSet.mockResolvedValue("OK");
		await checkDuplicate("normal_abc", "track");
		expect(mockRedisSet).toHaveBeenCalledWith(
			"dedup:track:normal_abc",
			"1",
			"EX",
			86_400,
			"NX"
		);
	});

	test("different event types → different keys", async () => {
		mockRedisSet.mockResolvedValue("OK");
		await checkDuplicate("evt_1", "outgoing_link");
		expect(mockRedisSet).toHaveBeenCalledWith(
			"dedup:outgoing_link:evt_1",
			"1",
			"EX",
			86_400,
			"NX"
		);
	});

	test("Redis error → returns false (fail-open)", async () => {
		mockRedisSet.mockRejectedValue(new Error("Redis down"));
		const result = await checkDuplicate("evt_1", "track");
		expect(result).toBe(false);
	});

	test("duplicate event logs dedup context", async () => {
		mockRedisSet.mockResolvedValue(null);
		await checkDuplicate("evt_dup", "track");
		expect(mockLoggerSet).toHaveBeenCalledWith({
			dedup: { duplicate: true, eventType: "track" },
		});
	});
});
