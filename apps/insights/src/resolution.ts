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

type InsightFamily =
	| "errors"
	| "vitals"
	| "traffic"
	| "engagement"
	| "conversion";

const TRANSIENT_TYPE_FAMILY: Record<string, InsightFamily> = {
	error_spike: "errors",
	vitals_degraded: "vitals",
	traffic_drop: "traffic",
	traffic_spike: "traffic",
	bounce_rate_change: "engagement",
	engagement_change: "engagement",
	conversion_leak: "conversion",
	funnel_regression: "conversion",
};

function signalFamily(metric: string): InsightFamily | null {
	if (metric.startsWith("funnel:") || metric.startsWith("goal:")) {
		return "conversion";
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
	disposition: InvestigationDecision["disposition"] | undefined;
	hasInsight: boolean;
	signalKey: string | undefined;
}): string | undefined {
	if (params.hasInsight) {
		return;
	}
	return params.disposition === "monitor" ||
		params.disposition === "not_a_problem"
		? params.signalKey
		: undefined;
}

function hasExactSubject(insight: OpenInsightRow): boolean {
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

export function computeResolutions(params: {
	canRecover: boolean;
	detectedSignals: DetectedSignal[];
	now: Date;
	openInsights: OpenInsightRow[];
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
		const family = TRANSIENT_TYPE_FAMILY[insight.type];
		if (family) {
			if (!params.canRecover) {
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
				decisions.push({ id: insight.id, reason: "recovered" });
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
	canRecover: boolean;
	detectedSignals: DetectedSignal[];
	now?: Date;
	organizationId: string;
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
		canRecover: params.canRecover,
		detectedSignals: params.detectedSignals,
		now,
		openInsights,
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
	});

	return decisions;
}
