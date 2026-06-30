import { afterEach, describe, expect, mock, test } from "bun:test";
import { querySearchAnalytics, type SearchConsoleRow } from "./search-console";

const SITE_URL = "sc-domain:example.com";

function mockFetch(
	body: unknown,
	status = 200
): typeof globalThis.fetch {
	return mock(() =>
		Promise.resolve(
			new Response(JSON.stringify(body), {
				status,
				headers: { "Content-Type": "application/json" },
			})
		)
	) as unknown as typeof globalThis.fetch;
}

afterEach(() => {
	globalThis.fetch = globalThis.fetch;
});

describe("querySearchAnalytics", () => {
	test("maps rows with single dimension", async () => {
		const original = globalThis.fetch;
		globalThis.fetch = mockFetch({
			rows: [
				{ keys: ["best analytics tool"], clicks: 42, impressions: 1200, ctr: 0.035, position: 3.7 },
				{ keys: ["web analytics"], clicks: 18, impressions: 800, ctr: 0.0225, position: 5.2 },
			],
		});

		const result = await querySearchAnalytics("token-123", SITE_URL, {
			startDate: "2026-05-01",
			endDate: "2026-05-15",
			dimensions: ["query"],
			rowLimit: 25,
		});
		globalThis.fetch = original;

		expect(result).not.toHaveProperty("error");
		const data = result as { rows: SearchConsoleRow[]; rowCount: number; siteUrl: string };
		expect(data.siteUrl).toBe(SITE_URL);
		expect(data.rowCount).toBe(2);

		expect(data.rows[0].query).toBe("best analytics tool");
		expect(data.rows[0].clicks).toBe(42);
		expect(data.rows[0].impressions).toBe(1200);
		expect(data.rows[0].ctr).toBe(3.5);
		expect(data.rows[0].position).toBe(3.7);

		expect(data.rows[1].query).toBe("web analytics");
		expect(data.rows[1].clicks).toBe(18);
	});

	test("maps rows with multiple dimensions", async () => {
		const original = globalThis.fetch;
		globalThis.fetch = mockFetch({
			rows: [
				{ keys: ["analytics", "/pricing"], clicks: 10, impressions: 500, ctr: 0.02, position: 4.0 },
			],
		});

		const result = await querySearchAnalytics("token-123", SITE_URL, {
			startDate: "2026-05-01",
			endDate: "2026-05-15",
			dimensions: ["query", "page"],
			rowLimit: 25,
		});
		globalThis.fetch = original;

		const data = result as { rows: SearchConsoleRow[] };
		expect(data.rows[0].query).toBe("analytics");
		expect(data.rows[0].page).toBe("/pricing");
		expect(data.rows[0].clicks).toBe(10);
	});

	test("returns empty rows when API returns no data", async () => {
		const original = globalThis.fetch;
		globalThis.fetch = mockFetch({});

		const result = await querySearchAnalytics("token-123", SITE_URL, {
			startDate: "2026-05-01",
			endDate: "2026-05-15",
			dimensions: ["query"],
			rowLimit: 25,
		});
		globalThis.fetch = original;

		const data = result as { rows: SearchConsoleRow[]; rowCount: number };
		expect(data.rows).toEqual([]);
		expect(data.rowCount).toBe(0);
	});

	test("returns error on non-ok response", async () => {
		const original = globalThis.fetch;
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response("Forbidden", { status: 403 }))
		) as unknown as typeof globalThis.fetch;

		const result = await querySearchAnalytics("token-123", SITE_URL, {
			startDate: "2026-05-01",
			endDate: "2026-05-15",
			dimensions: ["query"],
			rowLimit: 25,
		});
		globalThis.fetch = original;

		expect(result).toHaveProperty("error");
		const err = result as { error: string };
		expect(err.error).toContain("403");
	});

	test("rounds CTR to one decimal percentage", async () => {
		const original = globalThis.fetch;
		globalThis.fetch = mockFetch({
			rows: [{ keys: ["test"], clicks: 1, impressions: 3, ctr: 0.33333, position: 1.0 }],
		});

		const result = await querySearchAnalytics("token-123", SITE_URL, {
			startDate: "2026-05-01",
			endDate: "2026-05-15",
			dimensions: ["query"],
			rowLimit: 25,
		});
		globalThis.fetch = original;

		const data = result as { rows: SearchConsoleRow[] };
		expect(data.rows[0].ctr).toBe(33.3);
	});

	test("rounds position to one decimal", async () => {
		const original = globalThis.fetch;
		globalThis.fetch = mockFetch({
			rows: [{ keys: ["test"], clicks: 1, impressions: 10, ctr: 0.1, position: 7.456 }],
		});

		const result = await querySearchAnalytics("token-123", SITE_URL, {
			startDate: "2026-05-01",
			endDate: "2026-05-15",
			dimensions: ["query"],
			rowLimit: 25,
		});
		globalThis.fetch = original;

		const data = result as { rows: SearchConsoleRow[] };
		expect(data.rows[0].position).toBe(7.5);
	});

	test("sends correct request body to GSC API", async () => {
		const original = globalThis.fetch;
		let capturedBody: string | undefined;
		let capturedUrl: string | undefined;
		globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
			capturedUrl = typeof url === "string" ? url : url.toString();
			capturedBody = init?.body as string;
			return Promise.resolve(
				new Response(JSON.stringify({ rows: [] }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				})
			);
		}) as unknown as typeof globalThis.fetch;

		await querySearchAnalytics("my-token", "sc-domain:test.com", {
			startDate: "2026-01-01",
			endDate: "2026-01-31",
			dimensions: ["page", "device"],
			rowLimit: 10,
		});
		globalThis.fetch = original;

		expect(capturedUrl).toContain("sc-domain%3Atest.com");
		expect(capturedUrl).toContain("searchAnalytics/query");

		const body = JSON.parse(capturedBody!);
		expect(body.startDate).toBe("2026-01-01");
		expect(body.endDate).toBe("2026-01-31");
		expect(body.dimensions).toEqual(["page", "device"]);
		expect(body.rowLimit).toBe(10);
		expect(body.dataState).toBe("final");
	});

	test("sends authorization header", async () => {
		const original = globalThis.fetch;
		let capturedHeaders: HeadersInit | undefined;
		globalThis.fetch = mock((_url: string | URL | Request, init?: RequestInit) => {
			capturedHeaders = init?.headers;
			return Promise.resolve(
				new Response(JSON.stringify({ rows: [] }), { status: 200 })
			);
		}) as unknown as typeof globalThis.fetch;

		await querySearchAnalytics("secret-token", SITE_URL, {
			startDate: "2026-05-01",
			endDate: "2026-05-15",
			dimensions: ["query"],
			rowLimit: 25,
		});
		globalThis.fetch = original;

		const headers = capturedHeaders as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer secret-token");
	});
});
