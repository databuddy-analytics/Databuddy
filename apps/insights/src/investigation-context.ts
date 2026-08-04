import type {
	InsightDatabuddySetupRecommendation,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import {
	errorCustomerImpactEvidence,
	errorIdentitySetupRecommendation,
	type ErrorCustomerImpact,
	loadErrorCustomerImpact,
} from "./error-customer-impact";
import {
	errorCohortBehaviorEvidence,
	type ErrorCohortBehavior,
	loadErrorCohortBehavior,
} from "./error-cohort-behavior";
import {
	errorCohortGoalCompletionEvidence,
	type ErrorCohortGoalCompletion,
	loadErrorCohortGoalCompletion,
} from "./error-cohort-goal-completion";
import {
	type DatabuddySetupContext,
	loadDatabuddySetupContext,
} from "./databuddy-setup-context";
import {
	type VitalCohortBehavior,
	loadVitalCohortBehavior,
	vitalCohortBehaviorEvidence,
} from "./vital-cohort-behavior";

export interface InvestigationContext {
	customerImpact: ErrorCustomerImpact | null;
	databuddySetup: DatabuddySetupContext | null;
	errorBehavior: ErrorCohortBehavior | null;
	errorBehaviorEvidenceIndex: number | null;
	errorGoalCompletion: ErrorCohortGoalCompletion | null;
	errorGoalCompletionEvidenceIndex: number | null;
	evidence: string[];
	setupRecommendationCandidate: InsightDatabuddySetupRecommendation | null;
	vitalBehavior: VitalCohortBehavior | null;
	vitalBehaviorEvidenceIndex: number | null;
}

interface BuildInvestigationContextParams {
	abortSignal?: AbortSignal;
	evidence: string[];
	organizationId: string;
	signal: InvestigationSignal;
	timezone: string;
	websiteId: string;
}

interface BuildInvestigationContextDependencies {
	loadCohortBehavior?: typeof loadErrorCohortBehavior;
	loadCustomerImpact?: typeof loadErrorCustomerImpact;
	loadDatabuddySetup?: typeof loadDatabuddySetupContext;
	loadGoalCompletion?: typeof loadErrorCohortGoalCompletion;
	loadVitalCohortBehavior?: typeof loadVitalCohortBehavior;
	reportCohortBehaviorError?: (error: unknown) => Promise<void> | void;
	reportCustomerImpactError?: (error: unknown) => Promise<void> | void;
	reportDatabuddySetupError?: (error: unknown) => Promise<void> | void;
	reportGoalCompletionError?: (error: unknown) => Promise<void> | void;
	reportVitalCohortBehaviorError?: (error: unknown) => Promise<void> | void;
}

/**
 * Adds optional, aggregate-only context to one freshly measured investigation.
 * Each enrichment is independent: unavailable setup context must never
 * suppress an otherwise valid turn or its existing evidence.
 */
export async function buildInvestigationContext(
	params: BuildInvestigationContextParams,
	dependencies: BuildInvestigationContextDependencies = {}
): Promise<InvestigationContext> {
	const loadCohortBehavior =
		dependencies.loadCohortBehavior ?? loadErrorCohortBehavior;
	const loadCustomerImpact =
		dependencies.loadCustomerImpact ?? loadErrorCustomerImpact;
	const loadDatabuddySetup =
		dependencies.loadDatabuddySetup ?? loadDatabuddySetupContext;
	const loadGoalCompletion =
		dependencies.loadGoalCompletion ?? loadErrorCohortGoalCompletion;
	const loadVitalBehavior =
		dependencies.loadVitalCohortBehavior ?? loadVitalCohortBehavior;
	const enrichmentParams = {
		abortSignal: params.abortSignal,
		organizationId: params.organizationId,
		signal: params.signal,
		timezone: params.timezone,
		websiteId: params.websiteId,
	};
	const [
		customerImpactResult,
		cohortBehaviorResult,
		databuddySetupResult,
		goalCompletionResult,
		vitalBehaviorResult,
	] = await Promise.allSettled([
		loadCustomerImpact(enrichmentParams),
		loadCohortBehavior(enrichmentParams),
		loadDatabuddySetup(enrichmentParams),
		loadGoalCompletion(enrichmentParams),
		loadVitalBehavior(enrichmentParams),
	]);
	const customerImpact =
		customerImpactResult.status === "fulfilled"
			? customerImpactResult.value
			: null;
	const errorBehavior =
		cohortBehaviorResult.status === "fulfilled"
			? cohortBehaviorResult.value
			: null;
	const databuddySetup =
		databuddySetupResult.status === "fulfilled"
			? databuddySetupResult.value
			: null;
	const errorGoalCompletion =
		goalCompletionResult.status === "fulfilled"
			? goalCompletionResult.value
			: null;
	let vitalBehavior =
		vitalBehaviorResult.status === "fulfilled"
			? vitalBehaviorResult.value
			: null;
	if (customerImpactResult.status === "rejected") {
		try {
			await dependencies.reportCustomerImpactError?.(
				customerImpactResult.reason
			);
		} catch {
			// Optional enrichment reporting must not block the investigation.
		}
	}
	if (cohortBehaviorResult.status === "rejected") {
		try {
			await dependencies.reportCohortBehaviorError?.(
				cohortBehaviorResult.reason
			);
		} catch {
			// Optional enrichment reporting must not block the investigation.
		}
	}
	if (databuddySetupResult.status === "rejected") {
		try {
			await dependencies.reportDatabuddySetupError?.(
				databuddySetupResult.reason
			);
		} catch {
			// Optional enrichment reporting must not block the investigation.
		}
	}
	if (goalCompletionResult.status === "rejected") {
		try {
			await dependencies.reportGoalCompletionError?.(
				goalCompletionResult.reason
			);
		} catch {
			// Optional enrichment reporting must not block the investigation.
		}
	}
	if (vitalBehaviorResult.status === "rejected") {
		try {
			await dependencies.reportVitalCohortBehaviorError?.(
				vitalBehaviorResult.reason
			);
		} catch {
			// Optional enrichment reporting must not block the investigation.
		}
	}

	const evidence = [...params.evidence];
	if (customerImpact) {
		const impactEvidence = errorCustomerImpactEvidence(customerImpact);
		if (!evidence.includes(impactEvidence)) {
			evidence.push(impactEvidence);
		}
	}
	let errorBehaviorEvidenceIndex: number | null = null;
	if (errorBehavior) {
		const behaviorEvidence = errorCohortBehaviorEvidence(errorBehavior);
		if (!evidence.includes(behaviorEvidence)) {
			evidence.push(behaviorEvidence);
		}
		errorBehaviorEvidenceIndex = evidence.indexOf(behaviorEvidence);
	}
	let errorGoalCompletionEvidenceIndex: number | null = null;
	if (errorGoalCompletion) {
		const completionEvidence = errorCohortGoalCompletionEvidence(
			errorGoalCompletion,
			params.signal
		);
		if (!evidence.includes(completionEvidence)) {
			evidence.push(completionEvidence);
		}
		errorGoalCompletionEvidenceIndex = evidence.indexOf(completionEvidence);
	}
	let vitalBehaviorEvidenceIndex: number | null = null;
	if (vitalBehavior) {
		try {
			const behaviorEvidence = vitalCohortBehaviorEvidence(
				vitalBehavior,
				params.signal
			);
			if (!evidence.includes(behaviorEvidence)) {
				evidence.push(behaviorEvidence);
			}
			vitalBehaviorEvidenceIndex = evidence.indexOf(behaviorEvidence);
		} catch (error) {
			vitalBehavior = null;
			try {
				await dependencies.reportVitalCohortBehaviorError?.(error);
			} catch {
				// Optional enrichment reporting must not block the investigation.
			}
		}
	}

	return {
		customerImpact,
		databuddySetup,
		errorBehavior,
		errorBehaviorEvidenceIndex,
		errorGoalCompletion,
		errorGoalCompletionEvidenceIndex,
		evidence,
		setupRecommendationCandidate: customerImpact
			? errorIdentitySetupRecommendation(customerImpact)
			: null,
		vitalBehavior,
		vitalBehaviorEvidenceIndex,
	};
}
