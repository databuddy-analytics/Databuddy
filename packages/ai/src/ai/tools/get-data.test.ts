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

async function executeData(input: unknown, toolOptions = options) {
	const schema = asSchema(getDataTool.inputSchema);
	if (!(schema.validate && getDataTool.execute)) {
		throw new Error("Missing data tool contract");
	}
	const parsed = await schema.validate(input);
	if (!parsed.success) {
		throw parsed.error;
	}
	return getDataTool.execute(parsed.value, toolOptions);
}

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
									orderBy: null,
									limit: null,
									timezone: null,
								},
							],
						}),
					},
				],
				finishReason: { unified: "tool-calls", raw: "tool_calls" },
				usage: {
					inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
					outputTokens: { total: 1, text: 1, reasoning: 0 },
				},
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
		const result = await executeData(
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
		expect(execute).toHaveBeenCalledTimes(1);
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
		const result = await executeData(request, options);
		expect(result).toMatchObject({
			results: {
				country: { error: expect.any(String), data: [] },
				traffic_sources: {
					from: request.queries[1]?.from,
					to: request.queries[1]?.to,
				},
			},
		});
		expect(execute).toHaveBeenCalledTimes(1);
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

	it("drops a stray groupBy so retention keeps its fixed cohorts", async () => {
		const query = mock<SimpleQueryBuilder["execute"]>(async () => [
			{ row_type: "overall" },
		]);
		spyOn(SimpleQueryBuilder.prototype, "execute").mockImplementation(function (
			this: SimpleQueryBuilder
		) {
			this.compile();
			return query();
		});
		const request = {
			queries: [
				{
					type: "identified_profile_retention",
					from: "2026-08-01",
					to: "2026-08-14",
					groupBy: ["namespace"],
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
		const validated = await schema.validate(request);
		if (!validated.success) {
			throw validated.error;
		}
		const result = await getDataTool.execute(validated.value, options);
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
		expect(query).toHaveBeenCalledTimes(1);
	});

	it("returns the measured scope and distinguishes a truncated result from its query row count", async () => {
		const execute = spyOn(
			SimpleQueryBuilder.prototype,
			"execute"
		).mockImplementation(function (this: SimpleQueryBuilder) {
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
		const result = await executeData(
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
		expect(execute).toHaveBeenCalledTimes(1);
	});

	it.each([
		{ limit: undefined, returnedRows: 20 },
		{ limit: 2, returnedRows: 2 },
	])("keeps the newest $returnedRows rows of a truncated time series", async ({
		limit,
		returnedRows,
	}) => {
		const rows = Array.from({ length: 30 }, (_, index) => ({
			date: `2026-08-${String(index + 1).padStart(2, "0")}`,
		}));
		const execute = spyOn(
			SimpleQueryBuilder.prototype,
			"execute"
		).mockResolvedValue(rows);
		const result = await executeData(
			{
				queries: [
					{
						type: "events_by_date",
						from: "2026-08-01",
						to: "2026-08-30",
						limit,
					},
				],
			},
			options
		);
		expect(result).toMatchObject({
			results: {
				events_by_date: {
					data: rows.slice(-returnedRows),
					returnedRows,
					rowCount: 30,
					truncated: true,
				},
			},
		});
		expect(execute).toHaveBeenCalledTimes(1);
	});

	it("offers website query types only", async () => {
		const schema = asSchema(getDataTool.inputSchema);
		if (!schema.validate) {
			throw new Error("Missing validator");
		}
		expect(
			(await schema.validate({ queries: [{ type: "link_total_clicks" }] }))
				.success
		).toBe(false);
		expect(
			(await schema.validate({ queries: [{ type: "outbound_links" }] })).success
		).toBe(true);
	});

	it.each([
		{
			query: { type: "summary_metrics", orderBy: "pageviews DESC" },
			error:
				"summary_metrics returns rows in a fixed order and does not support orderBy. Remove orderBy.",
		},
		{
			query: {
				type: "country",
				filters: [{ field: "path", op: "eq", value: ["/a", "/b"] }],
			},
			error:
				"Filter 'path' uses op 'eq' with a list of values. Use 'in' or 'not_in' for a list, or pass a single value.",
		},
		{
			query: { type: "revenue_overview", timeUnit: "day" },
			error: "revenue_overview does not take a timeUnit. Remove timeUnit.",
		},
	])("returns the planner error instead of querying: $error", async ({
		query,
		error,
	}) => {
		const execute = spyOn(
			SimpleQueryBuilder.prototype,
			"execute"
		).mockResolvedValue([]);
		expect(await executeData({ queries: [query] }, options)).toEqual({
			results: {
				[query.type]: {
					type: query.type,
					websiteId: "site-test",
					data: [],
					rowCount: 0,
					error,
				},
			},
		});
		expect(execute).not.toHaveBeenCalled();
	});
});
