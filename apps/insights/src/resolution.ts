import { and, db, eq, inArray } from "@databuddy/db";
import { analyticsInsights } from "@databuddy/db/schema";
import {
	invalidateAgentContextSnapshotsForWebsite,
	invalidateInsightsCachesForOrganization,
} from "@databuddy/redis";
import {
	directionKeyFromParts,
	type GeneratedInsight,
	type InvestigationDecision,
} from "@databuddy/shared/insights";
import type { DetectedSignal } from "./detection";
import { signalKeyForDetectedSignal } from "./investigation";
import { emitInsightsEvent } from "./lib/evlog-insights";

const DEFAULT_STALE_TTL_MS = 72 * 60 * 60 * 1000;
const ISO_DEFINITION_VERSION_PATTERN =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

type InsightFamily =
	| "errors"
	| "vitals"
	| "traffic"
	| "engagement"
	| "custom_event"
	| "conversion"
	| "revenue";

const TRANSIENT_TYPE_FAMILY: Record<string, InsightFamily> = {
	error_spike: "errors",
	vitals_degraded: "vitals",
	traffic_drop: "traffic",
	traffic_spike: "traffic",
	bounce_rate_change: "engagement",
	engagement_change: "engagement",
	custom_event_spike: "custom_event",
	conversion_leak: "conversion",
	funnel_regression: "conversion",
};

function signalFamily(metric: string): InsightFamily | null {
	if (metric.startsWith("custom_event:")) {
		return "custom_event";
	}
	if (metric.startsWith("funnel:") || metric.startsWith("goal:")) {
		return "conversion";
	}
	if (metric === "revenue" || metric === "payment_failure_rate") {
		return "revenue";
	}
	switch (metric) {
		case "visitors":
		case "sessions":
		case "pageviews":
			return "traffic";
		case "bounce_rate":
		case "session_duration":
			return "engagement";
		case "error_count":
			return "errors";
		case "lcp":
		case "inp":
			return "vitals";
		default:
			return null;
	}
}

function isRevenueSubject(subjectKey: string): boolean {
	return (
		subjectKey === "revenue" ||
		subjectKey.startsWith("revenue:") ||
		isPaymentFailureSubject(subjectKey)
	);
}

function isPaymentFailureSubject(subjectKey: string): boolean {
	return (
		subjectKey === "payment_failure_rate" ||
		subjectKey.startsWith("payment_failure_rate:")
	);
}

export interface OpenInsightRow {
	changePercent: number | null;
	createdAt: Date;
	id: string;
	sentiment: GeneratedInsight["sentiment"];
	subjectKey: string;
	type: string;
}

export interface ResolutionDecision {
	id: string;
	reason: "recovered" | "stale";
}

export function retiredSignalKeyForOutcome(params: {
	coverage: { definitions: boolean; metrics: boolean };
	disposition: InvestigationDecision["disposition"] | undefined;
	hasInsight: boolean;
	signalKey: string | undefined;
}): string | undefined {
	const isConversion =
		params.signalKey?.startsWith("goal:") ||
		params.signalKey?.startsWith("funnel:");
	const familyComplete = isConversion
		? params.coverage.definitions
		: params.coverage.metrics;
	if (params.hasInsight || !familyComplete) {
		return;
	}
	return params.disposition === "monitor" ||
		params.disposition === "not_a_problem"
		? params.signalKey
		: undefined;
}

