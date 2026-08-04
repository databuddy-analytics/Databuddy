import { describe, expect, it } from "bun:test";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import {
	type DatabuddySetupConfiguration,
	type DatabuddySetupContextDependencies,
	loadDatabuddySetupContext,
	parseDatabuddySetupCoverage,
} from "./databuddy-setup-context";

const signal: InvestigationSignal = {
	changePercent: -20,
	entity: { id: "website-1", label: "Example website", type: "website" },
	metric: {
		current: 80,
		format: "number",
		label: "Visitors",
		previous: 100,
	},
	period: {
		current: { from: "2026-07-24", to: "2026-07-30" },
		previous: { from: "2026-07-17", to: "2026-07-23" },
	},
	severity: "warning",
	sentiment: "negative",
	signalKey: "visitors",
};

const coverageRow: Record<string, unknown> = {
	custom_event_types: 3,
	identified_profiles: 4,
	identified_sessions: 6,
	pageviews: 42,
	sessions_with_custom_events: 7,
	tracked_sessions: 12,
};

const configuration: DatabuddySetupConfiguration = {
	activeFlags: { boolean: 1, multivariant: 0, rollout: 2 },
	activeFunnels: 1,
	activeGoals: 2,
	inactiveFlags: 3,
	paddleConfigured: false,
	stripeConfigured: true,
	targetGroups: 1,
	websiteRevenueConfigPresent: true,
};

describe("Databuddy setup context", () => {
	it("parses private aggregate telemetry with same-window identity coverage", () => {
		expect(parseDatabuddySetupCoverage(coverageRow)).toEqual({
			customEvents: { eventTypes: 3, sessionsWithCustomEvents: 7 },
			identity: {
				coveragePercent: 50,
				identifiedProfiles: 4,
				identifiedSessions: 6,
				trackedSessions: 12,
			},
			traffic: { pageviews: 42, sessions: 12 },
		});
	});

	it("rejects impossible aggregate coverage instead of presenting it to the agent", () => {
		expect(() =>
			parseDatabuddySetupCoverage({
				...coverageRow,
				identified_sessions: 13,
			})
		).toThrow("Inconsistent Databuddy setup coverage result");
		expect(() =>
			parseDatabuddySetupCoverage({ ...coverageRow, pageviews: "unknown" })
		).toThrow("Invalid pageviews");
		expect(() =>
			parseDatabuddySetupCoverage({ ...coverageRow, pageviews: null })
		).toThrow("Invalid pageviews");
	});

	it("combines telemetry with aggregate configuration without exposing raw setup data", async () => {
		const query: NonNullable<DatabuddySetupContextDependencies["query"]> =
			async (request) => {
					expect(request).toMatchObject({
						from: "2026-07-24",
						projectId: "website-1",
						to: "2026-07-30",
					});
				return [coverageRow];
			};
		const context = await loadDatabuddySetupContext(
			{
				organizationId: "org-1",
				signal,
				timezone: "UTC",
				websiteId: "website-1",
			},
			{
				fetchConfiguration: async (input) => {
					expect(input).toEqual({
						organizationId: "org-1",
						websiteId: "website-1",
					});
					return configuration;
				},
				query,
			}
		);

		expect(context).toEqual({
			configurationState: "current",
			conversionMeasurement: { activeFunnels: 1, activeGoals: 2 },
			customEvents: { eventTypes: 3, sessionsWithCustomEvents: 7 },
			identity: {
				coveragePercent: 50,
				identifiedProfiles: 4,
				identifiedSessions: 6,
				trackedSessions: 12,
			},
			observedPeriod: signal.period.current,
			releases: {
				activeFlags: { boolean: 1, multivariant: 0, rollout: 2 },
				inactiveFlags: 3,
				targetGroups: 1,
			},
			revenue: {
				paddleConfigured: false,
				stripeConfigured: true,
				websiteConfigPresent: true,
			},
			traffic: { pageviews: 42, sessions: 12 },
		});
	});
});
