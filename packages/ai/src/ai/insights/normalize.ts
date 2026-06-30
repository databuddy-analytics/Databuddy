import type { WebPeriodData } from "./types";

const PATH_SEGMENT_ALNUM = /^[a-zA-Z0-9_-]+$/;
const DIGIT_CLASS = /\d/;
const LETTER_CLASS = /[a-zA-Z]/;
const LOWER_CLASS = /[a-z]/;
const UPPER_CLASS = /[A-Z]/;
const DASH_UNDERSCORE_SPLIT = /[-_]/g;

function humanizeMetricKey(key: string): string {
	return key.replaceAll("_", " ").replaceAll(/\b\w/g, (c) => c.toUpperCase());
}

function formatMetricValue(value: unknown): string {
	if (value === null || value === undefined) {
		return "";
	}
	if (typeof value === "number") {
		return Number.isInteger(value) ? String(value) : value.toFixed(2);
	}
	if (typeof value === "boolean") {
		return value ? "yes" : "no";
	}
	if (typeof value === "string") {
		return value;
	}
	return JSON.stringify(value);
}

function formatObjectLine(record: Record<string, unknown>): string {
	return Object.entries(record)
		.filter(([, v]) => v !== null && v !== undefined)
		.map(([k, v]) => `${humanizeMetricKey(k)}: ${formatMetricValue(v)}`)
		.join(" | ");
}

function formatRowsBlock(
	rows: Record<string, unknown>[],
	sectionTitle: string
): string {
	if (rows.length === 0) {
		return "";
	}
	const lines = rows.map((row) => formatObjectLine(row));
	return `### ${sectionTitle}\n${lines.join("\n")}`;
}

function isOpaquePathSegment(segment: string): boolean {
	if (segment.length < 8) {
		return false;
	}
	if (!PATH_SEGMENT_ALNUM.test(segment)) {
		return false;
	}
	const hasDigit = DIGIT_CLASS.test(segment);
	const hasLetter = LETTER_CLASS.test(segment);
	if (segment.length >= 16) {
		return hasLetter || hasDigit;
	}
	return hasDigit || (LOWER_CLASS.test(segment) && UPPER_CLASS.test(segment));
}

function titleCasePathWords(segment: string): string {
	return segment
		.replaceAll(DASH_UNDERSCORE_SPLIT, " ")
		.split(" ")
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
		.join(" ");
}

function humanizePagePathForPrompt(rawPath: string): string {
	const path = rawPath.trim() || "/";
	if (path === "/" || path === "") {
		return "Home";
	}
	const segments = path.split("/").filter(Boolean);
	const last = segments.at(-1) ?? "";
	if (isOpaquePathSegment(last) && segments.length >= 2) {
		const parent = segments.at(-2) ?? "";
		if (parent && !isOpaquePathSegment(parent)) {
			return `${titleCasePathWords(parent)} page`;
		}
		return "Page";
	}
	if (isOpaquePathSegment(last)) {
		return "Page";
	}
	return `${titleCasePathWords(last)} page`;
}

function formatTopPagesBlock(rows: Record<string, unknown>[]): string {
	if (rows.length === 0) {
		return "";
	}
	const lines = rows.map((row) => {
		const rawName =
			typeof row.name === "string" ? row.name : String(row.name ?? "");
		const human = humanizePagePathForPrompt(rawName);
		const base = formatObjectLine(row);
		return `${base} | Human label (use in titles, not raw paths with IDs): ${human}`;
	});
	return `### Top Pages\n${lines.join("\n")}`;
}

export function formatLegacyWebDataForPrompt(
	current: WebPeriodData,
	previous: WebPeriodData,
	currentRange: { from: string; to: string },
	previousRange: { from: string; to: string }
): string {
	const sections: string[] = [];

	sections.push(
		`## Current Period (${currentRange.from} to ${currentRange.to})`
	);
	sections.push(formatRowsBlock(current.summary, "Summary"));
	if (current.topPages.length > 0) {
		sections.push(formatTopPagesBlock(current.topPages));
	}
	if (current.errorSummary.length > 0) {
		sections.push(formatRowsBlock(current.errorSummary, "Errors"));
	}
	if (current.topReferrers.length > 0) {
		sections.push(formatRowsBlock(current.topReferrers, "Top Referrers"));
	}
	if (current.countries.length > 0) {
		sections.push(
			formatRowsBlock(current.countries, "Countries (by visitors)")
		);
	}
	if (current.browsers.length > 0) {
		sections.push(formatRowsBlock(current.browsers, "Browsers (by visitors)"));
	}
	if (current.vitalsOverview.length > 0) {
		sections.push(
			formatRowsBlock(
				current.vitalsOverview,
				"Web Vitals (p75 and samples; use for performance insights when samples are meaningful)"
			)
		);
	}

	sections.push(
		`\n## Previous Period (${previousRange.from} to ${previousRange.to})`
	);
	sections.push(formatRowsBlock(previous.summary, "Summary"));
	if (previous.topPages.length > 0) {
		sections.push(formatTopPagesBlock(previous.topPages));
	}
	if (previous.errorSummary.length > 0) {
		sections.push(formatRowsBlock(previous.errorSummary, "Errors"));
	}
	if (previous.topReferrers.length > 0) {
		sections.push(formatRowsBlock(previous.topReferrers, "Top Referrers"));
	}
	if (previous.countries.length > 0) {
		sections.push(
			formatRowsBlock(previous.countries, "Countries (by visitors)")
		);
	}
	if (previous.browsers.length > 0) {
		sections.push(formatRowsBlock(previous.browsers, "Browsers (by visitors)"));
	}
	if (previous.vitalsOverview.length > 0) {
		sections.push(
			formatRowsBlock(
				previous.vitalsOverview,
				"Web Vitals (p75 and samples; use for performance insights when samples are meaningful)"
			)
		);
	}

	return sections.filter(Boolean).join("\n\n");
}
