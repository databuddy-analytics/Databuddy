import { describe, expect, it } from "bun:test";
import type { InvestigationOutcome } from "@databuddy/shared/insights";
import { caseValues, isInterruptingInvestigation } from "./persistence";

const quietResolve: InvestigationOutcome = {
	evidence: ["The recommendation is informational."],
	impact: null,
	next: { reason: "No action is required.", type: "resolve" },
	publish: false,
	recommendation: null,
	rootCause: null,
	summary: "No noteworthy action is needed.",
	title: "Quiet resolve",
};

describe("isInterruptingInvestigation", () => {
	it("keeps published recommendations out of the case queue", () => {
		expect(
			isInterruptingInvestigation({
				outcome: {
					...quietResolve,
					publish: true,
					recommendation: {
						action: "Review a goal for completed signup.",
						changes: null,
						operation: null,
					},
				},
			})
		).toBe(false);
	});

	it("surfaces only outcomes that need action or an answer", () => {
		for (const type of ["act", "ask"] as const) {
			const next =
				type === "act"
					? {
							action: "Fix the checkout event.",
							target: "Checkout completed",
							type,
							verification: "Completed checkout is measured again.",
						}
					: { question: "Which repository owns checkout?", type };
			expect(
				isInterruptingInvestigation({
					outcome: { ...quietResolve, next, publish: true },
				})
			).toBe(true);
		}
	});

	it("keeps plain quiet resolves out of the feed", () => {
		expect(isInterruptingInvestigation({ outcome: quietResolve })).toBe(false);
	});
});

it.each([
	"passed",
	"failed",
	"inconclusive",
] as const)("does not label an unverified closure recovered: %s", (status) => {
	const values = caseValues(
		{
			outcome: {
				...quietResolve,
				verification: {
					check: {
						metric: "total_users_completed",
						startDate: "2026-07-01",
						endDate: "2026-07-07",
						minimumEntrants: 100,
						threshold: {
							anchor: "prior_baseline",
							comparison: "at_or_above",
							value: 100,
							evidenceRef: { source: "signal" },
						},
					},
					status,
					measured: 40,
					entrants: 200,
					source: null,
				},
			},
			signal: {
				signalKey: "goal:workspace",
				entity: { type: "goal", id: "workspace", label: "Workspace" },
				metric: {
					label: "Workspace",
					current: 40,
					previous: 100,
					format: "number",
				},
				changePercent: -60,
				severity: "warning",
				sentiment: "negative",
				period: {
					current: { from: "2026-07-01", to: "2026-07-07" },
					previous: { from: "2026-06-24", to: "2026-06-30" },
				},
			},
		},
		"UTC",
		new Date("2026-07-08T00:00:00Z")
	);
	expect(values.status).toBe("resolved");
	expect(values.resolvedReason).toBe(status === "passed" ? "recovered" : null);
	expect(values.resolvedAt?.toISOString()).toBe("2026-07-08T00:00:00.000Z");
});
