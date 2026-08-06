import { describe, expect, it } from "bun:test";
import type { InvestigationSignal } from "@databuddy/shared/insights";
import {
	type DatabuddySetupContext,
} from "./databuddy-setup-context";
import {
	errorCustomerImpactEvidence,
	type ErrorCustomerImpact,
} from "./error-customer-impact";
import {
	errorCohortBehaviorEvidence,
	type ErrorCohortBehavior,
} from "./error-cohort-behavior";
import {
	errorCohortGoalCompletionEvidence,
	type ErrorCohortGoalCompletion,
} from "./error-cohort-goal-completion";
import { buildInvestigationContext } from "./investigation-context";
import type { VitalCohortBehavior } from "./vital-cohort-behavior";

const errorSignal: InvestigationSignal = {
	changePercent: 56.5,
	entity: {
		id: "manifest-failure",
		label: "Manifest loading failure",
		type: "error",
	},
	metric: {
		current: 36,
		format: "number",
		label: "Manifest loading failure",
		previous: 23,
	},
	period: {
		current: { from: "2026-07-24", to: "2026-07-30" },
		previous: { from: "2026-07-17", to: "2026-07-23" },
	},
	severity: "warning",
	sentiment: "negative",
	signalKey: "error:manifest-failure",
};

const customerImpact: ErrorCustomerImpact = {
	affectedSessions: 12,
	affectedVisitorIdentifiers: 10,
	ambiguousProfileSessions: 0,
	errorOccurrences: 12,
	identifiedProfiles: 0,
	identifiedProfilesWithPriorAttributedCompletedPayment: 0,
	identityCoveragePercent: 0,
	linkedVisitorIdentifiers: 0,
	paymentMatchIsLowerBound: true,
	qualifyingProfilePaymentHistoryObserved: false,
	scope: "fingerprint",
	sessionsWithLaterTelemetry: 0,
	unlinkedVisitorIdentifiers: 10,
};

const errorBehavior: ErrorCohortBehavior = {
	affectedNextPagePercent: 10,
	comparisonNextPagePercent: 60,
	eligibleErrorSessions: 12,
	matchedCoveragePercent: 100,
	matchedErrorSessions: 12,
	matchedPeerSessionObservations: 48,
	matchedStrata: 1,
};

const errorGoalCompletion: ErrorCohortGoalCompletion = {
	affectedCompletionPercent: 8.8,
	affectedCompletionSessions: 3,
	comparisonCompletionPercent: 45,
	eligibleErrorSessions: 40,
	matchedCoveragePercent: 85,
	matchedErrorSessions: 34,
	matchedPeerSessionObservations: 380,
	matchedStrata: 4,
};

const vitalBehavior: VitalCohortBehavior = {
	comparisonNextPagePercent: 55,
	eligibleSlowSessions: 40,
	matchedCoveragePercent: 85,
	matchedPeerSessionObservations: 380,
	matchedSlowSessions: 34,
	matchedStrata: 4,
	metric: "LCP",
	slowNextPagePercent: 20,
};

const vitalSignal: InvestigationSignal = {
	changePercent: 56.5,
	entity: { id: "/explore", label: "Route /explore", type: "page" },
	metric: {
		current: 3600,
		format: "duration_ms",
		label: "Largest Contentful Paint on /explore",
		previous: 2300,
	},
	period: {
		current: { from: "2026-07-24", to: "2026-07-30" },
		previous: { from: "2026-07-17", to: "2026-07-23" },
	},
	severity: "warning",
	sentiment: "negative",
	signalKey: "route:lcp:/explore",
};

const databuddySetup: DatabuddySetupContext = {
	configurationState: "current",
	conversionMeasurement: { activeFunnels: 0, activeGoals: 0 },
	customEvents: { eventTypes: 2, sessionsWithCustomEvents: 8 },
	identity: {
		coveragePercent: 25,
		identifiedProfiles: 2,
		identifiedSessions: 3,
		trackedSessions: 12,
	},
	observedPeriod: { from: "2026-07-24", to: "2026-07-30" },
	releases: {
		activeFlags: { boolean: 1, multivariant: 0, rollout: 0 },
		inactiveFlags: 0,
		targetGroups: 0,
	},
	revenue: {
		paddleConfigured: false,
		stripeConfigured: false,
		websiteConfigPresent: false,
	},
	traffic: { pageviews: 36, sessions: 12 },
};

const params = {
	evidence: ["Manifest loading failure rose from 23 to 36 occurrences."],
	organizationId: "org-1",
	signal: errorSignal,
	timezone: "UTC",
	websiteId: "website-1",
};