function hasExactSubject(insight: OpenInsightRow): boolean {
	if (isRevenueSubject(insight.subjectKey)) {
		return true;
	}
	if (insight.subjectKey.startsWith("custom_event:")) {
		return true;
	}
	if (insight.type === "traffic_drop" || insight.type === "traffic_spike") {
		return (
			insight.subjectKey === "visitors" ||
			insight.subjectKey === "sessions" ||
			insight.subjectKey === "pageviews"
		);
	}
	if (insight.type === "bounce_rate_change") {
		return insight.subjectKey === "bounce_rate";
	}
	if (insight.type === "engagement_change") {
		return insight.subjectKey === "session_duration";
	}
	if (insight.type === "error_spike") {
		return insight.subjectKey === "error_count";
	}
	if (insight.type === "vitals_degraded") {
		return insight.subjectKey === "lcp" || insight.subjectKey === "inp";
	}
	if (insight.type === "conversion_leak") {
		return insight.subjectKey.startsWith("goal:");
	}
	if (insight.type === "funnel_regression") {
		return insight.subjectKey.startsWith("funnel:");
	}
	return false;
}

function familyForInsight(insight: OpenInsightRow): InsightFamily | undefined {
	if (isRevenueSubject(insight.subjectKey)) {
		return "revenue";
	}
	if (insight.subjectKey.startsWith("custom_event:")) {
		return "custom_event";
	}
	return TRANSIENT_TYPE_FAMILY[insight.type];
}

function conversionDefinitionKey(subjectKey: string): string {
	const versionSeparator = subjectKey.lastIndexOf("@");
	if (versionSeparator < 0) {
		return subjectKey;
	}
	const version = subjectKey.slice(versionSeparator + 1);
	return !ISO_DEFINITION_VERSION_PATTERN.test(version) ||
		Number.isNaN(Date.parse(version))
		? subjectKey
		: subjectKey.slice(0, versionSeparator);
}

export function computeResolutions(params: {
	activeConversionKeys?: ReadonlySet<string>;
	canRecover: boolean;
	canRecoverConversion?: boolean;
	detectedSignals: DetectedSignal[];
	now: Date;
	openInsights: OpenInsightRow[];
	recoverableConversionKeys?: ReadonlySet<string>;
	retiredSignalKey?: string;
	staleTtlMs?: number;
}): ResolutionDecision[] {
	const staleTtlMs = params.staleTtlMs ?? DEFAULT_STALE_TTL_MS;
	const activeKeys = new Set<string>();
	const activeFamilies = new Set<InsightFamily>();
	const activeSignalKeys = new Set<string>();
	const activeExactKeys = new Set<string>();
	for (const signal of params.detectedSignals) {
		const signalKey = signalKeyForDetectedSignal(signal);
		activeSignalKeys.add(signalKey);
		activeExactKeys.add(`${signalKey}:${signal.direction}`);
		const family = signalFamily(signal.metric);
		if (!family) {
			continue;
		}
		activeKeys.add(`${family}:${signal.direction}`);
		activeFamilies.add(family);
	}

	const decisions: ResolutionDecision[] = [];
	for (const insight of params.openInsights) {
		if (insight.subjectKey === params.retiredSignalKey) {
			decisions.push({ id: insight.id, reason: "stale" });
			continue;
		}
		const family = familyForInsight(insight);
		if (family) {
			const exactConversionSubject =
				family === "conversion" && hasExactSubject(insight);
			const definitionKey = exactConversionSubject
				? conversionDefinitionKey(insight.subjectKey)
				: insight.subjectKey;
			const definitionWasRemoved =
				exactConversionSubject &&
				params.activeConversionKeys !== undefined &&
				!params.activeConversionKeys.has(definitionKey);
			const canRecover =
				family === "conversion"
					? (params.canRecoverConversion ?? params.canRecover) ||
						(params.recoverableConversionKeys?.has(definitionKey) ?? false) ||
						definitionWasRemoved
					: params.canRecover;
			if (!canRecover) {
				if (exactConversionSubject) {
					continue;
				}
				if (params.now.getTime() - insight.createdAt.getTime() >= staleTtlMs) {
					decisions.push({ id: insight.id, reason: "stale" });
				}
				continue;
			}
			const direction =
				insight.changePercent === null
					? "flat"
					: directionKeyFromParts(insight.changePercent, insight.sentiment);
			const stillFiring = hasExactSubject(insight)
				? direction === "flat"
					? activeSignalKeys.has(insight.subjectKey)
					: activeExactKeys.has(`${insight.subjectKey}:${direction}`)
				: direction === "flat"
					? activeFamilies.has(family)
					: activeKeys.has(`${family}:${direction}`);
			if (!stillFiring) {
				const paymentRecoveryConfirmed =
					!isPaymentFailureSubject(insight.subjectKey) ||
					activeExactKeys.has(`${insight.subjectKey}:down`);
				if (paymentRecoveryConfirmed) {
					decisions.push({ id: insight.id, reason: "recovered" });
				} else if (
					params.now.getTime() - insight.createdAt.getTime() >=
					staleTtlMs
				) {
					decisions.push({ id: insight.id, reason: "stale" });
				}
			}
			continue;
		}
		if (params.now.getTime() - insight.createdAt.getTime() >= staleTtlMs) {
			decisions.push({ id: insight.id, reason: "stale" });
		}
	}
	return decisions;
}

