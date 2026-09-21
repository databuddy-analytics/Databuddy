import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { asSchema, generateText } from "ai";
import { MockLanguageModelV3 } from "ai/test";
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

afterEach(() => mock.restore());

describe("analytics tool contract", () => {
	it("accepts strict-provider null fields through the native SDK and resolves the default", async () => {
		spyOn(SimpleQueryBuilder.prototype, "execute").mockResolvedValue([]);
		const model = new MockLanguageModelV3({
			doGenerate: async () => ({
				content: [
					{
						type: "tool-call",
						toolCallId: "native-null-inputs",
						toolName: "get_data",
						input: JSON.stringify({
							queries: [
								{
									type: "country",
									websiteId: null,
									from: null,
									to: null,
									preset: null,
									timeUnit: null,
									filters: null,
									groupBy: null,
									orderBy: null,
									limit: null,
									timezone: null,
								},
							],
						}),
					},
				],
				finishReason: { unified: "tool-calls", raw: "tool_calls" },
				usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
				warnings: [],
			}),
		});
		const result = await generateText({
			model,
			prompt: "Show countries",
			tools: { get_data: getDataTool },
			experimental_context: options.experimental_context,
		});
		expect(result.toolResults[0]?.output).toMatchObject({
			results: {
				country: {
					from: "2026-08-07",
					to: "2026-09-05",
					timezone: "UTC",
					websiteId: "site-test",
				},
			},
		});
	});

	it.each([
		{ preset: undefined, from: "2026-08-06" },
		{ preset: "last_30d" as const, from: "2026-08-06" },
		{ preset: "last_7d" as const, from: "2026-08-29" },
	])("resolves $preset as inclusive calendar dates using the conversation clock/timezone", async ({
		preset,
		from,
	}) => {
		const execute = spyOn(
			SimpleQueryBuilder.prototype,
			"execute"
		).mockResolvedValue([]);
		if (!getDataTool.execute) {
			throw new Error("Missing data tool");
		}
		const result = await getDataTool.execute(
			{ queries: [{ type: "country", preset }] },
			{
				...options,
				experimental_context: {
					...options.experimental_context,
					timezone: "America/Los_Angeles",
				},
			}
		);
		expect(result).toMatchObject({
			results: {
				country: {
					from,
					to: "2026-09-04",
					timezone: "America/Los_Angeles",
					definition: expect.stringContaining("empty locations are excluded"),
				},
			},
		});
		expect(execute).toHaveBeenCalledOnce();
	});

	it("keeps timestamp ranges and isolates invalid timezones from other batch queries", async () => {
		const execute = spyOn(
			SimpleQueryBuilder.prototype,
			"execute"
		).mockResolvedValue([]);
		const schema = asSchema(getDataTool.inputSchema);
		if (!(schema.validate && getDataTool.execute)) {
			throw new Error("Missing data tool");
		}
		const request = {
			queries: [
				{ type: "country", timezone: "not/a-timezone" },
				{
					type: "traffic_sources",
					from: "2026-08-01 12:00:00Z",
					to: "2026-08-01T13:00:00.000Z",
				},
			],
		};
		expect((await schema.validate(request)).success).toBe(true);
		expect(
			(
				await schema.validate({
					queries: [
						{ type: "country", from: "2026-08-01T12:00:00Z", to: "2026-08-01" },
					],
				})
			).success
		).toBe(true);
		const result = await getDataTool.execute(request, options);
		expect(result).toMatchObject({
			results: {
				country: { error: expect.any(String), data: [] },
				traffic_sources: {
					from: request.queries[1]?.from,
					to: request.queries[1]?.to,
				},
			},
		});
		expect(execute).toHaveBeenCalledOnce();
	});

	it.each([
		{ from: "2026-08-01" },
		{ to: "2026-08-31" },
		{ from: "2026-08-31", to: "2026-08-01" },
		{ from: "2026-08-01", to: "2026-08-31", preset: "last_30d" },
	])("rejects invalid explicit dates instead of replacing them with defaults: %j", async (dates) => {
		const schema = asSchema(getDataTool.inputSchema);
		if (!schema.validate) {
			throw new Error("Missing validator");
		}
		expect(
			(await schema.validate({ queries: [{ type: "country", ...dates }] }))
				.success
		).toBe(false);
	});

	it.each([
		{ target: "event" },
		{ having: false },
	])("rejects unsupported filter scope instead of silently stripping it: %o", async (scope) => {
		const schema = asSchema(getDataTool.inputSchema);
		if (!schema.validate) {
			throw new Error("Missing tool schema validator");
		}
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
		if (!discoverQueryTypesTool.execute) {
			throw new Error("Missing discovery tool");
		}
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
		const query = mock().mockResolvedValue([{ row_type: "overall" }]);
		spyOn(SimpleQueryBuilder.prototype, "execute").mockImplementation(
			function () {
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
		if (!(schema.validate && getDataTool.execute)) {
			throw new Error("Missing data tool contract");
		}
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
		const execute = spyOn(
			SimpleQueryBuilder.prototype,
			"execute"
		).mockImplementation(function () {
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
		if (!getDataTool.execute) {
			throw new Error("Missing data tool");
		}
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
