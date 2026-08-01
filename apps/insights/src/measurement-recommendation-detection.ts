import { executeQuery } from "@databuddy/ai/query";
import { and, count, db, eq, isNull, lte, sql } from "@databuddy/db";
import { funnelDefinitions, goals } from "@databuddy/db/schema";
import dayjs from "dayjs";
import {
	type DetectedSignal,
	type DetectSignalsParams,
	type MeasurementCandidate,
	wowWindow,
} from "./detection";

const MIN_ACTIVE_PAGEVIEWS = 30;
const MIN_ACTIVE_SESSIONS = 30;
const MAX_CANONICAL_EVENT_LENGTH = 64;
const MAX_CANONICAL_ROUTE_LENGTH = 120;
const ABSOLUTE_URL_PATTERN = /^[a-z][a-z\d.+-]*:\/\//i;
const CANONICAL_EVENT_PATTERN = /^[a-z][a-z_]{0,63}$/;
const QUERY_OR_FRAGMENT_PATTERN = /[?#]/;
const STATIC_ROUTE_SEGMENT_PATTERN = /^[a-z][a-z-]{0,47}$/;
const TARGET_SEGMENT_DELIMITER_PATTERN = /[/_-]/;
const TRAILING_SLASH_PATTERN = /\/+$/;
const SAFE_EVENT_SEGMENTS = new Set([
	"account",
	"activated",
	"application",
	"book",
	"booking",
	"button",
	"checkout",
	"click",
	"clicked",
	"complete",
	"completed",
	"confirmation",
	"contact",
	"created",
	"demo",
	"download",
	"form",
	"lead",
	"login",
	"logged",
	"order",
	"paid",
	"payment",
	"plan",
	"purchase",
	"purchased",
	"register",
	"registered",
	"registration",
	"request",
	"requested",
	"screen",
	"sign",
	"signed",
	"signup",
	"started",
	"submit",
	"submitted",
	"subscribe",
	"subscribed",
	"subscription",
	"success",
	"succeeded",
	"trial",
	"up",
	"upgrade",
	"user",
	"view",
	"welcome",
]);
const SAFE_ROUTE_SEGMENTS = new Set([
	"account",
	"accounts",
	"app",
	"auth",
	"billing",
	"book",
	"booking",
	"cart",
	"checkout",
	"complete",
	"confirmation",
	"contact",
	"demo",
	"home",
	"login",
	"onboarding",
	"order",
	"payment",
	"plans",
	"pricing",
	"purchase",
	"register",
	"registration",
	"settings",
	"sign-in",
	"sign-up",
	"signin",
	"signup",
	"shop",
	"store",
	"subscribe",
	"subscription",
	"success",
	"thank-you",
	"trial",
	"upgrade",
	"welcome",
]);
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

export const MEASUREMENT_RECOMMENDATION_SUBJECT_KEY =
	"measurement:conversion-coverage";

export interface MeasurementDefinitionCounts {
	activeFunnels: number;
	activeGoals: number;
}

export interface MeasurementTelemetry {
	customEventNames: string[];
	pageviews: number;
	routes: string[];
	sessions: number;
}

export interface MeasurementRecommendationDeps {
	fetchDefinitionCounts: () => Promise<MeasurementDefinitionCounts>;
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

/**
 * Retain only exact, canonical event identifiers. This rejects identifiers
 * with values embedded in them instead of attempting to redact and then
 * accidentally turning the redacted value into a target that cannot match.
 */
function canonicalEventName(value: string): string | null {
	return CANONICAL_EVENT_PATTERN.test(value) &&
		value.length <= MAX_CANONICAL_EVENT_LENGTH &&
		value.split("_").every((segment) => SAFE_EVENT_SEGMENTS.has(segment))
		? value
		: null;
}

/**
 * Return an exact target only when every segment is static. Dynamic, encoded,
 * numeric, or otherwise noncanonical segments are omitted entirely rather
 * than exposing a raw path or a nonmatching placeholder.
 */
function canonicalRoute(value: string): string | null {
	let pathname = value;
	if (ABSOLUTE_URL_PATTERN.test(value)) {
		try {
			pathname = new URL(value).pathname;
		} catch {
			return null;
		}
	}
	pathname = pathname.split(QUERY_OR_FRAGMENT_PATTERN, 1)[0] ?? "";
	pathname = pathname.replace(TRAILING_SLASH_PATTERN, "");
	if (
		!pathname ||
		pathname === "/" ||
		!pathname.startsWith("/") ||
		pathname.length > MAX_CANONICAL_ROUTE_LENGTH
	) {
		return null;
	}
	const segments = pathname.split("/").filter(Boolean);
	if (
		segments.length === 0 ||
		segments.some(
			(segment) =>
				!(
					STATIC_ROUTE_SEGMENT_PATTERN.test(segment) &&
					SAFE_ROUTE_SEGMENTS.has(segment)
				)
		)
	) {
		return null;
	}
	return `/${segments.join("/")}`;
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
		.map(canonicalEventName)
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

function routeCandidate(routes: string[]): MeasurementCandidate | undefined {
	const target = routes
		.map(canonicalRoute)
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
	if (params.canonicalEventCount > 0) {
		return `${baseline} ${params.canonicalEventCount} safely canonical custom event types were observed, but none can be conservatively identified as a conversion target. This is measurement coverage only, not a completed conversion.`;
	}
	return `${baseline} Only page-navigation coverage is available; no safely canonical custom event can support a conversion target. This is a coverage-gap signal, not a completed conversion.`;
}

export function defaultMeasurementRecommendationDeps(
	websiteId: string,
	asOf: Date,
	timezone: string
): MeasurementRecommendationDeps {
	return {
		fetchDefinitionCounts: async () => {
			const [goalRows, funnelRows] = await Promise.all([
				db
					.select({ value: count() })
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
					.select({ value: count() })
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
			]);
			return {
				activeFunnels: asNonNegativeNumber(funnelRows[0]?.value),
				activeGoals: asNonNegativeNumber(goalRows[0]?.value),
			};
		},
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
							limit: 100,
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
			return {
				customEventNames: rows(customEventsResult)
					.map((row) => stringField(row, "name"))
					.filter((value): value is string => value !== null),
				pageviews: asNonNegativeNumber(summary.pageviews),
				routes: rows(pagesResult)
					.map((row) => stringField(row, "name"))
					.filter((value): value is string => value !== null),
				sessions: asNonNegativeNumber(summary.sessions),
			};
		},
	};
}

/**
 * Detect active websites where conversion measurement is absent. This emits a
 * stable informational signal rather than an anomaly: it deliberately makes
 * no claim about product intent or a completed conversion.
 */
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
	const [definitions, telemetry] = await Promise.all([
		dependencies.fetchDefinitionCounts(),
		dependencies.fetchTelemetry(
			{ from: window.currentFrom, to: window.currentTo },
			abortSignal
		),
	]);
	if (
		definitions.activeGoals > 0 ||
		definitions.activeFunnels > 0 ||
		telemetry.sessions < MIN_ACTIVE_SESSIONS ||
		telemetry.pageviews < MIN_ACTIVE_PAGEVIEWS
	) {
		return [];
	}

	const canonicalEvents = [
		...new Set(
			telemetry.customEventNames
				.map(canonicalEventName)
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
