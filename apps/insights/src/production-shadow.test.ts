import "@databuddy/test/env";
import { describe, expect, it } from "bun:test";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import type { DetectedSignal } from "./detection";
import {
	filterShadowSignals,
	matchesShadowSpecialist,
	parseShadowOptions,
	projectShadowCoverage,
	projectShadowFailure,
	resolveShadowAsOf,
	shadowCohortFingerprint,
} from "./production-shadow";
import { emptyInvestigationCoverage } from "./generation";

function detected(metric: string, subjectKey = metric): DetectedSignal {
	return {
		baseline: 100,
		current: 50,
		deltaPercent: -50,
		detectedAt: "2026-08-11",
		direction: "down",
		label: metric,
		method: "wow",
		metric,
		severity: "warning",
		subjectKey,
	};
}

function investigationSignal(
	signalKey: string,
	type: InvestigationSignal["entity"]["type"]
): InvestigationSignal {
	return {
		signalKey,
		entity: { id: signalKey, label: signalKey, type },
		metric: { current: 50, format: "number", label: signalKey, previous: 100 },
		changePercent: -50,
		period: {
			current: { from: "2026-08-04", to: "2026-08-10" },
			previous: { from: "2026-07-28", to: "2026-08-03" },
		},
		severity: "warning",
		sentiment: "negative",
	};
}

describe("resolveShadowAsOf", () => {
	it("preserves the existing calendar-day replay mode", () => {
		const referenceTime = new Date("2026-07-31T13:42:00.000Z");

		expect(
			resolveShadowAsOf(referenceTime, 0, "UTC", "day").toISOString()
		).toBe("2026-07-31T00:00:00.000Z");
	});
});

describe("shadow signal projection", () => {
	it("keeps a failed scan distinct from a completed no-signal scan", () => {
		const noSignals = projectShadowCoverage({
			coverage: emptyInvestigationCoverage("no_detected_signals"),
			failed: false,
			run: "site-01@d-0",
		});
		const failed = projectShadowCoverage({
			coverage: emptyInvestigationCoverage(),
			failed: true,
			run: "site-01@d-0",
		});

		expect(noSignals).toMatchObject({
			noSignalReason: "no_detected_signals",
			status: "completed",
		});
		expect(failed).toEqual({
			coverage: null,
			run: "site-01@d-0",
			status: "failed",
		});
		expect("detected" in failed).toBe(false);
	});
});

describe("shadow failure projection", () => {
	const options = parseShadowOptions([
		"--confirm-read-only-production",
		"--reference-time",
		"2026-08-11T00:00:00.000Z",
	]);

	it("does not carry arbitrary customer text into failure output", () => {
		const report = projectShadowFailure({
			error: new Error(
				"tenant customer-42 route /checkout?user=secret@example.com failed"
			),
			options,
			phase: "discovery",
		});

		expect(report.failure).toMatchObject({
			message:
				"Shadow stopped before completion; verify the read-only data-source configuration and retry.",
			phase: "discovery",
		});
		expect(JSON.stringify(report)).not.toContain("customer-42");
		expect(JSON.stringify(report)).not.toContain("secret@example.com");
	});
});

describe("shadow comparison metadata", () => {
	it("uses a keyed opaque fingerprint instead of emitting a cohort identity", () => {
		const first = shadowCohortFingerprint(["site-b", "site-a"], "test-key");

		expect(first).toHaveLength(24);
		expect(shadowCohortFingerprint(["site-a", "site-b"], "test-key")).toBe(
			first
		);
		expect(shadowCohortFingerprint(["site-a"], "test-key")).not.toBe(first);
		expect(shadowCohortFingerprint(["site-a"], undefined)).toBeNull();
		expect(first).not.toContain("site-a");
	});
});

describe("specialist shadow scope", () => {
	it("accepts every registered specialist option", () => {
		const args = [
			"--confirm-read-only-production",
			"--reference-time",
			"2026-08-11T00:00:00.000Z",
			"--specialist",
		];

		for (const specialist of ["funnel", "goal", "reliability", "general"]) {
			expect(parseShadowOptions([...args, specialist]).specialist).toBe(
				specialist
			);
		}
		expect(() =>
			parseShadowOptions([...args, "journey"])
		).toThrow("specialist must be one of funnel, goal, reliability, general");
	});

	it("keeps each specialist's detected and due work isolated", () => {
		const signals = [
			detected("funnel:checkout", "funnel:checkout:step:2"),
			detected("goal:signup"),
			detected("error_count", "route:error:/checkout"),
			detected("visitors"),
		];

		expect(filterShadowSignals(signals, "funnel")).toEqual([signals[0]]);
		expect(filterShadowSignals(signals, "goal")).toEqual([signals[1]]);
		expect(filterShadowSignals(signals, "reliability")).toEqual([signals[2]]);
		expect(filterShadowSignals(signals, "general")).toEqual([signals[3]]);
		expect(filterShadowSignals(signals, null)).toBe(signals);
		expect(
			matchesShadowSpecialist(
				investigationSignal("funnel:checkout:step:2", "funnel_step"),
				"funnel"
			)
		).toBe(true);
		expect(
			matchesShadowSpecialist(
				investigationSignal("goal:signup", "goal"),
				"goal"
			)
		).toBe(true);
		expect(
			matchesShadowSpecialist(
				investigationSignal("route:error:/checkout", "page"),
				"reliability"
			)
		).toBe(true);
		expect(
			matchesShadowSpecialist(
				investigationSignal("visitors", "website"),
				"general"
			)
		).toBe(true);
		expect(
			matchesShadowSpecialist(
				investigationSignal("goal:signup", "goal"),
				"funnel"
			)
		).toBe(false);
	});
});
