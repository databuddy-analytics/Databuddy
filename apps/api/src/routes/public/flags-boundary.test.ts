import "@databuddy/test/env";
import { Elysia } from "elysia";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	flags: [
		{
			defaultValue: true,
			dependencies: null,
			flagsToTargetGroups: [],
			key: "enabled-for-everyone",
			payload: null,
			rolloutBy: null,
			rolloutPercentage: null,
			rules: null,
			status: "active",
			type: "boolean",
			variants: null,
		},
	],
}));

vi.mock("@databuddy/db", async (importOriginal) => ({
	...(await importOriginal<typeof import("@databuddy/db")>()),
	db: {
		query: {
			flags: {
				findMany: vi.fn(async () => state.flags),
			},
		},
	},
}));

vi.mock("@databuddy/redis", async (importOriginal) => ({
	...(await importOriginal<typeof import("@databuddy/redis")>()),
	cacheable: (fn: (...args: never[]) => unknown) => fn,
}));

vi.mock("@databuddy/redis/rate-limit", () => ({
	getRateLimitHeaders: () => ({}),
	ratelimit: async () => ({ success: true }),
}));

const { flagsRoute } = await import("./flags");
const app = new Elysia().use(flagsRoute);

function request(path: string, body?: unknown) {
	return app.handle(
		new Request(`http://localhost${path}`, {
			body: body === undefined ? undefined : JSON.stringify(body),
			headers:
				body === undefined ? undefined : { "content-type": "application/json" },
			method: body === undefined ? "GET" : "POST",
		})
	);
}

describe("public bulk flags boundary", () => {
	it("returns all flags only when the key filter is omitted", async () => {
		for (const response of [
			await request("/v1/flags/bulk?clientId=site_1"),
			await request("/v1/flags/bulk", { clientId: "site_1" }),
		]) {
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				count: 1,
				flags: { "enabled-for-everyone": { enabled: true } },
			});
		}
	});

	it("returns no flags for explicitly empty or blank key lists", async () => {
		for (const response of [
			await request("/v1/flags/bulk?clientId=site_1&keys="),
			await request("/v1/flags/bulk?clientId=site_1&keys=%20,%20"),
			await request("/v1/flags/bulk", { clientId: "site_1", keys: [] }),
			await request("/v1/flags/bulk", {
				clientId: "site_1",
				keys: ["", " "],
			}),
		]) {
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual({ count: 0, flags: {} });
		}
	});

	it("rejects more than 100 requested keys", async () => {
		const keys = Array.from({ length: 101 }, (_, index) => `flag-${index}`);
		const getResponse = await request(
			`/v1/flags/bulk?clientId=site_1&keys=${keys.join(",")}`
		);
		expect(getResponse.status).toBe(400);

		const postResponse = await request("/v1/flags/bulk", {
			clientId: "site_1",
			keys,
		});
		expect(postResponse.status).toBe(422);
	});

	it("rejects keys longer than 128 characters", async () => {
		const key = "x".repeat(129);
		const getResponse = await request(
			`/v1/flags/bulk?clientId=site_1&keys=${key}`
		);
		expect(getResponse.status).toBe(400);

		const postResponse = await request("/v1/flags/bulk", {
			clientId: "site_1",
			keys: [key],
		});
		expect(postResponse.status).toBe(422);
	});
});
