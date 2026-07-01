import type { ParsedInsight } from "../schemas/smart-insights-output";

export interface InsightValidationResult {
	insight: ParsedInsight | null;
	warnings: string[];
}

export interface InsightsValidationResult {
	insights: ParsedInsight[];
	warnings: string[];
}

const LOWER_IS_BETTER_PATTERNS = [
	/error/,
	/affected users/,
	/bounce/,
	/drop[ -]?off/,
	/latency/,
	/inp/,
	/lcp/,
	/fcp/,
	/ttfb/,
	/cls/,
	/load time/,
	/response time/,
	/duration.*p75/,
];

const UP_WORDS =
	/\b(rise|rises|rising|rose|up|increase|increases|increased|climb|climbs|climbed|growth|grew|grows|jump|jumps|jumped)\b/i;
const DOWN_WORDS =
	/\b(fall|falls|falling|fell|down|drop|drops|dropped|decline|declines|declined|decrease|decreases|decreased|slip|slips|slipped)\b/i;
const IMPROVE_WORDS =
	/\b(improve|improves|improved|improving|recover|recovers|recovered|easing|eased|better)\b/i;
const WORSEN_WORDS =
	/\b(worse|worsens|worsened|worsening|degrade|degrades|degraded|regression|broken|sluggish)\b/i;
const SIGNED_UP_NUMBER = /(^|\s)\+\s?\d/;
const ACTION_VERB_PATTERN =
	/\b(inspect|review|compare|segment|drill|open|fix|audit|trace|check|verify|validate|filter|investigate|rollback|hotfix|profile|diagnose)\b/i;
const GENERIC_MONITORING_PATTERN =
	/\b(monitor|keep an eye|watch this|track closely|continue tracking|worth watching|worth monitoring)\b/i;
const HEDGING_TITLE_PATTERN =
	/\b(softened|concerning|slightly|somewhat|may be|could be|appears to|seems to|shows signs|worth watching|potentially)\b/i;
const HARD_CAUSALITY_PATTERN = /\b(caused by|because of|due to|driven by)\b/i;
const ATTRIBUTION_CONTEXT_PATTERN =
	/\b(referrer|source|utm|campaign|channel|twitter|google|bing|toolfolio)\b/i;
const BUSINESS_CLAIM_PATTERN =
	/\b(revenue|roi|roas|cac|ltv|payback|profit|sales|commercial impact)\b/i;
const TECHNICAL_TITLE_JARGON_PATTERN = /\b(INP|LCP|FCP|TTFB|CLS|p75)\b/i;

const MAX_TITLE_CHARS = 80;
const MAX_DESCRIPTION_CHARS = 300;
const MAX_SUGGESTION_CHARS = 300;

function truncateAtSentence(text: string, maxLength: number): string {
	if (text.length <= maxLength) {
		return text;
	}
	const truncated = text.slice(0, maxLength);
	const lastPeriod = truncated.lastIndexOf(". ");
	const lastSemicolon = truncated.lastIndexOf("; ");
	const cut = Math.max(lastPeriod, lastSemicolon);
	if (cut > maxLength * 0.5) {
		return text.slice(0, cut + 1).trim();
	}
	return text.slice(0, maxLength - 1).trim();
}

function roundPercent(value: number): number {
	return Math.round(value * 10) / 10;
}

function metricChange(metric: ParsedInsight["metrics"][number]): number | null {
	if (metric.previous === undefined || metric.previous === 0) {
		return null;
	}
	return ((metric.current - metric.previous) / metric.previous) * 100;
}

function isLowerBetterMetric(label: string): boolean {
	const normalized = label.toLowerCase();
	return LOWER_IS_BETTER_PATTERNS.some((pattern) => pattern.test(normalized));
}

function sentimentForPrimaryMetric(
	metric: ParsedInsight["metrics"][number]
): ParsedInsight["sentiment"] {
	const change = metricChange(metric);
	if (change === null || Math.abs(change) < 0.05) {
		return "neutral";
	}
	const improved = isLowerBetterMetric(metric.label) ? change < 0 : change > 0;
	return improved ? "positive" : "negative";
}

