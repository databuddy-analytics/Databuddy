import { directionKeyFromParts } from "@databuddy/ai/insights/dedupe";
import type { ParsedInsight } from "@databuddy/ai/schemas/smart-insights-output";
import { and, db, eq, inArray } from "@databuddy/db";
import { analyticsInsights } from "@databuddy/db/schema";
import {
	invalidateAgentContextSnapshotsForWebsite,
	invalidateInsightsCachesForOrganization,
} from "@databuddy/redis";
import type { DetectedSignal } from "./detection";
import { emitInsightsEvent } from "./lib/evlog-insights";

const DEFAULT_STALE_TTL_MS = 72 * 60 * 60 * 1000;

type InsightFamily =
	| "errors"
	| "vitals"
	| "traffic"
	| "engagement"
	| "conversion"
	| "custom_event";

const TRANSIENT_TYPE_FAMILY: Record<string, InsightFamily> = {
	error_spike: "errors",
	new_errors: "errors",
	vitals_degraded: "vitals",
	traffic_drop: "traffic",
	traffic_spike: "traffic",
	bounce_rate_change: "engagement",
	engagement_change: "engagement",
	conversion_leak: "conversion",
	funnel_regression: "conversion",
	custom_event_spike: "custom_event",
};

function signalFamily(metric: string): InsightFamily | null {
	if (metric.startsWith("custom_event:")) {
		return "custom_event";
	}
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
	sentiment: ParsedInsight["sentiment"];
	type: string;
}

export interface ResolutionDecision {
	id: string;
	reason: "recovered" | "stale";
}

export function computeResolutions(params: {
	canRecover: boolean;
	detectedSignals: DetectedSignal[];
	now: Date;
	openInsights: OpenInsightRow[];
	staleTtlMs?: number;
}): ResolutionDecision[] {
	const staleTtlMs = params.staleTtlMs ?? DEFAULT_STALE_TTL_MS;
	const activeKeys = new Set<string>();
	const activeFamilies = new Set<InsightFamily>();
	for (const signal of params.detectedSignals) {
		const family = signalFamily(signal.metric);
		if (!family) {
			continue;
		}
		activeKeys.add(`${family}:${signal.direction}`);
		activeFamilies.add(family);
	}

	const decisions: ResolutionDecision[] = [];
	for (const insight of params.openInsights) {
		const family = TRANSIENT_TYPE_FAMILY[insight.type];
		if (family) {
			if (!params.canRecover) {
				continue;
			}
			const direction = directionKeyFromParts(
				insight.changePercent,
				insight.sentiment
			);
			const stillFiring =
				direction === "flat"
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
			createdAt: analyticsInsights.createdAt,
		})
		.from(analyticsInsights)
		.where(
			and(
				eq(analyticsInsights.websiteId, params.websiteId),
				eq(analyticsInsights.status, "open")
			)
		);

	const decisions = computeResolutions({
		canRecover: params.canRecover,
		detectedSignals: params.detectedSignals,
		now,
		openInsights: openInsights.map((row) => ({
			id: row.id,
			type: row.type,
			changePercent: row.changePercent,
			sentiment: row.sentiment as ParsedInsight["sentiment"],
			createdAt: row.createdAt,
		})),
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
