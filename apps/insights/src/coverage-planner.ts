import type { DetectedSignal } from "./detection";
import {
	isDirectSignal,
	isRegression,
	rankSignals,
	signalKeyForDetectedSignal,
	type SignalRankingStrategy,
} from "./investigation";

// A manual review is intentionally deeper than the recurring monitor, while
// remaining bounded enough to give every selected signal its own grounded turn.
const PORTFOLIO_LIMIT = { manual: 6, scheduled: 2 } as const;
const ERROR_QUALIFICATION_BACKFILL_WINDOWS = 1;
const TRAFFIC_METRICS = new Set(["visitors", "sessions", "pageviews"]);

export type CoveragePortfolioReason = keyof typeof PORTFOLIO_LIMIT;

export interface CoveragePortfolioOptions {
	/** An exact open investigation to remeasure before newly detected work. */
	dueSignalKey?: string | null;
	/**
	 * Exact candidates that a bounded, evidence-backed cohort check proved are
	 * already represented by another selected signal.
	 */
	excludedSignalKeys?: ReadonlySet<string>;
	/** Fill from these signals before using lower-priority fallback work. */
	preferredSignalKeys?: ReadonlySet<string>;
	/** Shadow audits can compare an alternative ranking without changing default runs. */
	rankingStrategy?: SignalRankingStrategy;
	reason: CoveragePortfolioReason;
	/**
	 * Detector output that lacks enough deterministic decision evidence for a
	 * new agent turn. A due recheck remains an explicit lifecycle exception.
	 */
	unqualifiedSignalKeys?: ReadonlySet<string>;
}

export type SignalFamily =
	| "conversion"
	| "engagement"
	| "error"
	| "event"
	| "measurement"
	| "other"
	| "revenue"
	| "traffic"
	| "vital";

interface Candidate {
	duplicate: boolean;
	family: SignalFamily;
	group: string;
	key: string;
	rank: number;
	signal: DetectedSignal;
}

export type CoveragePortfolioOmission =
	| "cooling"
	| "duplicate"
	| "lower_priority"
	| "overlap_covered"
	| "portfolio_limit"
	| "same_cluster"
	| "unqualified";

export interface CoveragePortfolioEntry {
	family: SignalFamily;
	omittedFor: CoveragePortfolioOmission[];
	rank: number;
	selectedAt: number | null;
	signal: DetectedSignal;
}

export interface CoveragePortfolioPlan {
	entries: CoveragePortfolioEntry[];
	selected: DetectedSignal[];
}

export function coveragePortfolioLimit(
	reason: CoveragePortfolioReason
): number {
	return PORTFOLIO_LIMIT[reason];
}

/**
 * Exact-error qualification happens before measured route-overlap pruning.
 * Keep one extra, fixed portfolio of candidates so a proven redundant route
 * cannot consume every admission slot and leave the first independent error
 * outside the bounded frontier. The window is ranking-independent, so shadow
 * comparisons keep the same qualified candidate set for both plans.
 */
export function errorQualificationFrontierLimit(
	reason: CoveragePortfolioReason
): number {
	return (
		coveragePortfolioLimit(reason) * (1 + ERROR_QUALIFICATION_BACKFILL_WINDOWS)
	);
}

function signalFamily(signal: DetectedSignal): SignalFamily {
	if (TRAFFIC_METRICS.has(signal.metric)) {
		return "traffic";
	}
	if (signal.metric === "error_count") {
		return "error";
	}
	if (signal.metric === "lcp" || signal.metric === "inp") {
		return "vital";
	}
	if (signal.metric === "revenue") {
		return "revenue";
	}
	if (signal.metric === "custom_event_count") {
		return "event";
	}
	if (
		signal.metric.startsWith("funnel:") ||
		signal.metric.startsWith("goal:")
	) {
		return "conversion";
	}
	if (signal.metric === "measurement_coverage") {
		return "measurement";
	}
	if (signal.metric === "bounce_rate" || signal.metric === "session_duration") {
		return "engagement";
	}
	return "other";
}

function signalGroup(signal: DetectedSignal, family: SignalFamily): string {
	if (signal.subjectKey?.startsWith("route:") && signal.entityId) {
		return `route-health:${signal.entityId}`;
	}
	if (family === "traffic") {
		return "traffic:top-level";
	}
	if (family === "conversion") {
		const [kind, id] = (signal.subjectKey ?? signal.metric).split(":");
		return `conversion:${id ? `${kind}:${id}` : kind}`;
	}
	if (family === "error" || family === "vital") {
		return `${family}:${signal.entityId ?? signal.subjectKey ?? signal.metric}`;
	}
	if (family === "engagement") {
		return `engagement:${signal.metric}`;
	}
	return `${family}:${signal.subjectKey ?? signal.entityId ?? signal.metric}`;
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
		JSON.stringify(signal.measurementGapRecommendationCandidate ?? null),
		JSON.stringify(signal.reach ?? null),
		signal.detectedAt,
	].join("\u0000");
}