const SENTIMENT_DIVERGENCE_TYPES = new Set([
	"conversion_leak",
	"funnel_regression",
	"channel_concentration",
	"quality_shift",
	"cross_property_dependency",
	"referrer_change",
	"engagement_change",
]);

function allowsSentimentDivergence(insight: ParsedInsight): boolean {
	return SENTIMENT_DIVERGENCE_TYPES.has(insight.type);
}

function typeForDirection(
	type: ParsedInsight["type"],
	sentiment: ParsedInsight["sentiment"]
): ParsedInsight["type"] {
	if (sentiment !== "positive") {
		return type;
	}
	if (type === "error_spike" || type === "new_errors") {
		return "reliability_improved";
	}
	if (type === "vitals_degraded") {
		return "performance_improved";
	}
	if (type === "traffic_drop") {
		return "positive_trend";
	}
	return type;
}

function hasDirectionContradiction(insight: ParsedInsight): boolean {
	if (insight.changePercent === undefined || insight.changePercent === 0) {
		return false;
	}
	const text = insight.title;
	const hasUp = UP_WORDS.test(text) || SIGNED_UP_NUMBER.test(text);
	const hasDown = DOWN_WORDS.test(text);

	if (hasUp && hasDown) {
		return false;
	}
	if (insight.changePercent > 0) {
		return hasDown && !IMPROVE_WORDS.test(text);
	}
	return hasUp && !IMPROVE_WORDS.test(text);
}

function hasSentimentContradiction(insight: ParsedInsight): boolean {
	if (allowsSentimentDivergence(insight)) {
		return false;
	}
	const text = `${insight.title} ${insight.description}`;
	if (insight.sentiment === "positive") {
		return WORSEN_WORDS.test(text) && !IMPROVE_WORDS.test(text);
	}
	if (insight.sentiment === "negative") {
		return IMPROVE_WORDS.test(text) && !WORSEN_WORDS.test(text);
	}
	return false;
}

