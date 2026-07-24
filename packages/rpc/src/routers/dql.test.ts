import {
	DQL_INPUT_LIMITS,
	DQL_RESOURCE_LIMITS,
	type DqlParameterValue,
	type DqlQueryInput,
	DqlQueryRejectedError,
} from "@databuddy/db/clickhouse";
import { describe, expect, it } from "bun:test";
import type { Context } from "../orpc";
import type { DqlRouterDeps } from "./dql";

process.env.REDIS_URL ??= "redis://localhost:6379";

const { dqlRequestSchema, executeDqlForRequest, getDqlSchemaForRequest } =
	await import("./dql");

const RESULT = {
	columns: [{ name: "path", type: "String" }],
	rows: [{ path: "/" }],
	stats: {
		bytesRead: 12,
		elapsedMs: 3,
		queryId: "query-1",
		rowCount: 1,
		rowsRead: 1,
	},
};

function contextForUser(userId: string): Context {
	return {
		user: { id: userId },
		apiKey: undefined,
	} as Context;
}

function contextForApiKey(apiKeyId: string): Context {
	return {
		user: undefined,
		apiKey: { id: apiKeyId },
	} as Context;
}

function createDeps(overrides: Partial<DqlRouterDeps> = {}) {
	const calls = {
		execute: [] as DqlQueryInput[],
		rateLimit: [] as Array<{
			key: string;
			limit: number;
			windowSeconds: number;
		}>,
		resolveWorkspace: [] as Array<{
			permissions: readonly ["view_analytics"];
			websiteId: string;
		}>,
	};

	const deps: DqlRouterDeps = {
		execute: async (input) => {
			calls.execute.push(input);
			return RESULT;
		},
		rateLimit: async (key, limit, windowSeconds) => {
			calls.rateLimit.push({ key, limit, windowSeconds });
			return { reset: Date.now() + 60_000, success: true };
		},
		resolveWorkspace: async (_context, options) => {
			calls.resolveWorkspace.push(options);
			return { website: { id: "website-authorized" } };
		},
		...overrides,
	};

	return { calls, deps };
}

async function captureError(promise: Promise<unknown>): Promise<{
	code?: string;
	data?: { retryAfter?: number };
	message?: string;
}> {
	try {
		await promise;
		throw new Error("Expected promise to reject");
	} catch (error) {
		return error as {
			code?: string;
			data?: { retryAfter?: number };
			message?: string;
		};
	}
}

