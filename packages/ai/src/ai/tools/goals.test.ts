import { expect, mock, test } from "bun:test";
import { asSchema, type Tool, type ToolExecutionOptions } from "ai";
import type { AppContext } from "../config/context";
import type { callRPCProcedure } from "./utils/rpc";

const current = { id: "goal-1", name: "Checkout", isActive: true };
const invoke = mock<typeof callRPCProcedure>(async () => current);
mock.module("./utils/rpc", () => ({ callRPCProcedure: invoke }));

const { createGoalTools } = await import("./goals");
const { createFunnelTools } = await import("./funnels");

test.each([
	undefined,
	false,
	true,
])("goal updates preview until confirmed, apply requested fields, and skip empty updates (confirmed=%s)", async (confirmed) => {
	const definition = createGoalTools().update_goal;
	const schema = asSchema(definition.inputSchema);
	const context: AppContext = {
		chatId: "goal-update",
		currentDateTime: "2026-09-05T00:00:00Z",
		timezone: "UTC",
		mutationMode: "allow",
	};
	const options: ToolExecutionOptions = {
		toolCallId: "goal-update",
		messages: [],
		experimental_context: context,
	};
	if (!(schema.validate && definition.execute)) {
		throw new Error("Missing goal tool validator or executor");
	}

	invoke.mockClear();
	const parsed = await schema.validate({
		id: current.id,
		isActive: false,
		confirmed,
	});
	if (!parsed.success) {
		throw parsed.error;
	}
	const result = await definition.execute(parsed.value, options);
	if (confirmed) {
		expect(result).toMatchObject({ success: true, goal: current });
		expect(invoke.mock.calls).toEqual([
			["goals", "update", { id: current.id, isActive: false }, context],
		]);
	} else {
		expect(result).toMatchObject({
			preview: true,
			confirmationRequired: true,
			current,
			updates: { isActive: false },
		});
		expect(invoke.mock.calls).toEqual([
			["goals", "getById", { id: current.id }, context],
		]);
	}

	invoke.mockClear();
	const emptyInput = await schema.validate({
		id: current.id,
		name: undefined,
		confirmed,
	});
	if (!emptyInput.success) {
		throw emptyInput.error;
	}
	const emptyResult = await definition.execute(emptyInput.value, options);
	expect(emptyResult).toMatchObject({
		preview: true,
		message: "No changes detected. The goal will remain unchanged.",
		confirmationRequired: false,
		current,
		updates: {},
	});
	expect(invoke.mock.calls).toEqual([
		["goals", "getById", { id: current.id }, context],
	]);
});

test("goal and funnel analytics share the conversation date default and preserve explicit ranges", async () => {
	const context: AppContext = {
		chatId: "analytics-defaults",
		currentDateTime: "2026-09-05T00:00:00Z",
		timezone: "America/Los_Angeles",
		websiteId: "site-test",
	};
	const options: ToolExecutionOptions = {
		toolCallId: "analytics-defaults",
		messages: [],
		experimental_context: context,
	};
	async function checkDateRanges<Input, Output>(
		definition: Tool<Input, Output>,
		input: Input,
		router: string,
		procedure: string
	) {
		for (const dates of [
			{},
			{ startDate: "2026-07-01", endDate: "2026-07-31" },
		]) {
			invoke.mockClear();
			const schema = asSchema(definition.inputSchema);
			if (!(schema.validate && definition.execute)) {
				throw new Error("Missing analytics tool");
			}
			const parsed = await schema.validate({ ...input, ...dates });
			if (!parsed.success) {
				throw parsed.error;
			}
			await definition.execute(parsed.value, options);
			expect(invoke.mock.calls[0]).toEqual([
				router,
				procedure,
				{
					...input,
					websiteId: "site-test",
					cohort: undefined,
					startDate: dates.startDate ?? "2026-08-06",
					endDate: dates.endDate ?? "2026-09-04",
				},
				context,
			]);
		}
	}
	await checkDateRanges(
		createGoalTools().get_goal_analytics,
		{ goalId: "goal-1" },
		"goals",
		"getAnalytics"
	);
	const funnels = createFunnelTools();
	await checkDateRanges(
		funnels.get_funnel_analytics,
		{ funnelId: "funnel-1" },
		"funnels",
		"getAnalytics"
	);
	await checkDateRanges(
		funnels.get_funnel_analytics_by_referrer,
		{ funnelId: "funnel-1" },
		"funnels",
		"getAnalyticsByReferrer"
	);
});
