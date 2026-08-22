import { describe, expect, test } from "bun:test";
import { createFunnelTools } from "./funnels";
import { createGoalTools } from "./goals";

const analyticsRanges = [
	{ idField: "funnelId", schema: createFunnelTools().get_funnel_analytics.inputSchema },
	{
		idField: "funnelId",
		schema: createFunnelTools().get_funnel_analytics_by_referrer.inputSchema,
	},
	{ idField: "goalId", schema: createGoalTools().get_goal_analytics.inputSchema },
];

describe("agent tool date ranges", () => {
	test("rejects invalid, partial, and reversed analytics ranges", () => {
		for (const { idField, schema } of analyticsRanges) {
			for (const input of [
				{ [idField]: "definition-1", startDate: "2026-02-30", endDate: "2026-03-01" },
				{ [idField]: "definition-1", startDate: "2026-03-01" },
				{ [idField]: "definition-1", startDate: "2026-03-02", endDate: "2026-03-01" },
			]) {
				expect(schema.safeParse(input).success).toBe(false);
			}
		}
	});

});
