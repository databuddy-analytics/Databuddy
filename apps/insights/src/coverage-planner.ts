import type { DetectedSignal } from "./detection";
import {
	isDirectSignal,
	isRegression,
	rankSignals,
	signalKeyForDetectedSignal,
} from "./investigation";

const PORTFOLIO_LIMIT = { manual: 3, scheduled: 2 } as const;
const TRAFFIC_METRICS = new Set(["visitors", "sessions", "pageviews"]);

export type CoveragePortfolioReason = keyof typeof PORTFOLIO_LIMIT;

export interface CoveragePortfolioOptions {
	/** An exact open investigation to remeasure before newly detected work. */
	dueSignalKey?: string | null;
	reason: CoveragePortfolioReason;
}

type SignalFamily =
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
	family: SignalFamily;
	group: string;
	key: string;
	signal: DetectedSignal;
}

export function coveragePortfolioLimit(
	reason: CoveragePortfolioReason
): number {
	return PORTFOLIO_LIMIT[reason];
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
		signal.detectedAt,
	].join("\u0000");
}

function priority(signal: DetectedSignal): number {
	return (isRegression(signal) ? 0 : 2) + (isDirectSignal(signal) ? 0 : 1);
}

function isPositive(signal: DetectedSignal): boolean {
	return signal.current !== signal.baseline && !isRegression(signal);
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
		const family = signalFamily(signal);
		candidates.push({
			family,
			group: signalGroup(signal, family),
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
	const usedFamilies = new Set<SignalFamily>();
	const usedGroups = new Set<string>();
	const usedKeys = new Set<string>();
	const allowMultiplePositive = candidates.every((item) =>
		isPositive(item.signal)
	);
	let hasPositive = false;

	const add = (candidate: Candidate) => {
		selected.push(candidate);
		usedFamilies.add(candidate.family);
		usedGroups.add(candidate.group);
		usedKeys.add(candidate.key);
		hasPositive ||= isPositive(candidate.signal);
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
				!(usedKeys.has(candidate.key) || usedGroups.has(candidate.group)) &&
				(allowMultiplePositive || !hasPositive || !isPositive(candidate.signal))
		);
		const top = available[0];
		if (!top) {
			break;
		}
		const topPriority = priority(top.signal);
		add(
			available.find(
				(candidate) =>
					priority(candidate.signal) === topPriority &&
					!usedFamilies.has(candidate.family)
			) ?? top
		);
	}

	return selected.map((candidate) => candidate.signal);
}
