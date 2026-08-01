import { describe, expect, it } from "bun:test";
import type { InvestigationOutcome } from "@databuddy/shared/insights";
import { isInterruptingInvestigation } from "./persistence";

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

	it("does not treat omitted recommendations as interrupting", () => {
		expect(
			isInterruptingInvestigation({
				outcome: {
					...quietResolve,
					publish: true,
				},
			})
		).toBe(false);
	});
});
