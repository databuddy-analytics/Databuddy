import { describe, expect, it } from "bun:test";
import { isMateriallyWorse } from "./persistence";

describe("isMateriallyWorse", () => {
	it("suppresses a candidate that matches the dismissed severity and magnitude", () => {
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

	it("stays suppressed just below the 1.5x threshold", () => {
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
