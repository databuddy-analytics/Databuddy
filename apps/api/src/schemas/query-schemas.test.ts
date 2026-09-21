import { Elysia, t } from "elysia";
import { describe, expect, it } from "vitest";
import {
	CompileRequestSchema,
	DynamicQueryRequestSchema,
} from "./query-schemas";

const app = new Elysia()
	.post("/query", ({ body }) => body, {
		body: t.Union([
			DynamicQueryRequestSchema,
			t.Array(DynamicQueryRequestSchema),
		]),
	})
	.post("/compile", ({ body }) => body, { body: CompileRequestSchema });

function post(path: string, body: unknown) {
	return app.handle(
		new Request(`http://localhost${path}`, {
			body: JSON.stringify(body),
			headers: { "content-type": "application/json" },
			method: "POST",
		})
	);
}

const queryBody = {
	parameters: ["top_pages"],
	startDate: "2026-01-01",
	endDate: "2026-01-02",
};

const compileBody = {
	projectId: "test-website",
	type: "top_pages",
	from: "2026-01-01",
	to: "2026-01-02",
};

describe("query pagination schemas", () => {
	it.each([
		{ limit: 1.5 },
		{ page: 1.5 },
		{ limit: 1.5, page: 2.3 },
		{ limit: 0 },
		{ limit: 10_001 },
		{ page: 0 },
	])("rejects invalid dynamic-query pagination: %o", async (pagination) => {
		const response = await post("/query", { ...queryBody, ...pagination });

		expect(response.status).toBe(422);
	});

	it("rejects fractional pagination inside a query batch", async () => {
		const response = await post("/query", [
			queryBody,
			{ ...queryBody, page: 1.5 },
		]);

		expect(response.status).toBe(422);
	});

	it.each([
		{ limit: 1.5 },
		{ offset: 0.5 },
		{ limit: 0 },
		{ limit: 1001 },
		{ offset: -1 },
	])("rejects invalid compile pagination: %o", async (pagination) => {
		const response = await post("/compile", {
			...compileBody,
			...pagination,
		});

		expect(response.status).toBe(422);
	});

	it.each([
		{},
		{ limit: 1, page: 1 },
		{ limit: 10_000, page: 2 },
	])("accepts valid dynamic-query pagination: %o", async (pagination) => {
		const response = await post("/query", { ...queryBody, ...pagination });

		expect(response.status).toBe(200);
	});

	it.each([
		{},
		{ limit: 1, offset: 0 },
		{ limit: 1000, offset: 10 },
	])("accepts valid compile pagination: %o", async (pagination) => {
		const response = await post("/compile", {
			...compileBody,
			...pagination,
		});

		expect(response.status).toBe(200);
	});
});
