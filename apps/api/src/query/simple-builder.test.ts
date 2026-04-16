import { describe, expect, it } from "bun:test";
import { SimpleQueryBuilder } from "./simple-builder";
import type { Filter, QueryRequest, SimpleQueryConfig } from "./types";

function makeRequest(overrides: Partial<QueryRequest> = {}): QueryRequest {
	return {
		projectId: "test-site-id",
		type: "test",
		from: "2026-04-01",
		to: "2026-04-11",
		...overrides,
	};
}

function makeConfig(overrides: Partial<SimpleQueryConfig> = {}): SimpleQueryConfig {
	return {
		table: "analytics.events",
		fields: ["count() as total"],
		groupBy: ["path"],
		orderBy: "total DESC",
		limit: 10,
		...overrides,
	};
}

function compile(
	config: Partial<SimpleQueryConfig> = {},
	request: Partial<QueryRequest> = {},
	domain?: string | null
) {
	return new SimpleQueryBuilder(
		makeConfig(config),
		makeRequest(request),
		domain
	).compile();
}

describe("SimpleQueryBuilder.compile", () => {
	it("produces a valid SELECT with tenant filter and date range", () => {
		const { sql, params } = compile();
		expect(sql).toContain("client_id = {websiteId:String}");
		expect(sql).toContain("FROM analytics.events");
		expect(sql).toContain("GROUP BY path");
		expect(sql).toContain("ORDER BY total DESC");
		expect(sql).toContain("LIMIT 10");
		expect(params.websiteId).toBe("test-site-id");
	});

	it("applies eq filter with parameterized value", () => {
		const filters: Filter[] = [{ field: "country", op: "eq", value: "US" }];
		const { sql, params } = compile({}, { filters });
		expect(sql).toContain("country = {f0:String}");
		expect(params.f0).toBe("US");
	});

	it("applies ne filter", () => {
		const filters: Filter[] = [{ field: "country", op: "ne", value: "US" }];
		const { sql, params } = compile({}, { filters });
		expect(sql).toContain("country != {f0:String}");
		expect(params.f0).toBe("US");
	});

	it("applies contains filter with LIKE and escaped pattern", () => {
		const filters: Filter[] = [
			{ field: "path", op: "contains", value: "/blog" },
		];
		const { sql, params } = compile({}, { filters });
		expect(sql).toContain("LIKE {f0:String}");
		expect(params.f0).toBe("%/blog%");
	});

	it("applies not_contains filter", () => {
		const filters: Filter[] = [
			{ field: "path", op: "not_contains", value: "/admin" },
		];
		const { sql } = compile({}, { filters });
		expect(sql).toContain("NOT LIKE {f0:String}");
	});

	it("applies starts_with filter", () => {
		const filters: Filter[] = [
			{ field: "path", op: "starts_with", value: "/docs" },
		];
		const { sql, params } = compile({}, { filters });
		expect(sql).toContain("LIKE {f0:String}");
		expect(params.f0).toBe("/docs%");
	});

	it("applies in filter with array param", () => {
		const filters: Filter[] = [
			{ field: "country", op: "in", value: ["US", "UK", "DE"] },
		];
		const { sql, params } = compile({}, { filters });
		expect(sql).toContain("IN {f0:Array(String)}");
		expect(params.f0).toEqual(["US", "UK", "DE"]);
	});

	it("applies not_in filter", () => {
		const filters: Filter[] = [
			{ field: "country", op: "not_in", value: ["CN", "RU"] },
		];
		const { sql } = compile({}, { filters });
		expect(sql).toContain("NOT IN {f0:Array(String)}");
	});

	it("escapes LIKE special characters in contains filter", () => {
		const filters: Filter[] = [
			{ field: "path", op: "contains", value: "100%" },
		];
		const { params } = compile({}, { filters });
		expect(params.f0).toBe("%100\\%%");
	});

	it("escapes underscores in LIKE patterns", () => {
		const filters: Filter[] = [
			{ field: "path", op: "contains", value: "test_page" },
		];
		const { params } = compile({}, { filters });
		expect(params.f0).toBe("%test\\_page%");
	});

	it("escapes backslashes in LIKE patterns", () => {
		const filters: Filter[] = [
			{ field: "path", op: "contains", value: "a\\b" },
		];
		const { params } = compile({}, { filters });
		expect(params.f0).toBe("%a\\\\b%");
	});

	it("handles desktop device_type filter (empty string OR desktop)", () => {
		const filters: Filter[] = [
			{ field: "device_type", op: "eq", value: "desktop" },
		];
		const { sql } = compile({}, { filters });
		expect(sql).toContain("device_type = '' OR lower(device_type) = 'desktop'");
	});

	it("handles mobile device_type filter", () => {
		const filters: Filter[] = [
			{ field: "device_type", op: "eq", value: "mobile" },
		];
		const { sql } = compile({}, { filters });
		expect(sql).toContain("lower(device_type) = 'mobile'");
	});

	it("throws on disallowed filter field", () => {
		const filters: Filter[] = [
			{ field: "secret_col", op: "eq", value: "x" },
		];
		expect(() =>
			compile({ allowedFilters: ["country"] }, { filters })
		).toThrow("not permitted");
	});

	it("allows globally allowed filters even when allowedFilters is set", () => {
		const filters: Filter[] = [
			{ field: "country", op: "eq", value: "US" },
		];
		expect(() =>
			compile({ allowedFilters: ["custom_field"] }, { filters })
		).not.toThrow();
	});

	it("throws on SQL injection in groupBy", () => {
		expect(() =>
			compile({}, { groupBy: ["path; DROP TABLE analytics.events"] })
		).toThrow("dangerous keyword");
	});

	it("throws on SQL injection in orderBy", () => {
		expect(() =>
			compile({}, { orderBy: "total DESC; DELETE FROM analytics.events" })
		).toThrow("dangerous keyword");
	});

	it("normalizes referrer filter values", () => {
		const filters: Filter[] = [
			{ field: "referrer", op: "eq", value: "google" },
		];
		const { params } = compile({}, { filters });
		expect(params.f0).toBe("https://google.com");
	});

	it("uses custom idField when configured", () => {
		const { sql } = compile({ idField: "owner_id" });
		expect(sql).toContain("owner_id = {websiteId:String}");
		expect(sql).not.toContain("client_id");
	});

	it("skips date filter when skipDateFilter is true", () => {
		const { sql } = compile({ skipDateFilter: true });
		expect(sql).not.toContain("toDateTime({from:String})");
	});

	it("applies request limit override", () => {
		const { sql } = compile({ limit: 10 }, { limit: 25 });
		expect(sql).toContain("LIMIT 25");
	});

	it("applies offset", () => {
		const { sql } = compile({}, { offset: 50 });
		expect(sql).toContain("OFFSET 50");
	});
});