export async function resolveInsightsForWebsite(params: {
	activeConversionKeys?: string[];
	canRecover: boolean;
	canRecoverConversion?: boolean;
	detectedSignals: DetectedSignal[];
	now?: Date;
	organizationId: string;
	recoverableConversionKeys?: string[];
	retiredSignalKey?: string;
	runId: string;
	websiteId: string;
}): Promise<ResolutionDecision[]> {
	const now = params.now ?? new Date();
	const openInsights = await db
		.select({
			id: analyticsInsights.id,
			type: analyticsInsights.type,
			changePercent: analyticsInsights.changePercent,
			sentiment: analyticsInsights.sentiment,
			subjectKey: analyticsInsights.subjectKey,
			createdAt: analyticsInsights.createdAt,
		})
		.from(analyticsInsights)
		.where(
			and(
				eq(analyticsInsights.organizationId, params.organizationId),
				eq(analyticsInsights.websiteId, params.websiteId),
				eq(analyticsInsights.status, "open")
			)
		);

	const decisions = computeResolutions({
		activeConversionKeys:
			params.activeConversionKeys === undefined
				? undefined
				: new Set(params.activeConversionKeys),
		canRecover: params.canRecover,
		canRecoverConversion: params.canRecoverConversion,
		detectedSignals: params.detectedSignals,
		now,
		openInsights,
		recoverableConversionKeys: new Set(params.recoverableConversionKeys ?? []),
		retiredSignalKey: params.retiredSignalKey,
	});

	if (decisions.length === 0) {
		return decisions;
	}

	const recoveredIds = decisions
		.filter((d) => d.reason === "recovered")
		.map((d) => d.id);
	const staleIds = decisions
		.filter((d) => d.reason === "stale")
		.map((d) => d.id);

	const updates: Promise<unknown>[] = [];
	if (recoveredIds.length > 0) {
		updates.push(
			db
				.update(analyticsInsights)
				.set({
					status: "resolved",
					resolvedAt: now,
					resolvedReason: "recovered",
				})
				.where(inArray(analyticsInsights.id, recoveredIds))
		);
	}
	if (staleIds.length > 0) {
		updates.push(
			db
				.update(analyticsInsights)
				.set({ status: "resolved", resolvedAt: now, resolvedReason: "stale" })
				.where(inArray(analyticsInsights.id, staleIds))
		);
	}
	await Promise.all(updates);

	await Promise.all([
		invalidateInsightsCachesForOrganization(params.organizationId),
		invalidateAgentContextSnapshotsForWebsite(params.websiteId),
	]);

	emitInsightsEvent("info", "generation.resolution.completed", {
		organization_id: params.organizationId,
		website_id: params.websiteId,
		run_id: params.runId,
		open_count: openInsights.length,
		resolved_count: decisions.length,
		recovered_count: recoveredIds.length,
		stale_count: staleIds.length,
		can_recover: params.canRecover,
		can_recover_conversion: params.canRecoverConversion ?? params.canRecover,
	});

	return decisions;
}
