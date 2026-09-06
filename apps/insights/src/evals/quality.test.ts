import "@databuddy/test/env";
import { expect, it } from "bun:test";
import type { InsightDefinitionEditChanges } from "@databuddy/shared/insights";
import { qualityCases } from "./quality";

it.each([
	{ comparison: "There were 1,200 visits.", retained: false },
	{
		comparison: "New-user visits were unchanged across both weeks.",
		retained: true,
	},
	{
		comparison: "New-user visits remained 1,200 in both windows.",
		retained: true,
	},
	{
		comparison: "New-user visits held at 1,200 in both comparison weeks.",
		retained: true,
	},
	{ comparison: "Visits held at 1,200 this week.", retained: false },
	{ comparison: "Completions fell from 80 to 24.", retained: false },
])("scores the steady-arrival context rather than an exact count: $comparison", ({
	comparison,
	retained,
}) => {
	const fixture = qualityCases.find(
		(entry) => entry.id === "useful-signup-decline"
	);
	if (!fixture) throw new Error("Missing signup evaluation");
	const failures = fixture.check(
		{
			toolCallCount: 0,
			outcome: {
				title: "Completed account creation fell",
				summary: "Completed accounts fell from 80 to 24.",
				impact: comparison,
				rootCause: null,
				evidence: ["The completion emitter was unchanged."],
				findingKind: "product_outcome",
				publish: true,
				publicationBasis: "measured_impact",
				next: {
					type: "resolve",
					reason: "No inspected remedy is established.",
				},
			},
		},
		[]
	);
	expect(failures).toHaveLength(retained ? 0 : 1);
});

it.each([
	{ startDate: "2026-08-22", endDate: "2026-08-28", completed: 100 },
	{ startDate: "2026-08-29", endDate: "2026-09-04", completed: 20 },
	{ startDate: "2026-08-22", endDate: "2026-09-04", completed: 120 },
])("returns actual period aggregates instead of rejecting a pooled source query: $startDate–$endDate", async (window) => {
	const fixture = qualityCases.find(
		(entry) => entry.id === "signup-source-comparison"
	);
	const read = fixture?.tools.get_funnel_analytics_by_referrer;
	if (!read?.execute) throw new Error("Missing source comparison fixture");
	const output = await read.execute(
		{
			funnelId: "signup-journey",
			startDate: window.startDate,
			endDate: window.endDate,
		},
		{ toolCallId: "synthetic-read", messages: [] }
	);
	expect(output).toMatchObject({
		referrer_analytics: [
			{ referrer: "google.com", completed_users: window.completed },
			{ referrer: "direct" },
		],
	});
});

const steps: NonNullable<InsightDefinitionEditChanges["steps"]> = [
	{ name: "Landing", type: "PAGE_VIEW", target: "/start" },
	{
		name: "Account created",
		type: "EVENT",
		target: "account_completed",
		conditions: { plan: "paid" },
	},
];

function check(changes: InsightDefinitionEditChanges) {
	const fixture = qualityCases.find(
		(entry) => entry.id === "funnel-conditions-repair"
	);
	if (!fixture) {
		throw new Error("Missing funnel repair evaluation");
	}
	return fixture.check(
		{
			toolCallCount: 2,
			outcome: {
				title: "Account creation tracks a retired event",
				summary: "The final step uses the old completion event.",
				impact: "Completed journeys cannot be measured.",
				rootCause: "The handler emits a replacement completion event.",
				evidence: ["The inspected final step differs from the emitted event."],
				findingKind: "measurement_definition",
				publish: true,
				publicationBasis: "decision_safety",
				next: {
					type: "act",
					action: "Update the final event target.",
					target: "Account creation journey",
					verification: "Compare completed journeys with the emitted event.",
					execution: { operation: "edit", changes },
				},
			},
		},
		[]
	);
}

it("accepts equivalent omitted and empty step conditions in a valid repair", () => {
	expect(check({ steps })).toEqual([]);
	expect(
		check({
			steps: steps.map((step) => ({
				...step,
				conditions: step.conditions ?? {},
			})),
		})
	).toEqual([]);
});

