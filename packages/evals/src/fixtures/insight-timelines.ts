import type {
	InvestigateWebsiteInput,
	InvestigationSources,
	WebsiteInvestigationArtifact,
} from "../../../../apps/insights/src/generation";
import {
	detectSignals,
	type QueryFn,
} from "../../../../apps/insights/src/detection";
import {
	detectFunnelGoalSignals,
	type FunnelConversion,
	type FunnelDef,
	type FunnelGoalDeps,
	type GoalConversion,
	type GoalDef,
	type PeriodRange,
} from "../../../../apps/insights/src/funnel-detection";
import type { LatestInsightObservation } from "../../../../apps/insights/src/observations";
import type {
	GeneratedInsight,
	InvestigationDecision,
	InvestigationEvidence,
	InvestigationSignal,
} from "@databuddy/shared/insights";

export type InsightLifecycle =
	| "detected"
	| "persists"
	| "worsened"
	| "recovered"
	| "none";

export interface InsightStageExpectation {
	artifact?: {
		decision: InvestigationDecision["disposition"] | null;
		detectedSignals: Array<{
			direction: "down" | "up";
			metric: string;
			severity: "critical" | "info" | "warning";
		}>;
		detectionComplete: boolean;
		evidence: Array<{
			queryType: string;
			status: InvestigationEvidence["status"];
		}>;
		insight: null | {
			sentiment: "negative" | "neutral" | "positive";
			severity: "critical" | "info" | "warning";
			subjectKey: string;
			type: string;
		};
		signal: null | {
			entityType: InvestigationSignal["entity"]["type"];
			kind: InvestigationSignal["kind"];
			metric: string;
			severity: "critical" | "info" | "warning";
		};
		status: WebsiteInvestigationArtifact["status"];
	};
	disposition?: InvestigationDecision["disposition"] | null;
	expectedError?: string;
	lifecycle: InsightLifecycle;
	status?: WebsiteInvestigationArtifact["status"];
}

export interface InsightTimelineStage {
	asOf: string;
	expect: InsightStageExpectation;
	id: string;
	input: InvestigateWebsiteInput;
	sources: (
		observations: ReadonlyMap<string, LatestInsightObservation>
	) => InvestigationSources;
}

export interface InsightTimeline {
	id: string;
	name: string;
	stages: InsightTimelineStage[];
}

interface SummaryRow extends Record<string, unknown> {
	bounce_rate: number;
	median_session_duration: number;
	pageviews: number;
	sessions: number;
	unique_visitors: number;
}

interface ErrorRow extends Record<string, unknown> {
	affectedUsers: number;
	totalErrors: number;
}

interface VitalRow extends Record<string, unknown> {
	metric_name: "INP" | "LCP";
	p75: number;
	samples: number;
}

interface MetricFrame {
	errors?: { current: ErrorRow; previous: ErrorRow };
	failQueries?: string[];
	hasData?: boolean;
	revenue?: { current: number; previous: number };
	summary?: { current: SummaryRow; previous: SummaryRow };
	vitals?: { current: VitalRow[]; previous: VitalRow[] };
}

interface DefinitionFrame {
	confirmationsByDefinition?: Record<string, number>;
	funnels?: Array<{
		current: FunnelConversion;
		definition: FunnelDef;
		previous: FunnelConversion;
	}>;
	goals?: Array<{
		current: GoalConversion;
		definition: GoalDef;
		previous: GoalConversion;
	}>;
}

interface StageFrame {
	annotations?: Array<{ date: string; signalScoped: boolean; title: string }>;
	definitions?: DefinitionFrame;
	metrics?: MetricFrame;
}

interface StageOptions {
	asOf: string;
	expect: InsightStageExpectation;
	frame: StageFrame;
	id: string;
	timelineId: string;
}

const ORGANIZATION_ID = "fixture-organization";
const DOMAIN = "example.com";
const TIMEZONE = "UTC";

const QUIET_SUMMARY: SummaryRow = {
	bounce_rate: 40,
	median_session_duration: 90,
	pageviews: 2400,
	sessions: 1400,
	unique_visitors: 1000,
};

const QUIET_ERRORS: ErrorRow = { affectedUsers: 0, totalErrors: 0 };

const QUIET_VITALS: VitalRow[] = [
	{ metric_name: "LCP", p75: 1800, samples: 200 },
	{ metric_name: "INP", p75: 140, samples: 200 },
];

