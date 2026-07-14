import { describe, expect, it } from "bun:test";
import type { Insight } from "@/lib/insight-types";
import { buildInsightAgentCopyText } from "./insight-meta";

function insight(remediationKind: Insight["remediationKind"]): Insight {
	return {
		changePercent: -100,
		description: "Signup completions fell to zero.",
		priority: 9,
		remediationKind,
		severity: "critical",
		sentiment: "negative",
		suggestion: "Did users still complete Signup?",
		title: "Signup needs context",
		type: "conversion_leak",
		websiteDomain: "example.com",
		websiteName: "Example",
	} as Insight;
}

describe("buildInsightAgentCopyText", () => {
	it("presents unresolved findings as an investigation", () => {
		const copy = buildInsightAgentCopyText(insight(null));

		expect(copy).toContain("continue the investigation");
		expect(copy).toContain("## Next question or step");
		expect(copy).not.toContain("implement the recommended fix");
	});

	it("uses fix language only for an evidence-backed remediation", () => {
		const copy = buildInsightAgentCopyText(insight("tracking"));

		expect(copy).toContain("implement the recommended fix");
		expect(copy).toContain("## Recommended fix");
	});
});
