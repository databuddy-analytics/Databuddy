import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { createProcedureClient } from "@orpc/server";
import type { Context } from "../orpc";

process.env.REDIS_URL ??= "redis://localhost:6379";

const SLUG = "acme";

const pageRow = {
	statusPageId: "sp_1",
	orgName: "Acme",
	orgSlug: "acme",
	orgLogo: null,
	statusPageName: "Acme Status",
	statusPageDescription: null,
	logoUrl: null,
	faviconUrl: null,
	websiteUrl: null,
	supportUrl: null,
	theme: "system",
	statusPageMonitorId: "spm_1",
	scheduleId: "sched_1",
	websiteId: null,
	scheduleName: "API",
	scheduleUrl: "https://api.acme.test",
	granularity: "minute",
	monitorDisplayName: null,
	hideUrl: false,
	hideUptimePercentage: false,
	hideLatency: false,
};

const incidentRow = {
	id: "inc_1",
	title: "Elevated latency",
	status: "monitoring",
	severity: "minor",
	createdAt: new Date("2026-08-29T10:00:00.000Z"),
	resolvedAt: null,
	updates: [
		{
			id: "upd_1",
			status: "monitoring",
			message: "Watching",
			createdAt: new Date("2026-08-29T10:05:00.000Z"),
		},
	],
	affectedMonitors: [{ statusPageMonitorId: "spm_1", impact: "degraded" }],
};

// Drizzle query builders are thenable chains; any method returns the chain.
function selectChain(rows: unknown[]) {
	const chain: unknown = new Proxy(
		{},
		{
			get: (_, prop) =>
				prop === "then"
					? (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
							Promise.resolve(rows).then(resolve, reject)
					: () => chain,
		}
	);
	return chain;
}

const redisStore = new Map<string, string>();
const fakeRedis = {
	del: mock(async (...keys: string[]) => {
		for (const key of keys) {
			redisStore.delete(key);
		}
		return keys.length;
	}),
	expire: mock(async () => 1),
	get: mock(async (key: string) => redisStore.get(key) ?? null),
	sadd: mock(async () => 1),
	setex: mock(async (key: string, _ttl: number, value: string) => {
		redisStore.set(key, value);
		return "OK";
	}),
	ttl: mock(async () => 60),
};

const mockSelect = mock(() => selectChain([pageRow]));
const mockFindIncidents = mock(async () => [incidentRow]);
const mockChQuery = mock(async (sql: string) =>
	sql.includes("argMax")
		? [
				{
					site_id: "sched_1",
					last_timestamp: "2026-08-30 09:59:30",
					last_status: 1,
					last_http_code: 200,
				},
			]
		: [
				{
					site_id: "sched_1",
					date: "2026-08-30",
					uptime_percentage: 100,
					total_checks: 10,
					successful_checks: 10,
					downtime_seconds: 0,
					avg_response_time: 120,
					p95_response_time: 200,
				},
			]
);

let statusPageRouter: typeof import("./status-page").statusPageRouter;

beforeAll(async () => {
	const realDb = await import("@databuddy/db");
	const realRedis = await import("@databuddy/redis/redis");

	mock.module("@databuddy/db", () => ({
		...realDb,
		db: {
			select: mockSelect,
			query: { incidents: { findMany: mockFindIncidents } },
		},
	}));
	mock.module("@databuddy/db/clickhouse", () => ({ chQuery: mockChQuery }));
	mock.module("@databuddy/redis/redis", () => ({
		...realRedis,
		getRedisCache: () => fakeRedis,
	}));
	mock.module("@databuddy/redis/rate-limit", () => ({
		ratelimit: async () => ({ success: true }),
	}));

	({ statusPageRouter } = await import("./status-page"));

	mock.restore();
});

beforeEach(() => {
	redisStore.clear();
	mockSelect.mockClear();
});

function getBySlug() {
	return createProcedureClient(statusPageRouter.getBySlug, {
		context: { db: {}, headers: new Headers() } as unknown as Context,
	})({ slug: SLUG, days: 90 });
}

describe("statusPage.getBySlug caching", () => {
	test("cache hit returns the same validated payload as the cache miss", async () => {
		const miss = await getBySlug();
		expect(mockSelect).toHaveBeenCalledTimes(1);
		expect(redisStore.size).toBe(1);
		expect(miss.monitors[0]?.lastCheckedAt).toBe("2026-08-30T09:59:30.000Z");
		expect(miss.incidents[0]?.createdAt).toBe("2026-08-29T10:00:00.000Z");

		const hit = await getBySlug();
		expect(mockSelect).toHaveBeenCalledTimes(1);
		expect(hit).toEqual(miss);
	});
});
