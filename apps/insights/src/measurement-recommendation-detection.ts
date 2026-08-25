import { executeQuery } from "@databuddy/ai/query";
import { and, db, eq, isNull, lte, sql } from "@databuddy/db";
import { funnelDefinitions, goals, websites } from "@databuddy/db/schema";
import dayjs from "dayjs";
import {
	type DetectedSignal,
	type DetectSignalsParams,
	type MeasurementCandidate,
	wowWindow,
} from "./detection";
import {
	canonicalMeasurementEventTarget,
	canonicalMeasurementRouteTarget,
} from "./measurement-targets";

const MIN_ACTIVE_PAGEVIEWS = 30;
const MIN_ACTIVE_SESSIONS = 30;
const MIN_UNCOVERED_EVENT_USERS = 30;
const CUSTOM_EVENT_SAMPLE_LIMIT = 1000;
const TRACKING_ACTIVITY_LOOKBACK_DAYS = 60;
const TARGET_SEGMENT_DELIMITER_PATTERN = /[/_-]/;
const CONVERSION_TERMS = new Set([
	"book",
	"booking",
	"checkout",
	"complete",
	"completed",
	"confirmation",
	"contact",
	"demo",
	"lead",
	"order",
	"ordered",
	"paid",
	"payment",
	"purchase",
	"purchased",
	"register",
	"registration",
	"sign-up",
	"signup",
	"submit",
	"submitted",
	"subscribe",
	"subscribed",
	"subscription",
	"success",
	"trial",
]);

const MEASUREMENT_RECOMMENDATION_SUBJECT_KEY =
	"measurement:conversion-coverage";
const TRACKING_ACTIVITY_SUBJECT_KEY = "measurement:tracking-activity";

interface MeasurementDefinitionCoverage {
	activeFunnels: number;
	activeGoals: number;
	coveredEventTargets: string[];
	websiteCreatedAt?: Date | null;
}

interface ObservedCustomEvent {
	name: string;
	uniqueUsers: number;
}

interface MeasurementTelemetry {
	customEventNames: string[];
	customEventSampled?: boolean;
	customEventSampleLimit?: number;
	pageviews: number;
	routes: string[];
	sessions: number;
}

interface MeasurementActivity {
	customEvents: number;
	pageviews: number;
	sessions: number;
}

export interface MeasurementRecommendationDeps {
	fetchActivity?: (
		range: { from: string; to: string },
		abortSignal?: AbortSignal
	) => Promise<MeasurementActivity>;
	fetchDefinitionCoverage: () => Promise<MeasurementDefinitionCoverage>;
	fetchObservedEvents: (
		range: { from: string; to: string },
		abortSignal?: AbortSignal
	) => Promise<ObservedCustomEvent[]>;
	fetchTelemetry: (
		range: { from: string; to: string },
		abortSignal?: AbortSignal
	) => Promise<MeasurementTelemetry>;
}

function asNonNegativeNumber(value: unknown): number {
	const number = Number(value);
	return Number.isFinite(number) && number > 0 ? number : 0;
}

function rows(value: unknown): Record<string, unknown>[] {
	return Array.isArray(value)
		? value.filter(
				(item): item is Record<string, unknown> =>
					typeof item === "object" && item !== null
			)
		: [];
}

function stringField(
	value: Record<string, unknown>,
	field: string
): string | null {
	const candidate = value[field];
	return typeof candidate === "string" && candidate.trim().length > 0
		? candidate.trim()
		: null;
}

function hasConversionTerm(target: string): boolean {
	if (target.includes("sign_up") || target.includes("sign-up")) {
		return true;
	}
	return target
		.split(TARGET_SEGMENT_DELIMITER_PATTERN)
		.some((term) => CONVERSION_TERMS.has(term));
}

function eventCandidate(
	eventNames: string[]
): MeasurementCandidate | undefined {
	const target = eventNames
		.map(canonicalMeasurementEventTarget)
		.find((eventName) => eventName !== null && hasConversionTerm(eventName));
	return target
		? {
				basis: "observed_custom_event",
				kind: "event_goal_candidate",
				target,
				type: "EVENT",
			}
		: undefined;
}

function coveredEventTarget(
	type: "PAGE_VIEW" | "EVENT" | "CUSTOM",
	target: string
): string | null {
	return type === "EVENT" || type === "CUSTOM"
		? canonicalMeasurementEventTarget(target)
		: null;
}

