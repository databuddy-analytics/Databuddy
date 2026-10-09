import { describe, expect, mock, test } from "bun:test";
import { z } from "zod";
import {
	createSearchConsoleTools,
	querySearchAnalytics,
} from "./search-console";

const SITE_URL = "sc-domain:example.com";

function mockFetch(
	respond: (request: { dataState: string; dimensions: string[] }) => unknown
): typeof globalThis.fetch {
	return Object.assign(
		mock((_url: string | URL | Request, init?: RequestInit) =>
			Promise.resolve(
				new Response(JSON.stringify(respond(JSON.parse(String(init?.body)))), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				})
			)
		),
		{ preconnect: globalThis.fetch.preconnect }
	);
}

function dateRows(...dates: string[]) {
	return {
		rows: dates.map((date) => ({
			keys: [date],
			clicks: 1,
			impressions: 10,
			ctr: 0.1,
			position: 4,
		})),
	};
}

describe("querySearchAnalytics", () => {
	test("maps rows with single dimension", async () => {
		const original = globalThis.fetch;
		globalThis.fetch = mockFetch(({ dimensions }) =>
			dimensions.includes("date")
				? dateRows("2026-05-14", "2026-05-15")
				: {
						rows: [
							{
								keys: ["best analytics tool"],
								clicks: 42,
								impressions: 1200,
								ctr: 0.035,
								position: 3.7,
							},
							{
								keys: ["web analytics"],
								clicks: 18,
								impressions: 800,
								ctr: 0.0225,
								position: 5.2,
							},
						],
					}
		);

		const result = await querySearchAnalytics("token-123", SITE_URL, {
			startDate: "2026-05-01",
			endDate: "2026-05-15",
			dimensions: ["query"],
			rowLimit: 25,
		});
		globalThis.fetch = original;

		expect(result).toMatchObject({
			siteUrl: SITE_URL,
			finalThrough: null,
			provisional: null,
			truncated: false,
			rows: [
				{
					query: "best analytics tool",
					clicks: 42,
					impressions: 1200,
					ctr: 3.5,
					position: 3.7,
				},
				{ query: "web analytics", clicks: 18 },
			],
		});
	});

	test("labels days from the provider's first incomplete date as provisional", async () => {
		const original = globalThis.fetch;
		globalThis.fetch = mockFetch(({ dimensions }) =>
			dimensions.includes("date")
				? {
						...dateRows("2026-05-12", "2026-05-11"),
						metadata: { first_incomplete_date: "2026-05-14" },
					}
				: {
						rows: Array.from({ length: 10 }, (_, index) => ({
							keys: [`/page-${index}`],
							clicks: 10 - index,
							impressions: 100,
							ctr: 0.1,
							position: 2,
						})),
					}
		);

		const result = await querySearchAnalytics("token-123", SITE_URL, {
			startDate: "2026-05-01",
			endDate: "2026-05-15",
			dimensions: ["page"],
			rowLimit: 10,
		});
		globalThis.fetch = original;

		expect(result).toMatchObject({
			finalThrough: "2026-05-13",
			provisional: true,
			truncated: true,
		});
	});

	test("returns empty rows when API returns no data", async () => {
		const original = globalThis.fetch;
		globalThis.fetch = mockFetch(() => ({}));

		const result = await querySearchAnalytics("token-123", SITE_URL, {
			startDate: "2026-05-01",
			endDate: "2026-05-15",
			dimensions: ["query"],
			rowLimit: 25,
		});
		globalThis.fetch = original;

		expect(result).toEqual({
			siteUrl: SITE_URL,
			finalThrough: null,
			provisional: null,
			truncated: false,
			rows: [],
		});
	});

	test("does not invent a cutoff from sparse dates and reuses a date-grouped query", async () => {
		const original = globalThis.fetch;
		const fetch = mockFetch(() => dateRows("2026-05-11", "2026-05-12"));
		globalThis.fetch = fetch;
		const result = await querySearchAnalytics("token-123", SITE_URL, {
			startDate: "2026-05-01",
			endDate: "2026-05-15",
			dimensions: ["date"],
			rowLimit: 25,
		});
		globalThis.fetch = original;

		expect(result).toMatchObject({
			finalThrough: null,
			provisional: null,
			rows: [{ date: "2026-05-11" }, { date: "2026-05-12" }],
		});
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	test("returns error on non-ok response", async () => {
		const original = globalThis.fetch;
		globalThis.fetch = Object.assign(
			mock(() => Promise.resolve(new Response("Forbidden", { status: 403 }))),
			{ preconnect: original.preconnect }
		);

		const result = await querySearchAnalytics("token-123", SITE_URL, {
			startDate: "2026-05-01",
			endDate: "2026-05-15",
			dimensions: ["query"],
			rowLimit: 25,
		});
		globalThis.fetch = original;

		expect(result).toHaveProperty("error");
		if (!("error" in result)) {
			throw new Error("Expected a Search Console API error");
		}
		expect(result.error).toContain("403");
	});

	test("keeps rows with an unknown cutoff when the freshness request fails", async () => {
		const original = globalThis.fetch;
		const results: unknown[] = [];
		for (const failFreshness of [
			() => new Response("Backend Error", { status: 500 }),
			() => {
				throw new Error("The operation timed out.");
			},
		]) {
			globalThis.fetch = Object.assign(
				mock(async (_url: string | URL | Request, init?: RequestInit) =>
					JSON.parse(String(init?.body)).dimensions.includes("date")
						? failFreshness()
						: Response.json({
								rows: [
									{
										keys: ["best analytics tool"],
										clicks: 42,
										impressions: 1200,
										ctr: 0.035,
										position: 3.7,
									},
								],
							})
				),
				{ preconnect: original.preconnect }
			);
			results.push(
				await querySearchAnalytics("token-123", SITE_URL, {
					startDate: "2026-05-01",
					endDate: "2026-05-15",
					dimensions: ["query"],
					rowLimit: 25,
				})
			);
		}
		globalThis.fetch = original;

		const expected = {
			siteUrl: SITE_URL,
			finalThrough: null,
			provisional: null,
			truncated: false,
			rows: [
				{
					query: "best analytics tool",
					clicks: 42,
					impressions: 1200,
					ctr: 3.5,
					position: 3.7,
				},
			],
		};
		expect(results).toEqual([expected, expected]);
	});

	test("sends correct request body to GSC API", async () => {
		const original = globalThis.fetch;
		const capturedBodies: unknown[] = [];
		const capturedUrls: string[] = [];
		globalThis.fetch = Object.assign(
			mock((url: string | URL | Request, init?: RequestInit) => {
				capturedUrls.push(typeof url === "string" ? url : url.toString());
				capturedBodies.push(JSON.parse(String(init?.body)));
				return Promise.resolve(
					new Response(JSON.stringify({ rows: [] }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					})
				);
			}),
			{ preconnect: original.preconnect }
		);

		await querySearchAnalytics("my-token", "sc-domain:test.com", {
			startDate: "2026-01-01",
			endDate: "2026-01-31",
			dimensions: ["page", "device"],
			rowLimit: 10,
		});
		globalThis.fetch = original;

		for (const url of capturedUrls) {
			expect(url).toContain("sc-domain%3Atest.com");
			expect(url).toContain("searchAnalytics/query");
		}
		expect(capturedBodies).toEqual([
			{
				startDate: "2026-01-01",
				endDate: "2026-01-31",
				dimensions: ["page", "device"],
				rowLimit: 10,
				dataState: "all",
			},
			{
				startDate: "2026-01-01",
				endDate: "2026-01-31",
				dimensions: ["date"],
				dataState: "all",
			},
		]);
	});

	test("accepts only YYYY-MM-DD dates", () => {
		const input = createSearchConsoleTools({ organizationId: "org_1" })
			.search_console.inputSchema;
		if (!(input instanceof z.ZodType)) {
			throw new Error("Missing Search Console input schema");
		}
		const valid = {
			startDate: "2026-05-01",
			endDate: "2026-05-15",
			dimensions: ["query"],
		};

		expect(input.safeParse(valid).success).toBe(true);
		for (const date of ["2026-5-1", "2026-05-01T00:00:00Z", "last week"]) {
			expect(input.safeParse({ ...valid, startDate: date }).success).toBe(
				false
			);
		}
	});
});
