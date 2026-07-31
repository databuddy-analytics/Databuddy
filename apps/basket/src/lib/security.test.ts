import { vi, beforeEach, describe, expect, test } from "vitest";
import {
	applyVisitorIdPrivacy,
	markDuplicateReservationDelivered,
	releaseDuplicateReservation,
	reserveDuplicate,
	saltAnonymousId,
	shouldAnonymizeVisitorIds,
} from "./security";

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

describe("visitor ID anonymization helpers", () => {
	test("anonymizes visitor IDs by default", () => {
		expect(shouldAnonymizeVisitorIds(undefined)).toBe(true);
		expect(shouldAnonymizeVisitorIds("anything-else")).toBe(true);
		expect(shouldAnonymizeVisitorIds(true)).toBe(true);
	});

	test("recognizes false as anonymization disabled", () => {
		expect(shouldAnonymizeVisitorIds(false)).toBe(false);
		expect(shouldAnonymizeVisitorIds("false")).toBe(true);
		expect(shouldAnonymizeVisitorIds("raw")).toBe(true);
	});

	test("auto mode stores raw visitor IDs only for allowlisted countries", () => {
		expect(shouldAnonymizeVisitorIds("auto", "US")).toBe(false);
		expect(shouldAnonymizeVisitorIds("auto", " usa ")).toBe(false);
		expect(shouldAnonymizeVisitorIds("auto", "United States")).toBe(false);
		expect(shouldAnonymizeVisitorIds("auto", "United States of America")).toBe(
			false
		);
		expect(shouldAnonymizeVisitorIds("auto", "Germany")).toBe(true);
		expect(shouldAnonymizeVisitorIds("auto", "DE")).toBe(true);
		expect(shouldAnonymizeVisitorIds("auto")).toBe(true);
	});

	test("keeps raw visitor ID when requested", () => {
		expect(applyVisitorIdPrivacy("anon_123", false, "salt")).toBe("anon_123");
	});

	test("keeps raw visitor ID for auto mode in allowlisted countries", () => {
		expect(
			applyVisitorIdPrivacy(
				"anon_123",
				shouldAnonymizeVisitorIds("auto", "US"),
				"salt"
			)
		).toBe("anon_123");
		expect(
			applyVisitorIdPrivacy(
				"anon_123",
				shouldAnonymizeVisitorIds("auto", "Germany"),
				"salt"
			)
		).toBe(saltAnonymousId("anon_123", "salt"));
	});

	test("salts visitor ID by default", () => {
		expect(applyVisitorIdPrivacy("anon_123", true, "salt")).toBe(
			saltAnonymousId("anon_123", "salt")
		);
	});

	test("keeps missing visitor IDs empty instead of salting them", () => {
		expect(applyVisitorIdPrivacy(undefined, true, "salt")).toBe("");
		expect(applyVisitorIdPrivacy(null, true, "salt")).toBe("");
		expect(applyVisitorIdPrivacy("", true, "salt")).toBe("");
	});
});

// ── duplicate reservations (needs Redis mock) ──

const { mockRedisSet, mockRedisGet, mockRedisEval, mockLoggerSet, mockCaptureError } =
	vi.hoisted(() => ({
		mockRedisSet: vi.fn(() => Promise.resolve("OK")),
		mockRedisGet: vi.fn(() => Promise.resolve(null)),
		mockRedisEval: vi.fn(() => Promise.resolve(1)),
		mockLoggerSet: vi.fn(() => {}),
		mockCaptureError: vi.fn(),
	}));

vi.mock("@databuddy/redis/redis", () => ({
	redis: { set: mockRedisSet, get: mockRedisGet, eval: mockRedisEval },
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
	captureError: mockCaptureError,
}));

