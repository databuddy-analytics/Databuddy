import { describe, expect, it } from "bun:test";
import {
	classifyRecurrence,
	isMateriallyWorse,
	type PriorInsightRow,
} from "./persistence";

describe("isMateriallyWorse", () => {
	it("keeps a matching severity and magnitude below the worsening threshold", () => {
		expect(
			isMateriallyWorse(
				{ severity: "warning", changePercent: -40 },
				{ severity: "warning", changePercent: -42 }
			)
		).toBe(false);
	});

	it("re-raises when severity escalates", () => {
		expect(
			isMateriallyWorse(
				{ severity: "critical", changePercent: -40 },
				{ severity: "warning", changePercent: -42 }
			)
		).toBe(true);
	});

	it("re-raises when magnitude grows past 1.5x", () => {
		expect(
			isMateriallyWorse(
				{ severity: "warning", changePercent: -75 },
				{ severity: "warning", changePercent: -40 }
			)
		).toBe(true);
	});

	it("stays below the worsening threshold just under 1.5x", () => {
		expect(
			isMateriallyWorse(
				{ severity: "warning", changePercent: -59 },
				{ severity: "warning", changePercent: -40 }
			)
		).toBe(false);
	});

	it("ignores magnitude when the dismissed baseline had none", () => {
		expect(
			isMateriallyWorse(
				{ severity: "warning", changePercent: -90 },
				{ severity: "warning", changePercent: null }
			)
		).toBe(false);
	});

	it("does not re-raise on a severity drop when magnitude is unchanged", () => {
		expect(
			isMateriallyWorse(
				{ severity: "info", changePercent: -40 },
				{ severity: "critical", changePercent: -40 }
			)
		).toBe(false);
	});

	it("re-raises on a magnitude jump even when severity drops", () => {
		expect(
			isMateriallyWorse(
				{ severity: "info", changePercent: -90 },
				{ severity: "critical", changePercent: -40 }
			)
		).toBe(true);
	});

	it("treats a missing candidate magnitude as not worse", () => {
		expect(
			isMateriallyWorse(
				{ severity: "warning", changePercent: undefined },
				{ severity: "warning", changePercent: -40 }
			)
		).toBe(false);
	});
});

describe("classifyRecurrence", () => {
	const cutoff = new Date("2026-07-05T00:00:00Z");

	function prior(overrides: Partial<PriorInsightRow>): PriorInsightRow {
		return {
			id: "prior-1",
			changePercent: -40,
			createdAt: new Date("2026-06-28T00:00:00Z"),
			runId: "run-1",
			severity: "warning",
			status: "open",
			...overrides,
		};
	}

	it("treats a first occurrence as new", () => {
		expect(
			classifyRecurrence(
				{ severity: "warning", changePercent: -40 },
				undefined,
				cutoff
			)
		).toEqual({ isEscalation: false, isNew: true, isPersistent: false });
	});

	it("treats recurrence of a resolved insight as new", () => {
		expect(
			classifyRecurrence(
				{ severity: "warning", changePercent: -40 },
				prior({ status: "resolved" }),
				cutoff
			)
		).toEqual({ isEscalation: false, isNew: true, isPersistent: false });
	});

	it("stays silent for an unchanged refresh inside the cooldown window", () => {
		expect(
			classifyRecurrence(
				{ severity: "warning", changePercent: -45 },
				prior({ createdAt: new Date("2026-07-05T03:00:00Z") }),
				cutoff
			)
		).toEqual({ isEscalation: false, isNew: false, isPersistent: false });
	});

	it("escalates material worsening inside the cooldown window", () => {
		expect(
			classifyRecurrence(
				{ severity: "critical", changePercent: -45 },
				prior({ createdAt: new Date("2026-07-05T03:00:00Z") }),
				cutoff
			)
		).toEqual({ isEscalation: true, isNew: false, isPersistent: false });
	});

	it("stays silent for a flat warning-level open recurrence", () => {
		expect(
			classifyRecurrence(
				{ severity: "warning", changePercent: -45 },
				prior({}),
				cutoff
			)
		).toEqual({ isEscalation: false, isNew: false, isPersistent: false });
	});

	it("keeps a flat but still-open critical as a persistent reminder", () => {
		expect(
			classifyRecurrence(
				{ severity: "critical", changePercent: -45 },
				prior({ severity: "critical", changePercent: -42 }),
				cutoff
			)
		).toEqual({ isEscalation: false, isNew: false, isPersistent: true });
	});

	it("escalates an open recurrence when severity rises", () => {
		expect(
			classifyRecurrence(
				{ severity: "critical", changePercent: -45 },
				prior({}),
				cutoff
			)
		).toEqual({ isEscalation: true, isNew: false, isPersistent: false });
	});

	it("escalates an open recurrence when magnitude grows past 1.5x", () => {
		expect(
			classifyRecurrence(
				{ severity: "warning", changePercent: -75 },
				prior({}),
				cutoff
			)
		).toEqual({ isEscalation: true, isNew: false, isPersistent: false });
	});
});
