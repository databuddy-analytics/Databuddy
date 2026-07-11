import { describe, expect, it } from "bun:test";
import type { Insight } from "@/lib/insight-types";
import {
	collapseInsightsBySignal,
	insightSignalDedupeKey,
} from "./insight-signal-key";

function insight(overrides: Partial<Insight>): Insight {
	return {
		id: "insight-1",
		type: "page_trend",
		severity: "info",
		sentiment: "positive",
		priority: 5,
		websiteId: "website-1",
		websiteName: "Example",
		websiteDomain: "example.com",
		title: "Page traffic increased",
		description: "Traffic increased for this page.",
		suggestion: "Review the traffic source mix.",
		subjectKey: "path_pricing",
		link: "/websites/website-1",
		createdAt: "2026-07-10T10:00:00.000Z",
		...overrides,
	};
}

describe("insight signal keys", () => {
	it("includes the persisted subject key", () => {
		expect(
			insightSignalDedupeKey(insight({ subjectKey: "Path / Pricing" }))
		).toBe(
			"website-1|page_trend|up|path_pricing"
		);
	});

	it("keeps findings for different subjects", () => {
		const findings = collapseInsightsBySignal([
			insight({ id: "pricing", subjectKey: "path_pricing" }),
			insight({ id: "docs", subjectKey: "path_docs" }),
		]);

		expect(findings.map((finding) => finding.id)).toEqual(["pricing", "docs"]);
	});

	it("keeps only the newest finding for the same subject", () => {
		const findings = collapseInsightsBySignal([
			insight({ id: "older", createdAt: "2026-07-09T10:00:00.000Z" }),
			insight({ id: "newer", createdAt: "2026-07-10T10:00:00.000Z" }),
		]);

		expect(findings.map((finding) => finding.id)).toEqual(["newer"]);
	});
});
