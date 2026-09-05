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
