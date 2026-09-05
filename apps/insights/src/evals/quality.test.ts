import "@databuddy/test/env";
import { expect, it } from "bun:test";
import type { InsightDefinitionEditChanges } from "@databuddy/shared/insights";
import { qualityCases } from "./quality";

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
