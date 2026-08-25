import type { InvestigationSignal } from "@databuddy/shared/insights";
import type { DetectedSignal } from "./detection";

export type InsightSpecialistId = "funnel" | "goal" | "reliability" | "general";
export type InsightPortfolioFamily = InsightSpecialistId;
type InsightReadToolName =
	| "discover_query_types"
	| "get_data"
	| "get_funnel_analytics"
	| "get_funnel_analytics_by_referrer"
	| "get_goal_analytics"
	| "github_commit_diff"
	| "github_commits"
	| "github_deploys"
	| "github_pull_request"
	| "github_pull_requests"
	| "github_read_file"
	| "github_search_code"
	| "list_funnels"
	| "scrape_page"
	| "search_console";

export interface InsightSpecialistProfile {
	additionalReadTools: readonly InsightReadToolName[];
	id: InsightSpecialistId;
	instructions: string | null;
	matchesDetectedSignal(signal: DetectedSignal): boolean;
	matchesInvestigationSignal(signal: InvestigationSignal): boolean;
	portfolioFamily: InsightPortfolioFamily;
	/** A dedicated investigator may replace the broad read set with this scope. */
	readTools?: readonly InsightReadToolName[];
}

const FUNNEL_INSTRUCTIONS = `You are the Funnel Investigator. Own one named funnel or funnel step, or the verified absence of funnel coverage—not a generic analytics summary or goal review.

For an existing funnel, establish its exact steps and filters, entrants and completions, and the largest measured drop-off. For missing coverage, inspect routes and events to identify the narrowest ordered journey the evidence establishes; route visitors are only an entry cohort, and unobserved downstream stages are not funnel steps. Treat a non-empty saved description or supplied \`Business meaning:\` as the funnel's purpose. For unchanged zero completion, assess the preceding-step cohort before treating it as a product decision.`;

const GOAL_INSTRUCTIONS = `You are the goal specialist. Review the named goal as a product outcome, not a naming or configuration task.

Inspect its actual behavior, relevant route or event behavior, exits or engagement, and only the cohorts, errors, vitals, revenue, or identity context that can change the product decision. An uncovered event is observed telemetry, not proof of a business conversion.`;

const RELIABILITY_INSTRUCTIONS = `You are the reliability specialist. Establish the exact failing or slow surface, its measured reach, and the closest directly measured consequence.

Inspect the affected route, error or vital trend, and relevant session behavior. Use source, configuration, or deploy evidence only when it can establish a concrete repair mechanism.`;

const isFunnelDetectedSignal = (signal: DetectedSignal) =>
	signal.metric.startsWith("funnel:") ||
	(signal.metric === "measurement_coverage" &&
		signal.subjectKey === "measurement:conversion-coverage");

const isFunnelInvestigationSignal = (signal: InvestigationSignal) =>
	signal.entity.type === "funnel" ||
	signal.entity.type === "funnel_step" ||
	signal.signalKey.startsWith("funnel:") ||
	signal.signalKey === "measurement:conversion-coverage";

const isGoalDetectedSignal = (signal: DetectedSignal) =>
	signal.metric.startsWith("goal:") ||
	signal.subjectKey?.startsWith("measurement:uncovered-event:") === true;

const isGoalInvestigationSignal = (signal: InvestigationSignal) =>
	signal.entity.type === "goal" ||
	signal.signalKey.startsWith("goal:") ||
	signal.signalKey.startsWith("measurement:uncovered-event:");

const isReliabilityMetric = (metric: string) =>
	metric === "error_count" || metric === "lcp" || metric === "inp";

const isReliabilityDetectedSignal = (signal: DetectedSignal) =>
	isReliabilityMetric(signal.metric) ||
	signal.subjectKey?.startsWith("route:error:") === true ||
	signal.subjectKey?.startsWith("route:lcp:") === true ||
	signal.subjectKey?.startsWith("route:inp:") === true;

const isReliabilityInvestigationSignal = (signal: InvestigationSignal) =>
	signal.entity.type === "error" ||
	signal.entity.type === "vital" ||
	signal.signalKey.startsWith("route:error:") ||
	signal.signalKey.startsWith("route:lcp:") ||
	signal.signalKey.startsWith("route:inp:");

const generalSpecialist: InsightSpecialistProfile = {
	additionalReadTools: [],
	id: "general",
	instructions: null,
	matchesDetectedSignal: () => true,
	matchesInvestigationSignal: () => true,
	portfolioFamily: "general",
};

export const insightSpecialists: readonly InsightSpecialistProfile[] = [
	{
		additionalReadTools: [],
		id: "funnel",
		instructions: FUNNEL_INSTRUCTIONS,
		matchesDetectedSignal: isFunnelDetectedSignal,
		matchesInvestigationSignal: isFunnelInvestigationSignal,
		portfolioFamily: "funnel",
		readTools: [
			"discover_query_types",
			"get_data",
			"get_funnel_analytics",
			"get_funnel_analytics_by_referrer",
			"list_funnels",
			"scrape_page",
		],
	},
	{
		additionalReadTools: ["discover_query_types", "get_goal_analytics"],
		id: "goal",
		instructions: GOAL_INSTRUCTIONS,
		matchesDetectedSignal: isGoalDetectedSignal,
		matchesInvestigationSignal: isGoalInvestigationSignal,
		portfolioFamily: "goal",
	},
	{
		additionalReadTools: ["discover_query_types"],
		id: "reliability",
		instructions: RELIABILITY_INSTRUCTIONS,
		matchesDetectedSignal: isReliabilityDetectedSignal,
		matchesInvestigationSignal: isReliabilityInvestigationSignal,
		portfolioFamily: "reliability",
	},
	generalSpecialist,
];

export function resolveInsightSpecialist(
	signal: InvestigationSignal
): InsightSpecialistProfile {
	return (
		insightSpecialists.find((profile) =>
			profile.matchesInvestigationSignal(signal)
		) ?? generalSpecialist
	);
}

export function portfolioFamilyForDetectedSignal(
	signal: DetectedSignal
): InsightPortfolioFamily {
	return (
		insightSpecialists.find((profile) => profile.matchesDetectedSignal(signal))
			?.portfolioFamily ?? "general"
	);
}
