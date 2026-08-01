import { describe, expect, it } from "bun:test";
import type { InvestigationOutcome } from "@databuddy/shared/insights";
import { isVisibleInvestigation } from "./persistence";

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

describe("isVisibleInvestigation", () => {
	it("surfaces published resolve recommendations", () => {
		expect(
			isVisibleInvestigation({
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
		).toBe(true);
	});

	it("keeps plain quiet resolves out of the feed", () => {
		expect(isVisibleInvestigation({ outcome: quietResolve })).toBe(false);
	});
});