function uncoveredEventCandidate(
	events: ObservedCustomEvent[],
	coveredTargets: ReadonlySet<string>
): { candidate: MeasurementCandidate; uniqueUsers: number } | null {
	const eligible = events
		.map(({ name, uniqueUsers }) => {
			const target = canonicalMeasurementEventTarget(name);
			return target && hasConversionTerm(target) && !coveredTargets.has(target)
				? { target, uniqueUsers }
				: null;
		})
		.filter(
			(event): event is { target: string; uniqueUsers: number } =>
				event !== null && event.uniqueUsers >= MIN_UNCOVERED_EVENT_USERS
		)
		.sort(
			(left, right) =>
				right.uniqueUsers - left.uniqueUsers ||
				left.target.localeCompare(right.target)
		);
	const event = eligible[0];
	return event
		? {
				candidate: {
					basis: "observed_custom_event",
					kind: "event_goal_candidate",
					target: event.target,
					type: "EVENT",
				},
				uniqueUsers: event.uniqueUsers,
			}
		: null;
}

function routeCandidate(routes: string[]): MeasurementCandidate | undefined {
	const target = routes
		.map(canonicalMeasurementRouteTarget)
		.find((route) => route !== null && hasConversionTerm(route));
	return target
		? {
				basis: "observed_navigation_proxy",
				kind: "page_navigation_proxy",
				target,
				type: "PAGE_VIEW",
			}
		: undefined;
}

function readableEvidence(params: {
	candidate: MeasurementCandidate | undefined;
	canonicalEventCount: number;
	customEventSampleLimit?: number;
	customEventSampled?: boolean;
	pageviews: number;
	sessions: number;
}): string {
	const baseline = `No active goals or funnels are configured. The completed period recorded ${params.sessions} sessions and ${params.pageviews} pageviews.`;
	if (params.candidate?.kind === "event_goal_candidate") {
		return `${baseline} A safely canonical custom event provides an evidence-backed candidate for measurement setup. Its occurrence establishes telemetry coverage, not that the event is a business conversion.`;
	}
	if (params.candidate?.kind === "page_navigation_proxy") {
		return `${baseline} Only page-navigation evidence is available for the candidate route. It is a navigation proxy and coverage-gap signal, not evidence of a completed conversion; prefer instrumentation before treating it as a conversion.`;
	}
	const sampleCopy = params.customEventSampled
		? ` in the top ${params.customEventSampleLimit ?? CUSTOM_EVENT_SAMPLE_LIMIT} custom event types by unique users`
		: "";
	if (params.canonicalEventCount > 0) {
		return `${baseline} ${params.canonicalEventCount} safely canonical custom event types were observed${sampleCopy}, but none can be conservatively identified as a conversion target. This is measurement coverage only, not a completed conversion.`;
	}
	return `${baseline} Only page-navigation coverage is available; no safely canonical custom event${sampleCopy} can support a conversion target. This is a coverage-gap signal, not a completed conversion.`;
}

function uncoveredEventEvidence(params: {
	activeFunnels: number;
	activeGoals: number;
	uniqueUsers: number;
}): string {
	return `The active configuration has ${params.activeGoals} goals and ${params.activeFunnels} funnels, but none covers one safely canonical conversion-like custom event observed for ${params.uniqueUsers} visitor identifiers in the completed period. This is a measurement coverage gap, not proof that the event is a completed business conversion.`;
}

function hasActivity(activity: MeasurementActivity): boolean {
	return (
		activity.sessions > 0 || activity.pageviews > 0 || activity.customEvents > 0
	);
}

async function fetchTrackingActivity(
	dependencies: MeasurementRecommendationDeps,
	range: { from: string; to: string },
	abortSignal?: AbortSignal
): Promise<MeasurementActivity> {
	if (dependencies.fetchActivity) {
		return dependencies.fetchActivity(range, abortSignal);
	}
	const telemetry = await dependencies.fetchTelemetry(range, abortSignal);
	return {
		customEvents: telemetry.customEventNames.length,
		pageviews: telemetry.pageviews,
		sessions: telemetry.sessions,
	};
}

function siteIsNewerThanTrackingLookback(
	websiteCreatedAt: Date | null | undefined,
	today: dayjs.Dayjs
): boolean {
	return (
		websiteCreatedAt !== null &&
		websiteCreatedAt !== undefined &&
		dayjs(websiteCreatedAt).isAfter(
			today.subtract(TRACKING_ACTIVITY_LOOKBACK_DAYS, "day")
		)
	);
}

