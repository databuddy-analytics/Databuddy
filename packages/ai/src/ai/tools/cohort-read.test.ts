import { expect, spyOn, test } from "bun:test";
import { asSchema, type ToolExecutionOptions } from "ai";
import { analyticsCohortSchema } from "@databuddy/shared/analytics-filters";
import * as rpc from "./utils/rpc";
const { createFunnelTools } = await import("./funnels");
const { createGoalTools } = await import("./goals");
const options: ToolExecutionOptions = {
	toolCallId: "synthetic-cohort",
	messages: [],
	experimental_context: {
		websiteId: "synthetic-site",
		websiteDomain: "example.invalid",
	},
};
const cohort = {
	filters: [
		{
			field: "browser_name" as const,
			operator: "equals" as const,
			value: "Safari",
		},
	],
};
test("native cohort reaches the existing RPC procedure", async () => {
	const invoke = spyOn(rpc, "callRPCProcedure").mockResolvedValue({
		synthetic: true,
	});
	try {
		const dates = { startDate: "2026-08-22", endDate: "2026-08-28", cohort };
		const funnel = createFunnelTools().get_funnel_analytics;
		const goal = createGoalTools().get_goal_analytics;
		if (!funnel.execute || !goal.execute) throw new Error("Missing executor");
		await funnel.execute({ funnelId: "synthetic-funnel", ...dates }, options);
		await goal.execute({ goalId: "synthetic-goal", ...dates }, options);
		expect(
			invoke.mock.calls.map(([router, method, input]) => ({
				router,
				method,
				input,
			}))
		).toEqual([
			{
				router: "funnels",
				method: "getAnalytics",
				input: {
					funnelId: "synthetic-funnel",
					websiteId: "synthetic-site",
					...dates,
				},
			},
			{
				router: "goals",
				method: "getAnalytics",
				input: {
					goalId: "synthetic-goal",
					websiteId: "synthetic-site",
					...dates,
				},
			},
		]);
	} finally {
		invoke.mockRestore();
	}
});
test("cohort rejects tenant and step selectors", () => {
	for (const field of [
		"website_id",
		"client_id",
		"owner_id",
		"path",
		"event_name",
		"referrer",
		"browser_name OR 1=1",
	])
		expect(
			analyticsCohortSchema.safeParse({
				filters: [{ field, operator: "equals", value: "x" }],
			}).success
		).toBe(false);
	expect(
		analyticsCohortSchema.safeParse({
			filters: [{ ...cohort.filters[0], target: "event" }],
		}).success
	).toBe(false);
});
test("inaccessible website never reaches RPC", async () => {
	const tool = createFunnelTools().get_funnel_analytics;
	if (!tool.execute) throw new Error("Missing executor");
	const invoke = spyOn(rpc, "callRPCProcedure").mockResolvedValue({
		synthetic: true,
	});
	try {
		await expect(
			tool.execute(
				{
					funnelId: "synthetic-funnel",
					websiteId: "other-tenant",
					startDate: "2026-08-22",
					endDate: "2026-08-28",
					cohort,
				},
				options
			)
		).rejects.toThrow("not in this workspace");
		expect(invoke).not.toHaveBeenCalled();
	} finally {
		invoke.mockRestore();
	}
});
test("model JSON schema exposes the read capability", () => {
	const schema = asSchema(
		createFunnelTools().get_funnel_analytics.inputSchema
	).jsonSchema;
	expect(JSON.stringify(schema)).toContain('"browser_name"');
	expect(JSON.stringify(schema)).toContain('"cohort"');
});

test("model can explicitly request unfiltered analytics without inventing a cohort", async () => {
	const invoke = spyOn(rpc, "callRPCProcedure").mockResolvedValue({
		synthetic: true,
	});
	const dates = { startDate: "2026-08-22", endDate: "2026-08-28" };
	const funnelTools = createFunnelTools();
	try {
		for (const [definition, id] of [
			[funnelTools.get_funnel_analytics, { funnelId: "synthetic-funnel" }],
			[
				funnelTools.get_funnel_analytics_by_referrer,
				{ funnelId: "synthetic-funnel" },
			],
			[createGoalTools().get_goal_analytics, { goalId: "synthetic-goal" }],
		] as const) {
			const schema = asSchema(definition.inputSchema);
			// Strict model providers need an explicit empty alternative for objects.
			expect(JSON.stringify(schema.jsonSchema)).toContain('"type":"null"');
			for (const cohort of [null, undefined]) {
				const input = { ...id, ...dates, cohort };
				if (!schema.validate) throw new Error("Missing schema validator");
				expect((await schema.validate(input)).success).toBe(true);
			}
		}
		if (
			!funnelTools.get_funnel_analytics.execute ||
			!funnelTools.get_funnel_analytics_by_referrer.execute
		)
			throw new Error("Missing executor");
		const goal = createGoalTools().get_goal_analytics;
		if (!goal.execute) throw new Error("Missing executor");
		await funnelTools.get_funnel_analytics.execute(
			{ funnelId: "synthetic-funnel", ...dates, cohort: null },
			options
		);
		await funnelTools.get_funnel_analytics_by_referrer.execute(
			{ funnelId: "synthetic-funnel", ...dates, cohort: null },
			options
		);
		await goal.execute(
			{ goalId: "synthetic-goal", ...dates, cohort: null },
			options
		);
		expect(
			invoke.mock.calls.map(([router, method, input]) => ({
				router,
				method,
				input,
			}))
		).toEqual([
			{
				router: "funnels",
				method: "getAnalytics",
				input: {
					funnelId: "synthetic-funnel",
					websiteId: "synthetic-site",
					...dates,
					cohort: undefined,
				},
			},
			{
				router: "funnels",
				method: "getAnalyticsByReferrer",
				input: {
					funnelId: "synthetic-funnel",
					websiteId: "synthetic-site",
					...dates,
					cohort: undefined,
				},
			},
			{
				router: "goals",
				method: "getAnalytics",
				input: {
					goalId: "synthetic-goal",
					websiteId: "synthetic-site",
					...dates,
					cohort: undefined,
				},
			},
		]);
	} finally {
		invoke.mockRestore();
	}
});
