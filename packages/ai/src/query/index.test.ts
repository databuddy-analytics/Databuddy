import { describe, expect, it } from "bun:test";
import { compileQuery } from "./index";
import type { QueryRequest } from "./types";

const request: QueryRequest = {
	projectId: "test-website",
	type: "top_pages",
	from: "2026-01-01",
	to: "2026-01-02",
};

describe("query pagination validation", () => {
	it.each([
		{ limit: 1.5 },
		{ offset: 0.5 },
	])("rejects fractional pagination before compiling: %o", (pagination) => {
		expect(() => compileQuery({ ...request, ...pagination })).toThrow();
	});

	it("accepts integer pagination", () => {
		const compiled = compileQuery({ ...request, limit: 10, offset: 20 });

		expect(compiled.sql).toContain("LIMIT 10 OFFSET 20");
	});
});
