import type { DetectedSignal } from "./detection";
import { rankSignals, signalKeyForDetectedSignal } from "./investigation";
import {
	portfolioFamilyForDetectedSignal,
	type InsightPortfolioFamily,
} from "./specialists";

const PORTFOLIO_LIMIT = { manual: 5, scheduled: 2 } as const;
const TRAFFIC_METRICS = new Set(["visitors", "sessions", "pageviews"]);

export type CoveragePortfolioReason = keyof typeof PORTFOLIO_LIMIT;

export interface CoveragePortfolioOptions {
	/** An exact open investigation to remeasure before newly detected work. */
	dueSignalKey?: string | null;
	/** Fill from these signals before using lower-priority fallback work. */
	preferredSignalKeys?: ReadonlySet<string>;
	reason: CoveragePortfolioReason;
}

interface Candidate {
	family: InsightPortfolioFamily;
	group: string;
	key: string;
	signal: DetectedSignal;
}

export function coveragePortfolioLimit(
	reason: CoveragePortfolioReason
): number {
	return PORTFOLIO_LIMIT[reason];
}

function signalGroup(signal: DetectedSignal): string {
	if (signal.subjectKey?.startsWith("route:") && signal.entityId) {
		return `route-health:${signal.entityId}`;
	}
	if (TRAFFIC_METRICS.has(signal.metric)) {
		return "traffic:top-level";
	}
	if (
		signal.metric.startsWith("funnel:") ||
		signal.metric.startsWith("goal:")
	) {
		const [kind, id] = (signal.subjectKey ?? signal.metric).split(":");
		return `conversion:${id ? `${kind}:${id}` : kind}`;
	}
	if (
		signal.metric === "error_count" ||
		signal.metric === "lcp" ||
		signal.metric === "inp"
	) {
		return `health:${signal.entityId ?? signal.subjectKey ?? signal.metric}`;
	}
	return signalKeyForDetectedSignal(signal);
}

function stableIdentity(signal: DetectedSignal): string {
	return [
		signalKeyForDetectedSignal(signal),
		signal.metric,
		signal.entityId ?? "",
		signal.entityLabel ?? "",
		signal.label,
		signal.method,
		signal.direction,
		signal.severity,
		String(signal.current),
		String(signal.baseline),
		String(signal.deltaPercent),
		JSON.stringify(signal.baselineDates ?? []),
		signal.definitionEvidence ?? "",
		JSON.stringify(signal.measurementCandidate ?? null),
		JSON.stringify(signal.setupRecommendationCandidate ?? null),
		signal.detectedAt,
	].join("\u0000");
}

function rankedCandidates(signals: DetectedSignal[]): Candidate[] {
	const stable = [...signals].sort((a, b) => {
		const left = stableIdentity(a);
		const right = stableIdentity(b);
		return left < right ? -1 : left > right ? 1 : 0;
	});
	const seen = new Set<string>();
	const candidates: Candidate[] = [];
	for (const signal of rankSignals(stable)) {
		const key = signalKeyForDetectedSignal(signal);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		candidates.push({
			family: portfolioFamilyForDetectedSignal(signal),
			group: signalGroup(signal),
			key,
			signal,
		});
	}
	return candidates;
}

/** Selects a small deterministic portfolio without mutating detector output. */
export function planCoveragePortfolio(
	signals: DetectedSignal[],
	options: CoveragePortfolioOptions
): DetectedSignal[] {
	const candidates = rankedCandidates(signals);
	const selected: Candidate[] = [];
	const usedFamilies = new Set<InsightPortfolioFamily>();
	const usedGroups = new Set<string>();
	const usedKeys = new Set<string>();

	const add = (candidate: Candidate) => {
		selected.push(candidate);
		usedFamilies.add(candidate.family);
		usedGroups.add(candidate.group);
		usedKeys.add(candidate.key);
	};
	const due = candidates.find(
		(candidate) => candidate.key === options.dueSignalKey
	);
	if (due) {
		add(due);
	}

	while (selected.length < coveragePortfolioLimit(options.reason)) {
		const available = candidates.filter(
			(candidate) =>
				!(usedKeys.has(candidate.key) || usedGroups.has(candidate.group))
		);
		const preferred = options.preferredSignalKeys
			? available.filter((candidate) =>
					options.preferredSignalKeys?.has(candidate.key)
				)
			: available;
		const pool = preferred.length > 0 ? preferred : available;
		const next =
			options.reason === "manual"
				? (pool.find((candidate) => !usedFamilies.has(candidate.family)) ??
					pool[0])
				: pool[0];
		if (!next) {
			break;
		}
		add(next);
	}

	return selected.map((candidate) => candidate.signal);
}