describe("duplicate reservations", () => {
	beforeEach(() => {
		mockRedisSet.mockReset();
		mockRedisGet.mockReset();
		mockRedisEval.mockReset();
		mockLoggerSet.mockReset();
		mockCaptureError.mockReset();
	});

	test("writes a pending reservation for a new event", async () => {
		mockRedisSet.mockResolvedValue("OK");

		const reservation = await reserveDuplicate("evt_1", "track");

		expect(reservation).toMatchObject({
			duplicate: false,
			key: "dedup:track:evt_1",
			token: expect.stringMatching(/^pending:/),
			ttl: 86_400,
		});
		expect(mockRedisSet).toHaveBeenCalledWith(
			"dedup:track:evt_1",
			expect.stringMatching(/^pending:/),
			"EX",
			86_400,
			"NX"
		);
	});

	test("suppresses only a confirmed delivered reservation", async () => {
		mockRedisSet.mockResolvedValue(null);
		mockRedisGet.mockResolvedValue("delivered");

		const reservation = await reserveDuplicate("evt_1", "track");

		expect(reservation).toEqual({ duplicate: true });
		expect(mockLoggerSet).toHaveBeenCalledWith({
			dedup: { duplicate: true, eventType: "track" },
		});
	});

	test("retries a stale pending reservation instead of falsely suppressing it", async () => {
		mockRedisSet.mockResolvedValue(null);
		mockRedisGet.mockResolvedValue("pending:other-attempt");

		const reservation = await reserveDuplicate("evt_1", "track");

		expect(reservation).toMatchObject({
			duplicate: false,
			key: "dedup:track:evt_1",
			token: undefined,
			ttl: 86_400,
		});
	});

	test("recovers ownership when an ambiguous SET wrote this request's token", async () => {
		mockRedisSet.mockResolvedValue(null);
		mockRedisGet.mockImplementation(async () => mockRedisSet.mock.calls[0]?.[1]);

		const reservation = await reserveDuplicate("evt_1", "track");

		expect(reservation.token).toBe(mockRedisSet.mock.calls[0]?.[1]);
	});

	test("preserves the exit-event retention when its delivery id is hashed", async () => {
		mockRedisSet.mockResolvedValue("OK");

		await reserveDuplicate("stable-delivery-id", "track", "exit_abc");

		expect(mockRedisSet).toHaveBeenCalledWith(
			"dedup:track:stable-delivery-id",
			expect.stringMatching(/^pending:/),
			"EX",
			172_800,
			"NX"
		);
	});

	test("retries a Redis error before returning a retryable reservation", async () => {
		mockRedisSet
			.mockRejectedValueOnce(new Error("stale connection"))
			.mockResolvedValueOnce("OK");

		const reservation = await reserveDuplicate("evt_1", "track");

		expect(reservation.duplicate).toBe(false);
		expect(mockRedisSet).toHaveBeenCalledTimes(2);
		expect(mockCaptureError).not.toHaveBeenCalled();
	});

	test("fails open for a Redis outage without turning an event into a duplicate", async () => {
		mockRedisSet.mockRejectedValue(new Error("Redis down"));
		mockRedisGet.mockRejectedValue(new Error("Redis down"));

		const reservation = await reserveDuplicate("evt_1", "track");

		expect(reservation).toMatchObject({ duplicate: false, ttl: 86_400 });
		expect(mockRedisSet).toHaveBeenCalledTimes(2);
		expect(mockCaptureError).toHaveBeenCalledOnce();
	});

	test("does not release a reservation it does not own", async () => {
		await releaseDuplicateReservation({ duplicate: false });

		expect(mockRedisEval).not.toHaveBeenCalled();
	});

	test("marks a confirmed delivery before suppressing future retries", async () => {
		mockRedisSet.mockResolvedValue("OK");

		await markDuplicateReservationDelivered({
			duplicate: false,
			key: "dedup:track:evt_1",
			ttl: 86_400,
		});

		expect(mockRedisSet).toHaveBeenCalledWith(
			"dedup:track:evt_1",
			"delivered",
			"EX",
			86_400
		);
	});

	test("releases only the pending reservation owned by the failed request", async () => {
		mockRedisEval.mockResolvedValue(1);

		await releaseDuplicateReservation({
			duplicate: false,
			key: "dedup:track:evt_1",
			token: "pending:owner-attempt",
		});

		expect(mockRedisEval).toHaveBeenCalledWith(
			expect.stringContaining('redis.call("GET", KEYS[1]) == ARGV[1]'),
			1,
			"dedup:track:evt_1",
			"pending:owner-attempt"
		);
	});

	test("does not let a stale attempt release a newer reservation", async () => {
		let storedToken = "pending:newer-attempt";
		mockRedisEval.mockImplementation(
			async (_script, _keys, _key, expectedToken: string) => {
				if (storedToken === expectedToken) {
					storedToken = "";
					return 1;
				}
				return 0;
			}
		);

		await releaseDuplicateReservation({
			duplicate: false,
			key: "dedup:track:evt_1",
			token: "pending:stale-attempt",
		});

		expect(storedToken).toBe("pending:newer-attempt");
	});

	test("captures release failures without hiding the original delivery failure", async () => {
		mockRedisEval.mockRejectedValue(new Error("Redis down"));

		await expect(
			releaseDuplicateReservation({
				duplicate: false,
				key: "dedup:track:evt_1",
				token: "pending:owner-attempt",
			})
		).resolves.toBeUndefined();

		expect(mockCaptureError).toHaveBeenCalledWith(
			expect.any(Error),
			expect.objectContaining({
				message:
					"Failed to release duplicate reservation after delivery failure",
			})
		);
	});
});
