import { beforeAll, expect, mock, test } from "bun:test";
import { createProcedureClient } from "@orpc/server";
import type { Context } from "../orpc";

const statusPageRow = {
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
};

const incident = {
	id: "inc_1",
	title: "Elevated latency",
	status: "monitoring",
	severity: "minor",
	createdAt: new Date("2026-08-29T10:00:00.000Z"),
	resolvedAt: null,
	updates: [],
	affectedMonitors: [{ statusPageMonitorId: "spm_1", impact: "degraded" }],
};

const latestCheck = {
	site_id: "sched_1",
	last_timestamp: "2026-08-30 09:59:30",
	last_status: 1,
	last_http_code: 200,
};

// Stands in for a drizzle query builder: every method chains, awaiting yields rows.
function queryReturning(rows: unknown[]) {
	const builder: unknown = new Proxy(
		{},
		{
			get: (_, prop) =>
				prop === "then"
					? (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
							Promise.resolve(rows).then(resolve, reject)
					: () => builder,
		}
	);
	return builder;
}

const redisStore = new Map<string, string>();
const fakeRedis = {
	get: async (key: string) => redisStore.get(key) ?? null,
	setex: async (key: string, _ttl: number, value: string) => {
		redisStore.set(key, value);
		return "OK";
	},
	ttl: async () => 60,
};

const select = mock(() => queryReturning([statusPageRow]));

let statusPageRouter: typeof import("./status-page").statusPageRouter;

beforeAll(async () => {
	const realDb = await import("@databuddy/db");
	const realRedis = await import("@databuddy/redis/redis");

	mock.module("@databuddy/db", () => ({
		...realDb,
		db: { select, query: { incidents: { findMany: async () => [incident] } } },
	}));
	mock.module("@databuddy/db/clickhouse", () => ({
		chQuery: async (sql: string) => (sql.includes("argMax") ? [latestCheck] : []),
	}));
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

function getBySlug() {
	return createProcedureClient(statusPageRouter.getBySlug, {
		context: { db: {}, headers: new Headers() } as unknown as Context,
	})({ slug: "acme" });
}

test("getBySlug cache hit returns the same validated payload as the miss", async () => {
	const miss = await getBySlug();
	expect(select).toHaveBeenCalledTimes(1);
	expect(redisStore.size).toBe(1);
	expect(miss.monitors[0]?.lastCheckedAt).toBe("2026-08-30T09:59:30.000Z");
	expect(miss.incidents[0]?.createdAt).toBe("2026-08-29T10:00:00.000Z");

	const hit = await getBySlug();
	expect(select).toHaveBeenCalledTimes(1);
	expect(hit).toEqual(miss);
});