const GOAL: GoalDef = {
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	filters: null,
	id: "signup",
	name: "Signup",
	target: "sign_up",
	type: "EVENT",
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const FUNNEL: FunnelDef = {
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	filters: null,
	id: "checkout",
	name: "Checkout",
	steps: [
		{ name: "Cart", target: "/cart", type: "PAGE_VIEW" },
		{ name: "Purchase", target: "purchase", type: "EVENT" },
	],
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function addDays(value: string, days: number): string {
	const date = new Date(`${value}T00:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

function periods(asOf: string) {
	return {
		current: { from: addDays(asOf, -7), to: addDays(asOf, -1) },
		previous: { from: addDays(asOf, -14), to: addDays(asOf, -8) },
	};
}

function periodValue<T>(
	range: Pick<PeriodRange, "from" | "to">,
	asOf: string,
	values: { current: T; previous: T }
): T {
	const expected = periods(asOf);
	if (
		range.from === expected.current.from &&
		range.to === expected.current.to
	) {
		return values.current;
	}
	if (
		range.from === expected.previous.from &&
		range.to === expected.previous.to
	) {
		return values.previous;
	}
	throw new Error(`Unexpected synthetic period: ${range.from} to ${range.to}`);
}

function metricQuery(frame: MetricFrame, asOf: string): QueryFn {
	const failed = new Set(frame.failQueries ?? []);
	const summary = frame.summary ?? {
		current: QUIET_SUMMARY,
		previous: QUIET_SUMMARY,
	};
	const errors = frame.errors ?? {
		current: QUIET_ERRORS,
		previous: QUIET_ERRORS,
	};
	const revenue = frame.revenue ?? { current: 0, previous: 0 };
	const vitals = frame.vitals ?? {
		current: QUIET_VITALS,
		previous: QUIET_VITALS,
	};

	return (request) => {
		if (failed.has(request.type)) {
			return Promise.reject(new Error(`Synthetic ${request.type} failure`));
		}
		if (request.type === "events_by_date") {
			return Promise.resolve([]);
		}
		if (request.type === "summary_metrics") {
			return Promise.resolve([periodValue(request, asOf, summary)]);
		}
		if (request.type === "error_summary") {
			return Promise.resolve([periodValue(request, asOf, errors)]);
		}
		if (request.type === "revenue_overview") {
			return Promise.resolve([
				{
					total_revenue: periodValue(request, asOf, revenue),
				},
			]);
		}
		if (request.type === "vitals_overview") {
			return Promise.resolve(periodValue(request, asOf, vitals));
		}
		return Promise.reject(
			new Error(`Unexpected synthetic query: ${request.type}`)
		);
	};
}

function definitionDeps(frame: DefinitionFrame, asOf: string): FunnelGoalDeps {
	const funnels = new Map(
		(frame.funnels ?? []).map((item) => [item.definition.id, item])
	);
	const goals = new Map(
		(frame.goals ?? []).map((item) => [item.definition.id, item])
	);
	return {
		confirmCompletion: (request) => {
			const key = `${request.definitionType}:${request.definitionId}`;
			const count = frame.confirmationsByDefinition?.[key] ?? 0;
			return Promise.resolve(
				count > 0
					? { count, source: "revenue_transactions" as const }
					: undefined
			);
		},
		fetchFunnels: () =>
			Promise.resolve([...funnels.values()].map((item) => item.definition)),
		fetchGoals: () =>
			Promise.resolve([...goals.values()].map((item) => item.definition)),
		funnelConversion: (definition, range) => {
			const fixture = funnels.get(definition.id);
			if (!fixture) {
				return Promise.reject(
					new Error(`Unknown synthetic funnel: ${definition.id}`)
				);
			}
			return Promise.resolve(periodValue(range, asOf, fixture));
		},
		goalConversion: (definition, range) => {
			const fixture = goals.get(definition.id);
			if (!fixture) {
				return Promise.reject(
					new Error(`Unknown synthetic goal: ${definition.id}`)
				);
			}
			return Promise.resolve(periodValue(range, asOf, fixture));
		},
	};
}

function fixtureResult(
	signal: InvestigationSignal,
	evidence: InvestigationEvidence[]
): {
	decision: InvestigationDecision;
	insight: GeneratedInsight | null;
} {
	const usable = evidence.filter(
		(item) => item.status === "ok" || item.status === "truncated"
	);
	const firstEvidence = usable[0];
	if (!firstEvidence) {
		throw new Error("Synthetic agent is missing usable evidence");
	}
	const planned = usable.find(
		(item) => item.queryType === "annotations:planned_signal"
	);
	if (planned) {
		return { decision: { disposition: "not_a_problem" }, insight: null };
	}
	const repair = signal.expectation?.confirmation
		? usable.find((item) => item.remediation)
		: undefined;
	const decision: InvestigationDecision = repair?.remediation
		? {
				disposition: "action_ready",
				remediation: {
					evidenceId: repair.evidenceId,
					instruction: repair.remediation.instruction,
					kind: repair.remediation.kind,
				},
			}
		: { disposition: "needs_context" };
	const primary = repair ?? firstEvidence;
	const suggestion =
		repair?.remediation?.instruction ??
		"What external change explains this regression?";
	const source = primary.source === "sql" ? "web" : primary.source;
	return {
		decision,
		insight: {
			title: `${signal.entity.label} needs attention`,
			description: "The measured regression needs attention.",
			suggestion,
			metrics: [signal.metric],
			severity: signal.severity,
			sentiment: signal.sentiment,
			priority: signal.priority,
			...(signal.changePercent === null
				? {}
				: { changePercent: signal.changePercent }),
			type: signal.insightType,
			subjectKey: signal.signalKey,
			sources: [source],
			confidence: 0.8,
			evidence: [{ type: "metric", description: primary.summary }],
			...(repair?.remediation
				? { remediationKind: repair.remediation.kind }
				: {}),
		},
	};
}

function createSources(
	frame: StageFrame,
	asOf: string,
	observations: ReadonlyMap<string, LatestInsightObservation>
): InvestigationSources {
	const metricFrame = frame.metrics ?? {};
	const query = metricQuery(metricFrame, asOf);
	const definitions = definitionDeps(frame.definitions ?? {}, asOf);
	return {
		createEvidenceReader: () =>
			Promise.reject(new Error("Lifecycle fixtures do not execute the agent")),
		createServiceAuth: () => Promise.resolve(undefined),
		detectDefinitionSignals: (params, today, _deps, options) =>
			detectFunnelGoalSignals(params, today, definitions, options),
		detectMetricSignals: (params, _query, today, abortSignal, diagnostics) =>
			detectSignals(params, query, today, abortSignal, diagnostics),
		fetchAnnotations: () => Promise.resolve(frame.annotations ?? []),
		hasTrackedData: () => Promise.resolve(metricFrame.hasData !== false),
		investigateSignal: (input) => {
			const candidate = input.candidates[0];
			if (!candidate) {
				throw new Error("Lifecycle fixture is missing a candidate");
			}
			const evidence = candidate.evidence;
			return Promise.resolve({
				...fixtureResult(candidate.signal, evidence),
				evidence,
				signal: candidate.signal,
				toolCallCount: 0,
			});
		},
		loadObservations: () => Promise.resolve(new Map(observations)),
	};
}

function stage(options: StageOptions): InsightTimelineStage {
	const input: InvestigateWebsiteInput = {
		asOf: options.asOf,
		domain: DOMAIN,
		organizationId: ORGANIZATION_ID,
		timezone: TIMEZONE,
		websiteId: `fixture-${options.timelineId}`,
	};
	return {
		asOf: options.asOf,
		expect: options.expect,
		id: options.id,
		input,
		sources: (observations) =>
			createSources(options.frame, options.asOf, observations),
	};
}

function summary(values: Partial<SummaryRow>): SummaryRow {
	return { ...QUIET_SUMMARY, ...values };
}

function metricStage(options: {
	asOf: string;
	current: Partial<SummaryRow>;
	expect: InsightStageExpectation;
	id: string;
	previous: Partial<SummaryRow>;
	timelineId: string;
}): InsightTimelineStage {
	return stage({
		asOf: options.asOf,
		expect: options.expect,
		frame: {
			metrics: {
				summary: {
					current: summary(options.current),
					previous: summary(options.previous),
				},
			},
		},
		id: options.id,
		timelineId: options.timelineId,
	});
}

function funnelConversion(
	rate: number,
	entrants: number,
	completions: number
): FunnelConversion {
	return {
		completions,
		entrants,
		rate,
		steps: [
			{ stepNumber: 1, users: entrants },
			{ stepNumber: 2, users: completions },
		],
	};
}

const trafficLifecycle: InsightTimeline = {
	id: "traffic-lifecycle",
	name: "Traffic regression persists, worsens, then recovers",
	stages: [
		metricStage({
			asOf: "2026-06-08",
			current: { unique_visitors: 400 },
			expect: {
				disposition: "needs_context",
				lifecycle: "detected",
				status: "completed",
			},
			id: "detected",
			previous: { unique_visitors: 1000 },
			timelineId: "traffic-lifecycle",
		}),
		metricStage({
			asOf: "2026-06-11",
			current: { unique_visitors: 400 },
			expect: {
				disposition: null,
				lifecycle: "persists",
				status: "deferred",
			},
			id: "persists",
			previous: { unique_visitors: 1000 },
			timelineId: "traffic-lifecycle",
		}),
		metricStage({
			asOf: "2026-06-12",
			current: { unique_visitors: 50 },
			expect: {
				disposition: "needs_context",
				lifecycle: "worsened",
				status: "completed",
			},
			id: "worsened",
			previous: { unique_visitors: 1000 },
			timelineId: "traffic-lifecycle",
		}),
		metricStage({
			asOf: "2026-06-13",
			current: {},
			expect: {
				disposition: null,
				lifecycle: "recovered",
				status: "no_signals",
			},
			id: "recovered",
			previous: {},
			timelineId: "traffic-lifecycle",
		}),
	],
};

const revenueDrop: InsightTimeline = {
	id: "revenue-drop",
	name: "Revenue regression asks for business context",
	stages: [
		stage({
			asOf: "2026-07-06",
			expect: {
				disposition: "needs_context",
				lifecycle: "detected",
				status: "completed",
			},
			frame: { metrics: { revenue: { current: 400, previous: 1000 } } },
			id: "drop",
			timelineId: "revenue-drop",
		}),
	],
};

const errorSpike: InsightTimeline = {
	id: "error-spike",
	name: "Error spike localizes an unresolved fingerprint",
	stages: [
		stage({
			asOf: "2026-07-06",
			expect: {
				disposition: "needs_context",
				lifecycle: "detected",
				status: "completed",
			},
			frame: {
				metrics: {
					errors: {
						current: { affectedUsers: 80, totalErrors: 100 },
						previous: { affectedUsers: 15, totalErrors: 20 },
					},
				},
			},
			id: "spike",
			timelineId: "error-spike",
		}),
	],
};

const vitalRegression: InsightTimeline = {
	id: "vital-regression",
	name: "Web vital regression localizes the affected page",
	stages: [
		stage({
			asOf: "2026-07-06",
			expect: {
				disposition: "needs_context",
				lifecycle: "detected",
				status: "completed",
			},
			frame: {
				metrics: {
					vitals: {
						current: [{ metric_name: "LCP", p75: 4000, samples: 200 }],
						previous: [{ metric_name: "LCP", p75: 2000, samples: 200 }],
					},
				},
			},
			id: "regression",
			timelineId: "vital-regression",
		}),
	],
};

const zeroGoal: InsightTimeline = {
	id: "zero-goal",
	name: "Zero goal completions remain unconfirmed",
	stages: [
		stage({
			asOf: "2026-07-06",
			expect: {
				disposition: "needs_context",
				lifecycle: "detected",
				status: "completed",
			},
			frame: {
				definitions: {
					goals: [
						{
							current: { completions: 0, entrants: 200, rate: 0 },
							definition: GOAL,
							previous: { completions: 30, entrants: 200, rate: 15 },
						},
					],
				},
			},
			id: "missing",
			timelineId: "zero-goal",
		}),
	],
};

const missingFunnelStep: InsightTimeline = {
	id: "missing-funnel-step",
	name: "Flow-scoped revenue confirms a missing purchase event",
	stages: [
		stage({
			asOf: "2026-07-06",
			expect: {
				disposition: "action_ready",
				lifecycle: "detected",
				status: "completed",
			},
			frame: {
				definitions: {
					confirmationsByDefinition: { "funnel:checkout": 12 },
					funnels: [
						{
							current: funnelConversion(0, 200, 0),
							definition: FUNNEL,
							previous: funnelConversion(25, 120, 30),
						},
					],
				},
			},
			id: "missing-step",
			timelineId: "missing-funnel-step",
		}),
	],
};

const plannedGoalChange: InsightTimeline = {
	id: "planned-goal-change",
	name: "Planned goal instrumentation change is not a problem",
	stages: [
		stage({
			asOf: "2026-07-06",
			expect: {
				disposition: "not_a_problem",
				lifecycle: "none",
				status: "completed",
			},
			frame: {
				annotations: [
					{
						date: "2026-07-03",
						signalScoped: true,
						title: "Signup instrumentation intentionally changed",
					},
				],
				definitions: {
					goals: [
						{
							current: { completions: 0, entrants: 200, rate: 0 },
							definition: GOAL,
							previous: { completions: 30, entrants: 200, rate: 15 },
						},
					],
				},
			},
			id: "planned",
			timelineId: "planned-goal-change",
		}),
	],
};

const positiveTrend: InsightTimeline = {
	id: "positive-trend",
	name: "Positive traffic trend is intentionally silent",
	stages: [
		metricStage({
			asOf: "2026-07-06",
			current: { unique_visitors: 1800 },
			expect: {
				disposition: null,
				lifecycle: "none",
				status: "no_signals",
			},
			id: "growth",
			previous: { unique_visitors: 1000 },
			timelineId: "positive-trend",
		}),
	],
};

const noData: InsightTimeline = {
	id: "no-data",
	name: "No tracked data exits before detection",
	stages: [
		stage({
			asOf: "2026-07-06",
			expect: {
				disposition: null,
				lifecycle: "none",
				status: "no_data",
			},
			frame: { metrics: { hasData: false } },
			id: "empty",
			timelineId: "no-data",
		}),
	],
};

const incompleteValidSignal: InsightTimeline = {
	id: "incomplete-valid-signal",
	name: "Partial detection may surface a valid signal",
	stages: [
		stage({
			asOf: "2026-07-06",
			expect: {
				disposition: "needs_context",
				lifecycle: "detected",
				status: "completed",
			},
			frame: {
				metrics: {
					failQueries: ["revenue_overview"],
					summary: {
						current: summary({ unique_visitors: 300 }),
						previous: summary({ unique_visitors: 1000 }),
					},
				},
			},
			id: "partial",
			timelineId: "incomplete-valid-signal",
		}),
	],
};

const incompleteNoSignal: InsightTimeline = {
	id: "incomplete-no-signal",
	name: "Partial detection without a signal defers non-terminally",
	stages: [
		stage({
			asOf: "2026-07-06",
			expect: {
				artifact: {
					decision: null,
					detectedSignals: [],
					detectionComplete: false,
					evidence: [],
					insight: null,
					signal: null,
					status: "deferred",
				},
				lifecycle: "none",
			},
			frame: { metrics: { failQueries: ["revenue_overview"] } },
			id: "retry",
			timelineId: "incomplete-no-signal",
		}),
	],
};

const oneSessionBounce: InsightTimeline = {
	id: "one-session-bounce",
	name: "One-session bounce noise is ignored before evidence reading",
	stages: [
		stage({
			asOf: "2026-07-06",
			expect: {
				artifact: {
					decision: null,
					detectedSignals: [],
					detectionComplete: true,
					evidence: [],
					insight: null,
					signal: null,
					status: "no_signals",
				},
				lifecycle: "none",
			},
			frame: {
				metrics: {
					summary: {
						current: summary({
							bounce_rate: 100,
							pageviews: 1,
							sessions: 1,
							unique_visitors: 1,
						}),
						previous: summary({
							bounce_rate: 10,
							pageviews: 1,
							sessions: 1,
							unique_visitors: 1,
						}),
					},
				},
			},
			id: "noise",
			timelineId: "one-session-bounce",
		}),
	],
};

const lowImpactErrorSpike: InsightTimeline = {
	id: "low-impact-error-spike",
	name: "Low-rate three-user error noise stays in raw analytics",
	stages: [
		stage({
			asOf: "2026-07-06",
			expect: {
				artifact: {
					decision: null,
					detectedSignals: [],
					detectionComplete: true,
					evidence: [],
					insight: null,
					signal: null,
					status: "no_signals",
				},
				lifecycle: "none",
			},
			frame: {
				metrics: {
					errors: {
						current: { affectedUsers: 3, totalErrors: 10 },
						previous: { affectedUsers: 1, totalErrors: 2 },
					},
					summary: {
						current: summary({ sessions: 4000 }),
						previous: summary({ sessions: 4000 }),
					},
				},
			},
			id: "noise",
			timelineId: "low-impact-error-spike",
		}),
	],
};

export const insightTimelines: InsightTimeline[] = [
	trafficLifecycle,
	revenueDrop,
	errorSpike,
	vitalRegression,
	zeroGoal,
	missingFunnelStep,
	plannedGoalChange,
	positiveTrend,
	noData,
	incompleteValidSignal,
	incompleteNoSignal,
	oneSessionBounce,
	lowImpactErrorSpike,
];
