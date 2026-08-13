import { describe, expect, it } from "bun:test";
import {
	classifyFirstReviewRun,
	firstReviewReadiness,
	firstReviewStatus,
} from "./insight-generation";

const NOW = new Date("2026-08-15T12:00:00.000Z");

function readiness(
	overrides: Partial<Parameters<typeof firstReviewReadiness>[0]> = {}
) {
	return firstReviewReadiness({
		activeOrganizationRunId: null,
		activeWebsiteRunId: null,
		activity: {
			activeDays: 0,
			firstScreenViewAt: null,
			pageviews: 0,
			sessions: 0,
		},
		canRun: true,
		latestRun: null,
		now: NOW,
		...overrides,
	});
}

describe("first-review readiness", () => {
	it("asks for tracking when a site has never recorded a screen view", () => {
		expect(readiness()).toMatchObject({
			baselineReadyAt: null,
			state: "needs_tracking",
		});
	});

	it("does not offer a review when historical tracking has gone quiet", () => {
		expect(
			readiness({
				activity: {
					activeDays: 0,
					firstScreenViewAt: new Date("2026-07-01T00:00:00.000Z"),
					pageviews: 0,
					sessions: 0,
				},
			})
		).toMatchObject({ state: "needs_tracking" });
	});

	it("keeps trend review honest while the first two completed weeks accrue", () => {
		const result = readiness({
			activity: {
				activeDays: 4,
				firstScreenViewAt: new Date("2026-08-11T08:00:00.000Z"),
				pageviews: 72,
				sessions: 40,
			},
		});

		expect(result).toMatchObject({
			baselineReadyAt: "2026-08-25T08:00:00.000Z",
			state: "collecting_baseline",
		});
	});

	it("makes a site reviewable after two completed seven-day windows", () => {
		expect(
			readiness({
				activity: {
					activeDays: 12,
					firstScreenViewAt: new Date("2026-07-31T00:00:00.000Z"),
					pageviews: 430,
					sessions: 191,
				},
			})
		).toMatchObject({ state: "ready" });
	});

	it("does not call another website's active run this site's review", () => {
		expect(
			readiness({
				activeOrganizationRunId: "run-for-another-site",
				activity: {
					activeDays: 12,
					firstScreenViewAt: new Date("2026-07-31T00:00:00.000Z"),
					pageviews: 430,
					sessions: 191,
				},
			})
		).toMatchObject({ state: "waiting_for_organization_run" });
	});

	it("shows an active site run instead of a prior terminal result", () => {
		const latestRun = {
			id: "prior-run",
			insightCount: 0,
			state: "needs_credits" as const,
		};

		expect(
			readiness({
				activeOrganizationRunId: "active-run",
				activeWebsiteRunId: "active-run",
				latestRun,
			})
		).toMatchObject({ latestRun, state: "running" });
		expect(
			firstReviewStatus({
				activeOrganizationRunId: "active-run",
				activeWebsiteRunId: "active-run",
				canRun: true,
				latestRun,
			})
		).toMatchObject({
			activeOrganizationRunId: "active-run",
			latestRun,
			state: "running",
		});
	});

	it("keeps a prior terminal result when a different site is running", () => {
		const latestRun = {
			id: "prior-run",
			insightCount: 0,
			state: "needs_credits" as const,
		};

		expect(
			readiness({
				activeOrganizationRunId: "other-site-run",
				activeWebsiteRunId: null,
				latestRun,
			})
		).toMatchObject({ latestRun, state: "needs_credits" });
		expect(
			firstReviewStatus({
				activeOrganizationRunId: "other-site-run",
				activeWebsiteRunId: null,
				canRun: true,
				latestRun,
			})
		).toMatchObject({
			activeOrganizationRunId: "other-site-run",
			latestRun,
			state: "needs_credits",
		});
	});

	it("keeps a structured deferred skip out of reviewed", () => {
		const state = classifyFirstReviewRun({
			candidatePlan: {
				asOf: "2026-08-15T12:00:00.000Z",
				candidates: [],
				emptyStatus: "deferred",
				reason: "manual",
			},
			status: "skipped",
		});

		expect(state).toBe("deferred");
		expect(
			readiness({
				latestRun: { id: "run-deferred", insightCount: 0, state },
			})
		).toMatchObject({ state: "deferred" });
	});

	it("keeps a completed no-finding review distinct from a deferred skip", () => {
		const state = classifyFirstReviewRun({
			candidatePlan: {
				asOf: "2026-08-15T12:00:00.000Z",
				candidates: [],
				emptyStatus: "no_signals",
				reason: "manual",
			},
			status: "skipped",
		});

		expect(state).toBe("no_findings");
		expect(
			readiness({
				latestRun: { id: "run-no-findings", insightCount: 0, state },
			})
		).toMatchObject({
			latestRun: { insightCount: 0, state: "no_findings" },
			state: "no_findings",
		});
	});

	it("reports credits only for a skipped run with frozen unfinished work", () => {
		const state = classifyFirstReviewRun({
			candidatePlan: {
				asOf: "2026-08-15T12:00:00.000Z",
				candidates: [{ signal: { signalKey: "error:example" } }],
				reason: "manual",
			},
			status: "skipped",
		});

		expect(state).toBe("needs_credits");
		expect(
			readiness({
				latestRun: { id: "run-no-credits", insightCount: 0, state },
			})
		).toMatchObject({ state: "needs_credits" });
	});

	it("maps a failed run to needs attention rather than reviewed", () => {
		const state = classifyFirstReviewRun({
			candidatePlan: null,
			status: "failed",
		});

		expect(state).toBe("failed");
		expect(
			readiness({
				latestRun: { id: "run-failed", insightCount: 0, state },
			})
		).toMatchObject({ state: "needs_attention" });
	});

	it("provides a status-only path while another organization run is active", () => {
		expect(
			firstReviewStatus({
				activeOrganizationRunId: "other-site-run",
				activeWebsiteRunId: null,
				canRun: false,
				latestRun: null,
			})
		).toEqual({
			activeOrganizationRunId: "other-site-run",
			canRun: false,
			latestRun: null,
			state: "waiting_for_organization_run",
		});
	});

	it("preserves the run capability independently of readiness state", () => {
		expect(readiness({ canRun: false })).toMatchObject({
			canRun: false,
			state: "needs_tracking",
		});
	});
});
