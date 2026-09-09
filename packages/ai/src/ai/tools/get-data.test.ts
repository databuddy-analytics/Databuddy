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

	it.each([
		{ groupBy: undefined },
		{ groupBy: [] },
		{ groupBy: ["namespace"] },
		{ groupBy: ["namespace", "profile_id"] },
	])("returns a native retention option error instead of mislabeling grouped data: %j", async ({
		groupBy,
	}) => {
		const query = vi.fn().mockResolvedValue([{ row_type: "overall" }]);
		vi.spyOn(SimpleQueryBuilder.prototype, "execute").mockImplementation(
			function () {
				// Exercise native request parsing and the real SQL compiler;
				// stub the rows returned after compilation.
				this.compile();
				return query();
			}
		);
		const request = {
			queries: [
				{
					type: "identified_profile_retention",
					from: "2026-08-01",
					to: "2026-08-14",
					groupBy,
					filters: [
						{
							field: "activation_event",
							op: "eq" as const,
							value: "activated",
						},
						{ field: "return_event", op: "eq" as const, value: "returned" },
						{ field: "horizon_days", op: "eq" as const, value: 7 },
						{
							field: "observation_end",
							op: "eq" as const,
							value: "2026-08-31",
						},
					],
				},
			],
		};
		const schema = asSchema(getDataTool.inputSchema);
		if (!(schema.validate && getDataTool.execute))
			throw new Error("Missing data tool contract");
		expect((await schema.validate(request)).success).toBe(true);
		const result = await getDataTool.execute(request, options);
		if (groupBy?.length) {
			expect(result).toEqual({
				results: {
					identified_profile_retention: {
						type: "identified_profile_retention",
						websiteId: "site-test",
						data: [],
						rowCount: 0,
						error:
							"Invalid retention options: fixed daily cohorts with overall row first; omit groupBy, orderBy and offset.",
					},
				},
			});
			expect(query).not.toHaveBeenCalled();
			return;
		}
		expect(result).toMatchObject({
			results: {
				identified_profile_retention: {
					data: [{ row_type: "overall" }],
					rowCount: 1,
					returnedRows: 1,
					truncated: false,
				},
			},
		});
		expect(JSON.stringify(result)).not.toContain("groupBy:");
		expect(query).toHaveBeenCalledOnce();
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
					timezone: "UTC",
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