it.each([
	"first step",
	"extra step",
	"filters",
])("does not score an unrelated %s change as a valid funnel repair", (variant) => {
	const changes: InsightDefinitionEditChanges = { steps };
	if (variant === "first step") {
		changes.steps = steps.map((step, index) =>
			index === 0 ? { ...step, target: "/different" } : step
		);
	}
	if (variant === "extra step") {
		changes.steps = [
			...steps,
			{ name: "Unrelated", target: "other_event", type: "EVENT" },
		];
	}
	if (variant === "filters") {
		changes.filters = [{ field: "country", operator: "equals", value: "US" }];
	}
	expect(check(changes)).toHaveLength(1);
});

it.each([
	{
		id: "available-repository-mechanism",
		name: "github_read_file",
		input: { path: "src/checkout.ts", ref: "abcdef1" },
	},
	{
		id: "reply-failed-recovery",
		name: "get_goal_analytics",
		input: {
			goalId: "workspace-goal",
			startDate: "2026-08-29",
			endDate: "2026-09-04",
		},
	},
	{
		id: "reply-verified-recovery",
		name: "get_goal_analytics",
		input: {
			goalId: "workspace-goal",
			startDate: "2026-08-29",
			endDate: "2026-09-04",
		},
	},
])("requires a successful exact read for $id", async (sample) => {
	const fixture = qualityCases.find((entry) => entry.id === sample.id);
	const read = fixture?.tools[sample.name];
	if (!(fixture && read?.execute)) throw new Error("Missing context fixture");
	const result = {
		toolCallCount: 1,
		outcome: {
			title: "Reviewed finding",
			summary: "A verified result.",
			impact: null,
			rootCause: "Inspected null access.",
			evidence: ["Measured result."],
			next:
				sample.name === "github_read_file"
					? {
							type: "act" as const,
							action: "Guard null access.",
							target: "Checkout",
							verification: "The path succeeds.",
						}
					: { type: "resolve" as const, reason: "Verification checked." },
		},
	};
	const output = await read.execute(sample.input, {
		toolCallId: "read",
		messages: [],
	});
	const call = { name: sample.name, input: sample.input, output };
	expect(fixture.check(result, [call])).toEqual([]);
	expect(
		fixture.check(result, [{ ...call, output: { error: "Unavailable" } }])
	).toHaveLength(1);
	expect(fixture.check(result, [{ ...call, output: undefined }])).toHaveLength(
		1
	);
	expect(fixture.check(result, [{ ...call, input: {} }])).toHaveLength(1);
});

it("keeps revenue currencies, gross totals and refunds separate for exact windows", async () => {
	const read = qualityCases.find(
		(entry) => entry.id === "revenue-currency-refunds"
	)?.tools.get_data;
	if (!read?.execute) throw new Error("Missing revenue fixture");
	const query = {
		type: "revenue_overview",
		websiteId: "synthetic-site",
		from: "2026-08-29",
		to: "2026-09-04",
	};
	const output = await read.execute(
		{ queries: [query, { ...query, from: "2026-08-22", to: "2026-08-28" }] },
		{ toolCallId: "revenue", messages: [] }
	);
	expect(output).toMatchObject({
		results: {
			"revenue_overview@synthetic-site#1": {
				from: query.from,
				to: query.to,
				data: [
					{ currency: "USD", total_revenue: 6000, refund_amount: 1200 },
					{ currency: "EUR", total_revenue: 5000, refund_amount: 0 },
				],
			},
			"revenue_overview@synthetic-site#2": {
				from: "2026-08-22",
				to: "2026-08-28",
				data: [
					{ currency: "USD", total_revenue: 10000, refund_amount: 200 },
					{ currency: "EUR", total_revenue: 5000, refund_amount: 0 },
				],
			},
		},
	});
	expect(() =>
		read.execute?.(
			{ queries: [{ ...query, websiteId: "another-site" }] },
			{ toolCallId: "wrong-site", messages: [] }
		)
	).toThrow();
});