describe("buildInvestigationContext", () => {
	it("adds independent aggregate setup context without turning it into evidence", async () => {
		const context = await buildInvestigationContext(params, {
			loadCohortBehavior: async (input) => {
				expect(input.signal.period.current).toEqual({
					from: "2026-07-24",
					to: "2026-07-30",
				});
				return errorBehavior;
			},
			loadCustomerImpact: async () => customerImpact,
			loadDatabuddySetup: async (input) => {
				expect(input.organizationId).toBe("org-1");
				return databuddySetup;
			},
			loadGoalCompletion: async () => errorGoalCompletion,
		});

		expect(context).toEqual({
			customerImpact,
			databuddySetup,
			errorBehavior,
			errorBehaviorEvidenceIndex: 2,
			errorGoalCompletion,
			errorGoalCompletionEvidenceIndex: 3,
			evidence: [
				"Manifest loading failure rose from 23 to 36 occurrences.",
				errorCustomerImpactEvidence(customerImpact),
				errorCohortBehaviorEvidence(errorBehavior),
				errorCohortGoalCompletionEvidence(errorGoalCompletion, errorSignal),
			],
			setupRecommendationCandidate: {
				action:
					"Verify or add Databuddy identify() after authentication so future errors can be tied to signed-in users.",
				feature: "user_identification",
				kind: "databuddy_setup",
			},
			vitalBehavior: null,
			vitalBehaviorEvidenceIndex: null,
		});
	});

	it("keeps a non-enriched investigation usable", async () => {
		const context = await buildInvestigationContext(params, {
			loadCohortBehavior: async () => null,
			loadCustomerImpact: async () => null,
			loadDatabuddySetup: async () => null,
			loadGoalCompletion: async () => null,
		});

		expect(context).toEqual({
			customerImpact: null,
			databuddySetup: null,
			errorBehavior: null,
			errorBehaviorEvidenceIndex: null,
			errorGoalCompletion: null,
			errorGoalCompletionEvidenceIndex: null,
			evidence: params.evidence,
			setupRecommendationCandidate: null,
			vitalBehavior: null,
			vitalBehaviorEvidenceIndex: null,
		});
		expect(context.evidence).not.toBe(params.evidence);
	});

	it("soft-fails setup context without suppressing other enrichment", async () => {
		const errors: unknown[] = [];
		const context = await buildInvestigationContext(params, {
			loadCohortBehavior: async () => errorBehavior,
			loadCustomerImpact: async () => customerImpact,
			loadDatabuddySetup: async () => {
				throw new Error("Setup snapshot unavailable");
			},
			loadGoalCompletion: async () => null,
			reportDatabuddySetupError: (error) => {
				errors.push(error);
			},
		});

		expect(context.databuddySetup).toBeNull();
		expect(context.customerImpact).toEqual(customerImpact);
		expect(context.errorBehavior).toEqual(errorBehavior);
		expect(context.errorBehaviorEvidenceIndex).toBe(2);
		expect(context.errorGoalCompletion).toBeNull();
		expect(context.errorGoalCompletionEvidenceIndex).toBeNull();
		expect(context.vitalBehavior).toBeNull();
		expect(context.vitalBehaviorEvidenceIndex).toBeNull();
		expect(context.evidence).toEqual([
			...params.evidence,
			errorCustomerImpactEvidence(customerImpact),
			errorCohortBehaviorEvidence(errorBehavior),
		]);
		expect(errors).toHaveLength(1);
	});

	it("soft-fails configured completion without suppressing the error cohort", async () => {
		const errors: unknown[] = [];
		const context = await buildInvestigationContext(params, {
			loadCohortBehavior: async () => errorBehavior,
			loadCustomerImpact: async () => null,
			loadDatabuddySetup: async () => null,
			loadGoalCompletion: async () => {
				throw new Error("Configured goal lookup unavailable");
			},
			reportGoalCompletionError: (error) => {
				errors.push(error);
			},
		});

		expect(context.errorGoalCompletion).toBeNull();
		expect(context.errorGoalCompletionEvidenceIndex).toBeNull();
		expect(context.vitalBehavior).toBeNull();
		expect(context.vitalBehaviorEvidenceIndex).toBeNull();
		expect(context.errorBehavior).toEqual(errorBehavior);
		expect(context.evidence).toEqual([
			...params.evidence,
			errorCohortBehaviorEvidence(errorBehavior),
		]);
		expect(errors).toHaveLength(1);
	});

	it("does not duplicate current impact evidence", async () => {
		const impactEvidence = errorCustomerImpactEvidence(customerImpact);
		const context = await buildInvestigationContext(
			{ ...params, evidence: [...params.evidence, impactEvidence] },
			{
				loadCohortBehavior: async () => null,
				loadCustomerImpact: async () => customerImpact,
				loadDatabuddySetup: async () => null,
				loadGoalCompletion: async () => null,
			}
		);

		expect(context.evidence).toEqual([...params.evidence, impactEvidence]);
	});

	it("adds only a valid vital comparison and soft-fails malformed optional behavior", async () => {
		const context = await buildInvestigationContext(
			{
				...params,
				evidence: ["The route vital changed."],
				signal: vitalSignal,
			},
			{
				loadCohortBehavior: async () => null,
				loadCustomerImpact: async () => null,
				loadDatabuddySetup: async () => null,
				loadGoalCompletion: async () => null,
				loadVitalCohortBehavior: async () => vitalBehavior,
			}
		);

		expect(context.vitalBehavior).toEqual(vitalBehavior);
		expect(context.vitalBehaviorEvidenceIndex).toBe(1);
		expect(context.evidence[1]).toContain(
			"reached another tracked page in 30 minutes"
		);

		const errors: unknown[] = [];
		const malformed = await buildInvestigationContext(
			{
				...params,
				signal: vitalSignal,
			},
			{
				loadCohortBehavior: async () => null,
				loadCustomerImpact: async () => null,
				loadDatabuddySetup: async () => null,
				loadGoalCompletion: async () => null,
				loadVitalCohortBehavior: async () => ({
					...vitalBehavior,
					metric: "INP",
				}),
				reportVitalCohortBehaviorError: (error) => {
					errors.push(error);
				},
			}
		);
		expect(malformed.vitalBehavior).toBeNull();
		expect(malformed.vitalBehaviorEvidenceIndex).toBeNull();
		expect(malformed.evidence).toEqual(params.evidence);
		expect(errors).toHaveLength(1);
	});
});
