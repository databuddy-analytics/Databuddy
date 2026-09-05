import { afterEach, describe, expect, it, vi } from "vitest";
import { asSchema } from "ai";
import { SimpleQueryBuilder } from "../../query/simple-builder";
import { discoverQueryTypesTool } from "./discover-query-types";
import { getDataTool } from "./get-data";

const options = {
	toolCallId: "query-contract-test",
	messages: [],
	experimental_context: {
		currentDateTime: "2026-09-05T00:00:00Z",
		websiteId: "site-test",
		websiteDomain: "example.com",
		timezone: "UTC",
	},
};

afterEach(() => vi.restoreAllMocks());

describe("analytics tool contract", () => {
	it.each([
		{ target: "event" },
		{ having: false },
	])("rejects unsupported filter scope instead of silently stripping it: %o", async (scope) => {
		const schema = asSchema(getDataTool.inputSchema);
		if (!schema.validate) throw new Error("Missing tool schema validator");
		const result = await schema.validate({
			queries: [
				{
					type: "custom_events_by_path",
					filters: [
						{
							field: "event_name",
							op: "eq",
							value: "activation_completed",
							...scope,
						},
					],
				},
			],
		});
		expect(result.success).toBe(false);
	});

	it("exposes the exact continuation selector contract before the model queries", async () => {
		if (!discoverQueryTypesTool.execute)
			throw new Error("Missing discovery tool");
		const result = await discoverQueryTypesTool.execute(
			{ search: "error_route_continuation_comparison" },
			options
		);
		expect(result).toMatchObject({
			types: [
				{
					name: "error_route_continuation_comparison",
					requiredAnyFilter: ["message", "path"],
					allowedFilterOperators: { message: ["eq"], path: ["eq"] },
				},
			],
		});
	});

	it("returns the measured scope and distinguishes a truncated result from its query row count", async () => {
		const execute = vi
			.spyOn(SimpleQueryBuilder.prototype, "execute")
			.mockImplementation(function () {
				const compiled = this.compile();
				expect(compiled.params).toMatchObject({ f0: "activation_completed" });
				expect(compiled.sql).toContain("event_name = {f0:String}");
				return Promise.resolve(
					Array.from({ length: 25 }, (_, index) => ({
						name: `/step-${index}`,
						total_events: 1,
					}))
				);
			});
		if (!getDataTool.execute) throw new Error("Missing data tool");
		const result = await getDataTool.execute(
			{
				queries: [
					{
						type: "custom_events_by_path",
						from: "2026-08-29",
						to: "2026-09-04",
						filters: [
							{ field: "event_name", op: "eq", value: "activation_completed" },
						],
					},
				],
			},
			options
		);
		expect(result).toMatchObject({
			results: {
				custom_events_by_path: {
					websiteId: "site-test",
					from: "2026-08-29",
					to: "2026-09-04",
					filters: [
						{ field: "event_name", op: "eq", value: "activation_completed" },
					],
					returnedRows: 20,
					rowCount: 25,
					truncated: true,
				},
			},
		});
		expect(execute).toHaveBeenCalledOnce();
	});
});
