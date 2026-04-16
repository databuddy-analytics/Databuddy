import { describe, expect, it } from "bun:test";
import { deriveInsightSubjectKey, insightDedupeKey } from "./dedupe";
import type { InsightDedupeInput } from "./dedupe";

describe("deriveInsightSubjectKey", () => {
	it("normalizes subjectKey (lowercase, strip non-alnum, trim)", () => {
		expect(
			deriveInsightSubjectKey({
				subjectKey: "  Google Organic  ",
				type: "traffic",
			})
		).toBe("google_organic");
	});

	it("falls back to title when subjectKey is empty", () => {
		expect(
			deriveInsightSubjectKey({
				subjectKey: "",
				title: "Bounce Rate Spike",
				type: "engagement",
			})
		).toBe("bounce_rate_spike");
	});

	it("falls back to type when both are empty", () => {
		expect(
			deriveInsightSubjectKey({
				subjectKey: null,
				title: null,
				type: "performance",
			})
		).toBe("performance");
	});

	it("truncates to 80 chars", () => {
		const long = "a".repeat(100);
		expect(deriveInsightSubjectKey({ subjectKey: long, type: "t" }).length).toBe(
			80
		);
	});

	it("strips leading/trailing underscores after normalization", () => {
		expect(
			deriveInsightSubjectKey({
				subjectKey: "---hello---",
				type: "t",
			})
		).toBe("hello");
	});
});

describe("insightDedupeKey", () => {
	const base: InsightDedupeInput = {
		websiteId: "site-1",
		type: "traffic",
		sentiment: "positive",
		changePercent: 15,
		subjectKey: "google",
	};

	it("produces websiteId|type|direction|subjectKey format", () => {
		expect(insightDedupeKey(base)).toBe("site-1|traffic|up|google");
	});

	it("uses down for negative changePercent", () => {
		expect(insightDedupeKey({ ...base, changePercent: -10 })).toBe(
			"site-1|traffic|down|google"
		);
	});

	it("uses sentiment when changePercent is 0", () => {
		expect(
			insightDedupeKey({ ...base, changePercent: 0, sentiment: "negative" })
		).toBe("site-1|traffic|down|google");
	});

	it("uses sentiment when changePercent is null", () => {
		expect(
			insightDedupeKey({ ...base, changePercent: null, sentiment: "positive" })
		).toBe("site-1|traffic|up|google");
	});

	it("uses flat for neutral sentiment and no change", () => {
		expect(
			insightDedupeKey({
				...base,
				changePercent: null,
				sentiment: "neutral",
			})
		).toBe("site-1|traffic|flat|google");
	});

	it("falls back subjectKey through title to type", () => {
		expect(
			insightDedupeKey({
				websiteId: "s",
				type: "error",
				sentiment: "negative",
				changePercent: -5,
				subjectKey: null,
				title: "404 errors rising",
			})
		).toBe("s|error|down|404_errors_rising");
	});
});