function noTrackingActivitySignal(detectedAt: string): DetectedSignal {
	return {
		baseline: 0,
		current: 0,
		definitionEvidence: `No sessions, pageviews, or custom event types were recorded in the last ${TRACKING_ACTIVITY_LOOKBACK_DAYS} completed days. The site may be inactive or its tracker may not be sending data, so its analytics cannot support decisions.`,
		deltaPercent: 0,
		detectedAt,
		direction: "up",
		label: "Site tracking has no recent activity",
		method: "wow",
		metric: "measurement_coverage",
		severity: "info",
		setupRecommendationCandidate: {
			action:
				"Confirm this site is still active; if it is, install or repair the Databuddy tracker before relying on its analytics.",
			feature: "tracking",
			kind: "databuddy_setup",
		},
		subjectKey: TRACKING_ACTIVITY_SUBJECT_KEY,
	};
}

export function defaultMeasurementRecommendationDeps(
	websiteId: string,
	asOf: Date,
	timezone: string
): MeasurementRecommendationDeps {
	return {
		fetchDefinitionCoverage: async () => {
			const [goalRows, funnelRows, websiteRows] = await Promise.all([
				db
					.select({ target: goals.target, type: goals.type })
					.from(goals)
					.where(
						and(
							eq(goals.websiteId, websiteId),
							eq(goals.isActive, true),
							isNull(goals.deletedAt),
							lte(goals.createdAt, asOf),
							lte(goals.updatedAt, asOf)
						)
					),
				db
					.select({ steps: funnelDefinitions.steps })
					.from(funnelDefinitions)
					.where(
						and(
							eq(funnelDefinitions.websiteId, websiteId),
							eq(funnelDefinitions.isActive, true),
							isNull(funnelDefinitions.deletedAt),
							lte(funnelDefinitions.createdAt, asOf),
							lte(funnelDefinitions.updatedAt, asOf),
							sql`jsonb_array_length(${funnelDefinitions.steps}) > 1`
						)
					),
				db
					.select({ createdAt: websites.createdAt })
					.from(websites)
					.where(and(eq(websites.id, websiteId), lte(websites.createdAt, asOf)))
					.limit(1),
			]);
			const coveredEventTargets = new Set<string>();
			for (const goal of goalRows) {
				const target = coveredEventTarget(goal.type, goal.target);
				if (target) {
					coveredEventTargets.add(target);
				}
			}
			for (const funnel of funnelRows) {
				for (const step of funnel.steps) {
					const target = coveredEventTarget(step.type, step.target);
					if (target) {
						coveredEventTargets.add(target);
					}
				}
			}
			return {
				activeFunnels: funnelRows.length,
				activeGoals: goalRows.length,
				coveredEventTargets: [...coveredEventTargets],
				websiteCreatedAt: websiteRows[0]?.createdAt ?? null,
			};
		},
		fetchObservedEvents: async (range, abortSignal) =>
			rows(
				await executeQuery(
					{
						from: range.from,
						limit: CUSTOM_EVENT_SAMPLE_LIMIT,
						projectId: websiteId,
						to: range.to,
						type: "custom_events",
					},
					undefined,
					timezone,
					abortSignal
				)
			)
				.map((row) => {
					const name = stringField(row, "name");
					return name
						? { name, uniqueUsers: asNonNegativeNumber(row.unique_users) }
						: null;
				})
				.filter((event): event is ObservedCustomEvent => event !== null),
		fetchTelemetry: async (range, abortSignal) => {
			const [summaryResult, customEventsResult, pagesResult] =
				await Promise.all([
					executeQuery(
						{
							from: range.from,
							projectId: websiteId,
							to: range.to,
							type: "summary_metrics",
						},
						undefined,
						timezone,
						abortSignal
					),
					executeQuery(
						{
							from: range.from,
							limit: CUSTOM_EVENT_SAMPLE_LIMIT,
							projectId: websiteId,
							to: range.to,
							type: "custom_events",
						},
						undefined,
						timezone,
						abortSignal
					),
					executeQuery(
						{
							from: range.from,
							limit: 50,
							projectId: websiteId,
							to: range.to,
							type: "top_pages",
						},
						undefined,
						timezone,
						abortSignal
					),
				]);
			const summary = rows(summaryResult)[0] ?? {};
			const customEventRows = rows(customEventsResult);
			return {
				customEventNames: customEventRows
					.map((row) => stringField(row, "name"))
					.filter((value): value is string => value !== null),
				customEventSampleLimit: CUSTOM_EVENT_SAMPLE_LIMIT,
				customEventSampled: customEventRows.length >= CUSTOM_EVENT_SAMPLE_LIMIT,
				pageviews: asNonNegativeNumber(summary.pageviews),
				routes: rows(pagesResult)
					.map((row) => stringField(row, "name"))
					.filter((value): value is string => value !== null),
				sessions: asNonNegativeNumber(summary.sessions),
			};
		},
		fetchActivity: async (range, abortSignal) => {
			const [summaryResult, customEventsSummaryResult] = await Promise.all([
				executeQuery(
					{
						from: range.from,
						projectId: websiteId,
						to: range.to,
						type: "summary_metrics",
					},
					undefined,
					timezone,
					abortSignal
				),
				executeQuery(
					{
						from: range.from,
						projectId: websiteId,
						to: range.to,
						type: "custom_events_summary",
					},
					undefined,
					timezone,
					abortSignal
				),
			]);
			const summary = rows(summaryResult)[0] ?? {};
			const customEventsSummary = rows(customEventsSummaryResult)[0] ?? {};
			return {
				customEvents: asNonNegativeNumber(customEventsSummary.total_events),
				pageviews: asNonNegativeNumber(summary.pageviews),
				sessions: asNonNegativeNumber(summary.sessions),
			};
		},
	};
}
export async function detectMeasurementRecommendationSignals(
	params: DetectSignalsParams,
	today: dayjs.Dayjs = dayjs(),
	dependencies: MeasurementRecommendationDeps = defaultMeasurementRecommendationDeps(
		params.websiteId,
		today.toDate(),
		params.timezone
	),
	abortSignal?: AbortSignal
): Promise<DetectedSignal[]> {
	const window = wowWindow(today, params.lookbackDays);
	const trackingActivityRange = {
		from: today
			.subtract(TRACKING_ACTIVITY_LOOKBACK_DAYS, "day")
			.format("YYYY-MM-DD"),
		to: window.currentTo,
	};
	const definitions = await dependencies.fetchDefinitionCoverage();
	const siteIsNewerThanLookback = siteIsNewerThanTrackingLookback(
		definitions.websiteCreatedAt,
		today
	);
	if (definitions.activeGoals > 0 || definitions.activeFunnels > 0) {
		const uncovered = uncoveredEventCandidate(
			await dependencies.fetchObservedEvents(
				{ from: window.currentFrom, to: window.currentTo },
				abortSignal
			),
			new Set(definitions.coveredEventTargets)
		);
		if (uncovered) {
			return [
				{
					baseline: 0,
					current: 0,
					definitionEvidence: uncoveredEventEvidence({
						activeFunnels: definitions.activeFunnels,
						activeGoals: definitions.activeGoals,
						uniqueUsers: uncovered.uniqueUsers,
					}),
					deltaPercent: 0,
					detectedAt: window.currentTo,
					direction: "up",
					label: "High-reach conversion event is not measured",
					measurementCandidate: uncovered.candidate,
					method: "wow",
					metric: "measurement_coverage",
					severity: "info",
					subjectKey: `measurement:uncovered-event:${uncovered.candidate.target}`,
				},
			];
		}
		if (siteIsNewerThanLookback) {
			return [];
		}
		const longTermActivity = await fetchTrackingActivity(
			dependencies,
			trackingActivityRange,
			abortSignal
		);
		return hasActivity(longTermActivity)
			? []
			: [noTrackingActivitySignal(window.currentTo)];
	}

	const telemetry = await dependencies.fetchTelemetry(
		{ from: window.currentFrom, to: window.currentTo },
		abortSignal
	);
	if (telemetry.sessions === 0 && telemetry.pageviews === 0) {
		if (siteIsNewerThanLookback) {
			return [];
		}
		const longTermActivity = await fetchTrackingActivity(
			dependencies,
			trackingActivityRange,
			abortSignal
		);
		if (!hasActivity(longTermActivity)) {
			return [noTrackingActivitySignal(window.currentTo)];
		}
	}
	if (
		telemetry.sessions < MIN_ACTIVE_SESSIONS ||
		telemetry.pageviews < MIN_ACTIVE_PAGEVIEWS
	) {
		return [];
	}

	const canonicalEvents = [
		...new Set(
			telemetry.customEventNames
				.map(canonicalMeasurementEventTarget)
				.filter((eventName): eventName is string => eventName !== null)
		),
	];
	const candidate =
		eventCandidate(canonicalEvents) ?? routeCandidate(telemetry.routes);
	return [
		{
			baseline: 0,
			current: 0,
			definitionEvidence: readableEvidence({
				candidate,
				canonicalEventCount: canonicalEvents.length,
				customEventSampleLimit: telemetry.customEventSampleLimit,
				customEventSampled: telemetry.customEventSampled,
				pageviews: telemetry.pageviews,
				sessions: telemetry.sessions,
			}),
			deltaPercent: 0,
			detectedAt: window.currentTo,
			direction: "up",
			label: "Conversion measurement coverage is missing",
			measurementCandidate: candidate,
			method: "wow",
			metric: "measurement_coverage",
			severity: "info",
			subjectKey: MEASUREMENT_RECOMMENDATION_SUBJECT_KEY,
		},
	];
}