describe("DQL router", () => {
	it("uses the authorized website for execution", async () => {
		const { calls, deps } = createDeps();
		const params: Record<string, DqlParameterValue> = { path: "/" };

		const result = await executeDqlForRequest(
			contextForUser("user-1"),
			{
				websiteId: "website-requested",
				sql: "SELECT path FROM analytics.events WHERE path = {path:String}",
				params,
			},
			deps
		);

		expect(result).toEqual(RESULT);
		expect(calls.resolveWorkspace).toEqual([
			{
				websiteId: "website-requested",
				permissions: ["view_analytics"],
			},
		]);
		expect(calls.rateLimit).toEqual([
			{
				key: "dql:execute:user:user-1",
				limit: 30,
				windowSeconds: 60,
			},
		]);
		expect(calls.execute[0]).toMatchObject({
			websiteId: "website-authorized",
			sql: "SELECT path FROM analytics.events WHERE path = {path:String}",
			params,
		});
	});

	it("uses API keys as principals and stops at the rate limit", async () => {
		const { calls, deps } = createDeps({
			rateLimit: async (key, limit, windowSeconds) => {
				calls.rateLimit.push({ key, limit, windowSeconds });
				return { reset: Date.now() + 20_000, success: false };
			},
		});

		const error = await captureError(
			executeDqlForRequest(
				contextForApiKey("key-1"),
				{
					websiteId: "website-requested",
					sql: "SELECT path FROM analytics.events",
				},
				deps
			)
		);

		expect(calls.rateLimit[0]?.key).toBe("dql:execute:apikey:key-1");
		expect(error.code).toBe("RATE_LIMITED");
		expect(error.data?.retryAfter).toBeGreaterThan(0);
		expect(calls.execute).toEqual([]);
	});

	it("rejects work beyond the ClickHouse concurrency budget", async () => {
		let releaseExecutions = () => undefined;
		let markAllStarted = () => undefined;
		let startedCount = 0;
		const release = new Promise<void>((resolve) => {
			releaseExecutions = resolve;
		});
		const allStarted = new Promise<void>((resolve) => {
			markAllStarted = resolve;
		});
		const { deps } = createDeps({
			execute: async () => {
				startedCount += 1;
				if (startedCount === DQL_RESOURCE_LIMITS.maxConcurrentQueries) {
					markAllStarted();
				}
				await release;
				return RESULT;
			},
		});
		const running = Array.from(
			{ length: DQL_RESOURCE_LIMITS.maxConcurrentQueries },
			(_, index) =>
				executeDqlForRequest(
					contextForUser(`user-${index}`),
					{
						websiteId: "website-requested",
						sql: "SELECT path FROM analytics.events",
					},
					deps
				)
		);
		await allStarted;

		const error = await captureError(
			executeDqlForRequest(
				contextForUser("user-over-limit"),
				{
					websiteId: "website-requested",
					sql: "SELECT path FROM analytics.events",
				},
				deps
			)
		);

		expect(error.code).toBe("RATE_LIMITED");
		expect(error.data?.retryAfter).toBe(1);
		releaseExecutions();
		await Promise.all(running);
	});

	it("authorizes schema reads without exposing tenant internals", async () => {
		const { calls, deps } = createDeps();

		const result = await getDqlSchemaForRequest(
			contextForUser("user-1"),
			"website-requested",
			deps
		);

		expect(result.tables[0]?.name).toBe("analytics.events");
		expect(result.tables[0]?.columns).toContainEqual({
			name: "path",
			type: "String",
		});
		expect(result.tables[0]).not.toHaveProperty("tenantColumn");
		expect(
			result.tables[0]?.columns.some((column) => column.name === "client_id")
		).toBe(false);
		expect(calls.execute).toEqual([]);
	});

	it("bounds parameter count and size at the RPC boundary", () => {
		const tooManyParameters = Object.fromEntries(
			Array.from(
				{ length: DQL_INPUT_LIMITS.maxParameters + 1 },
				(_, index) => [`parameter_${index}`, "value"]
			)
		);
		const oversizedParameters = Object.fromEntries(
			Array.from({ length: 5 }, (_, index) => [
				`parameter_${index}`,
				"x".repeat(DQL_INPUT_LIMITS.maxStringLength),
			])
		);
		const base = {
			sql: "SELECT path FROM analytics.events",
			websiteId: "website-requested",
		};

		expect(
			dqlRequestSchema.safeParse({ ...base, params: tooManyParameters }).success
		).toBe(false);
		expect(
			dqlRequestSchema.safeParse({ ...base, params: oversizedParameters })
				.success
		).toBe(false);
	});

	it("returns sanitized query errors as bad requests", async () => {
		const { deps } = createDeps({
			execute: async () => {
				throw new DqlQueryRejectedError(
					"DQL references an unknown identifier."
				);
			},
		});

		const error = await captureError(
			executeDqlForRequest(
				contextForUser("user-1"),
				{
					websiteId: "website-requested",
					sql: "SELECT missing FROM analytics.events",
				},
				deps
			)
		);

		expect(error).toMatchObject({
			code: "BAD_REQUEST",
			message: "DQL references an unknown identifier.",
		});
	});

	it("does not expose database failures", async () => {
		const { deps } = createDeps({
			execute: async () => {
				throw new Error("database host detail");
			},
		});

		const error = await captureError(
			executeDqlForRequest(
				contextForUser("user-1"),
				{
					websiteId: "website-requested",
					sql: "SELECT path FROM analytics.events",
				},
				deps
			)
		);

		expect(error.code).toBe("INTERNAL_SERVER_ERROR");
		expect(error.message).not.toContain("detail");
	});
});