function priority(signal: DetectedSignal): number {
	return (isRegression(signal) ? 0 : 2) + (isDirectSignal(signal) ? 0 : 1);
}

function rankedCandidates(
	signals: DetectedSignal[],
	rankingStrategy: SignalRankingStrategy
): Candidate[] {
	const stable = [...signals].sort((a, b) => {
		const left = stableIdentity(a);
		const right = stableIdentity(b);
		return left < right ? -1 : left > right ? 1 : 0;
	});
	const seen = new Set<string>();
	const candidates: Candidate[] = [];
	for (const [index, signal] of rankSignals(
		stable,
		rankingStrategy
	).entries()) {
		const key = signalKeyForDetectedSignal(signal);
		const family = signalFamily(signal);
		candidates.push({
			duplicate: seen.has(key),
			family,
			group: signalGroup(signal, family),
			key,
			rank: index + 1,
			signal,
		});
		seen.add(key);
	}
	return candidates;
}

/** Selects a small deterministic portfolio without mutating detector output. */
export function planCoveragePortfolioWithTrace(
	signals: DetectedSignal[],
	options: CoveragePortfolioOptions
): CoveragePortfolioPlan {
	const allCandidates = rankedCandidates(
		signals,
		options.rankingStrategy ?? "current"
	);
	const candidates = allCandidates.filter((candidate) => !candidate.duplicate);
	const selected: Candidate[] = [];
	const usedFamilies = new Set<SignalFamily>();
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
				!(
					usedKeys.has(candidate.key) ||
					usedGroups.has(candidate.group) ||
					options.excludedSignalKeys?.has(candidate.key) ||
					options.unqualifiedSignalKeys?.has(candidate.key)
				)
		);
		const preferred = options.preferredSignalKeys
			? available.filter((candidate) =>
					options.preferredSignalKeys?.has(candidate.key)
				)
			: available;
		const pool = preferred.length > 0 ? preferred : available;
		const top = pool[0];
		if (!top) {
			break;
		}
		const topPriority = priority(top.signal);
		add(
			pool.find(
				(candidate) =>
					priority(candidate.signal) === topPriority &&
					!usedFamilies.has(candidate.family)
			) ?? top
		);
	}

	const selectedGroups = new Set(selected.map((candidate) => candidate.group));
	const hasPreferredCandidate = Boolean(
		options.preferredSignalKeys &&
			candidates.some((candidate) =>
				options.preferredSignalKeys?.has(candidate.key)
			)
	);
	return {
		entries: allCandidates.map((candidate) => {
			const selectedAt = selected.indexOf(candidate);
			if (selectedAt >= 0) {
				return {
					family: candidate.family,
					omittedFor: [],
					rank: candidate.rank,
					selectedAt: selectedAt + 1,
					signal: candidate.signal,
				};
			}
			const omittedFor: CoveragePortfolioOmission[] = [];
			if (candidate.duplicate) {
				omittedFor.push("duplicate");
			} else if (options.unqualifiedSignalKeys?.has(candidate.key)) {
				omittedFor.push("unqualified");
			} else if (options.excludedSignalKeys?.has(candidate.key)) {
				omittedFor.push("overlap_covered");
			} else {
				if (selectedGroups.has(candidate.group)) {
					omittedFor.push("same_cluster");
				}
				if (
					hasPreferredCandidate &&
					!options.preferredSignalKeys?.has(candidate.key)
				) {
					omittedFor.push("cooling");
				}
				if (selected.length >= coveragePortfolioLimit(options.reason)) {
					omittedFor.push("portfolio_limit");
				}
				if (omittedFor.length === 0) {
					omittedFor.push("lower_priority");
				}
			}
			return {
				family: candidate.family,
				omittedFor,
				rank: candidate.rank,
				selectedAt: null,
				signal: candidate.signal,
			};
		}),
		selected: selected.map((candidate) => candidate.signal),
	};
}

export function planCoveragePortfolio(
	signals: DetectedSignal[],
	options: CoveragePortfolioOptions
): DetectedSignal[] {
	return planCoveragePortfolioWithTrace(signals, options).selected;
}