export function validateInsight(input: ParsedInsight): InsightValidationResult {
	const warnings: string[] = [];
	const primary = input.metrics[0];
	let insight = { ...input };

	if (!primary) {
		return {
			insight: null,
			warnings: [`${input.title}: missing primary metric`],
		};
	}

	const computed = metricChange(primary);
	if (computed !== null) {
		const nextChange = roundPercent(computed);
		if (
			insight.changePercent === undefined ||
			Math.abs(insight.changePercent - nextChange) > 0.2
		) {
			warnings.push(
				`${insight.title}: repaired changePercent from ${insight.changePercent ?? "missing"} to ${nextChange}`
			);
			insight = { ...insight, changePercent: nextChange };
		}
	}

	const metricSentiment = sentimentForPrimaryMetric(primary);
	if (
		metricSentiment !== "neutral" &&
		insight.sentiment !== metricSentiment &&
		!allowsSentimentDivergence(insight)
	) {
		warnings.push(
			`${insight.title}: repaired sentiment from ${insight.sentiment} to ${metricSentiment}`
		);
		insight = { ...insight, sentiment: metricSentiment };
	}

	const nextType = typeForDirection(insight.type, insight.sentiment);
	if (nextType !== insight.type) {
		warnings.push(
			`${insight.title}: repaired type from ${insight.type} to ${nextType}`
		);
		insight = { ...insight, type: nextType };
	}

	if (hasDirectionContradiction(insight)) {
		return {
			insight: null,
			warnings: [
				...warnings,
				`${insight.title}: dropped because title direction contradicts primary metric`,
			],
		};
	}

	if (hasSentimentContradiction(insight)) {
		return {
			insight: null,
			warnings: [
				...warnings,
				`${insight.title}: dropped because narrative sentiment contradicts metric direction`,
			],
		};
	}

	if (TECHNICAL_TITLE_JARGON_PATTERN.test(insight.title)) {
		return {
			insight: null,
			warnings: [
				...warnings,
				`${insight.title}: dropped because title uses technical jargon`,
			],
		};
	}

	if (HEDGING_TITLE_PATTERN.test(insight.title)) {
		return {
			insight: null,
			warnings: [
				...warnings,
				`${insight.title}: dropped because title uses hedging language`,
			],
		};
	}

	if (insight.title.length > MAX_TITLE_CHARS) {
		return {
			insight: null,
			warnings: [
				...warnings,
				`${insight.title}: dropped because title exceeds ${MAX_TITLE_CHARS} chars`,
			],
		};
	}

	if (
		insight.description.length > MAX_DESCRIPTION_CHARS ||
		insight.suggestion.length > MAX_SUGGESTION_CHARS
	) {
		const trimmed = {
			...insight,
			description: truncateAtSentence(
				insight.description,
				MAX_DESCRIPTION_CHARS
			),
			suggestion: truncateAtSentence(insight.suggestion, MAX_SUGGESTION_CHARS),
		};
		if (
			trimmed.description !== insight.description ||
			trimmed.suggestion !== insight.suggestion
		) {
			warnings.push(`${insight.title}: truncated copy to fit limits`);
		}
		insight = trimmed;
	}

	if (
		GENERIC_MONITORING_PATTERN.test(insight.suggestion) &&
		!ACTION_VERB_PATTERN.test(insight.suggestion)
	) {
		return {
			insight: null,
			warnings: [
				...warnings,
				`${insight.title}: dropped because suggestion is generic monitoring advice`,
			],
		};
	}

	const narrative = `${insight.title} ${insight.description} ${insight.suggestion}`;
	if (
		HARD_CAUSALITY_PATTERN.test(narrative) &&
		ATTRIBUTION_CONTEXT_PATTERN.test(narrative) &&
		insight.confidence < 0.9
	) {
		return {
			insight: null,
			warnings: [
				...warnings,
				`${insight.title}: dropped because attribution causality is overstated`,
			],
		};
	}

	if (
		BUSINESS_CLAIM_PATTERN.test(narrative) &&
		!insight.sources.includes("business")
	) {
		return {
			insight: null,
			warnings: [
				...warnings,
				`${insight.title}: dropped because business impact claim lacks business data source`,
			],
		};
	}

	if (insight.rootCause !== undefined && insight.confidence <= 0.5) {
		warnings.push(
			`${insight.title}: stripped rootCause because confidence is ${insight.confidence}`
		);
		insight = { ...insight, rootCause: undefined };
	}

	if (
		insight.type === "deploy_correlation" &&
		insight.evidence &&
		!insight.evidence.some((e) => e.type === "temporal")
	) {
		warnings.push(
			`${insight.title}: deploy_correlation insight lacks temporal evidence`
		);
	}

	const suspiciousMetrics = insight.metrics.filter((m) => {
		if (m.previous === undefined) {
			return false;
		}
		if (
			m.format === "percent" &&
			(m.previous === 100 || m.previous === 0) &&
			m.current !== m.previous
		) {
			return true;
		}
		if (m.current < 0 || (m.previous !== undefined && m.previous < 0)) {
			return true;
		}
		return false;
	});
	if (suspiciousMetrics.length > 0) {
		warnings.push(
			`${insight.title}: suspicious metric values (${suspiciousMetrics.map((m) => `${m.label}: ${m.previous}->${m.current}`).join(", ")})`
		);
	}

	return { insight, warnings };
}

export function validateInsights(
	insights: ParsedInsight[]
): InsightsValidationResult {
	const warnings: string[] = [];
	const valid = insights.flatMap((insight) => {
		const result = validateInsight(insight);
		warnings.push(...result.warnings);
		return result.insight ? [result.insight] : [];
	});
	return { insights: valid, warnings };
}
