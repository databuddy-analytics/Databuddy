import { dayjs } from "@databuddy/ui";
import type { Insight } from "@/lib/insight-types";

const PATH_IN_TEXT = /\/[a-zA-Z0-9][a-zA-Z0-9/_-]*/g;

/** Human-readable comparison window when DB persisted period fields exist. */
export function formatComparisonWindow(insight: Insight): string | null {
	const {
		currentPeriodFrom,
		currentPeriodTo,
		previousPeriodFrom,
		previousPeriodTo,
		timezone,
	} = insight;
	if (
		!(
			currentPeriodFrom &&
			currentPeriodTo &&
			previousPeriodFrom &&
			previousPeriodTo
		)
	) {
		return null;
	}
	const tz = timezone ? ` · ${timezone}` : "";
	return `Previous ${previousPeriodFrom}–${previousPeriodTo} vs current ${currentPeriodFrom}–${currentPeriodTo}${tz}`;
}

/** Short line for source + recency. */
export function formatInsightFreshness(insight: Insight): string {
	if (insight.status === "resolved") {
		const resolvedLabel =
			insight.resolvedReason === "stale" ? "Archived" : "Recovered";
		if (insight.resolvedAt) {
			const d = dayjs(insight.resolvedAt);
			if (d.isValid()) {
				return `${resolvedLabel} · ${d.fromNow()}`;
			}
		}
		return resolvedLabel;
	}
	if (insight.insightSource === "ai") {
		return "Latest analysis";
	}
	if (insight.createdAt) {
		const d = dayjs(insight.createdAt);
		if (d.isValid()) {
			return `From history · ${d.fromNow()}`;
		}
	}
	return "From history";
}

export function formatInsightResolutionLabel(insight: Insight): string | null {
	if (insight.status !== "resolved") {
		return null;
	}
	return insight.resolvedReason === "stale" ? "Archived" : "Recovered";
}

export function formatInsightResolutionDescription(
	insight: Insight
): string | null {
	if (insight.status !== "resolved") {
		return null;
	}
	if (insight.resolvedReason === "stale") {
		return "This signal aged out of the active queue.";
	}
	return "This signal stopped firing in a later analysis run.";
}

export function buildInsightShareUrl(insightId: string): string {
	if (typeof window === "undefined") {
		return "";
	}
	const url = new URL(window.location.href);
	url.hash = `insight-${insightId}`;
	return url.toString();
}

export function extractInsightPathHint(insight: Insight): string | null {
	const text = `${insight.title}\n${insight.description}\n${insight.suggestion}`;
	const matches = text.match(PATH_IN_TEXT);
	if (!matches?.length) {
		return null;
	}
	const sorted = [...matches].sort((a, b) => b.length - a.length);
	return sorted[0] ?? null;
}

/** Structured prompt for pasting into an AI agent: issue, analysis, data, and recommendation. */
export function buildInsightAgentCopyText(insight: Insight): string {
	const siteLine = `${insight.websiteName ?? insight.websiteDomain} (${insight.websiteDomain})`;
	const windowLine = formatComparisonWindow(insight);
	const pathHint = extractInsightPathHint(insight);

	const lines: string[] = [
		"Paste the sections below into an AI assistant or agent. Ask it to help validate the analysis and implement the recommended fix.",
		"",
		"## Site",
		siteLine,
		"",
		"## Issue",
		insight.title,
		"",
		"## Analysis (what changed and why it matters — evidence from the data)",
		insight.description,
		"",
		"## Recommended action",
		insight.suggestion,
		"",
		"## Metadata",
		`Insight type: ${insight.type.replaceAll("_", " ")} · Severity: ${insight.severity} · Priority: ${insight.priority}/10 · Sentiment: ${insight.sentiment}`,
	];

	if (insight.changePercent !== undefined) {
		const pct = insight.changePercent;
		const sign = pct > 0 ? "+" : "";
		lines.push(`Week-over-week change (approx.): ${sign}${pct}%`);
	}
	if (windowLine) {
		lines.push(`Comparison window: ${windowLine}`);
	}
	if (pathHint) {
		lines.push(`Related URL path (for filters or deep links): ${pathHint}`);
	}

	return lines.join("\n");
}
