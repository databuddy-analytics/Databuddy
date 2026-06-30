import { referrers } from "../lists/referrers";

export interface ReferrerInfo {
	domain: string;
	name: string;
	type: string;
	url: string;
}

const DIRECT_VALUES = new Set(["", "direct", "(direct)", "none"]);
const PROTOCOL_PREFIX_REGEX = /^https?:\/\//i;
const WHITESPACE_REGEX = /\s/;
const WWW_PREFIX_REGEX = /^www\./;

function directReferrer(url = ""): ReferrerInfo {
	return {
		type: "direct",
		name: "Direct",
		url,
		domain: "",
	};
}

function isDirectValue(value: string): boolean {
	return DIRECT_VALUES.has(value.trim().toLowerCase());
}

function normalizeHostname(value: string): string {
	return value.trim().toLowerCase().replace(WWW_PREFIX_REGEX, "");
}

function normalizeCurrentDomain(value?: string | null): string {
	if (!value) {
		return "";
	}
	const trimmed = value.trim().toLowerCase();
	try {
		return normalizeHostname(new URL(trimmed).hostname);
	} catch {
		return normalizeHostname(
			trimmed.replace(PROTOCOL_PREFIX_REGEX, "").split("/")[0] || ""
		);
	}
}

function parseUrlCandidate(value: string): URL | null {
	const hasProtocol = PROTOCOL_PREFIX_REGEX.test(value);
	const hasHostnameShape =
		value.includes(".") || value.toLowerCase().startsWith("localhost");

	if (WHITESPACE_REGEX.test(value) || !(hasProtocol || hasHostnameShape)) {
		return null;
	}

	try {
		return new URL(hasProtocol ? value : `https://${value}`);
	} catch {
		return null;
	}
}

function isInternalHostname(
	hostname: string,
	currentDomain?: string | null
): boolean {
	const domain = normalizeCurrentDomain(currentDomain);
	const normalized = normalizeHostname(hostname);

	return (
		normalized === "localhost" ||
		normalized === "127.0.0.1" ||
		(domain !== "" &&
			(normalized === domain || normalized.endsWith(`.${domain}`)))
	);
}

function lookupReferrer(domain: string): { type: string; name: string } | null {
	const normalized = normalizeHostname(domain);

	if (domain in referrers) {
		return referrers[domain] || null;
	}
	if (normalized in referrers) {
		return referrers[normalized] || null;
	}

	const parts = normalized.split(".");
	for (let i = 1; i < parts.length - 1; i++) {
		const partial = parts.slice(i).join(".");
		if (partial in referrers) {
			return referrers[partial] || null;
		}
	}
	return null;
}

export function parseReferrer(
	referrerUrl: string | null | undefined,
	currentDomain?: string | null
): ReferrerInfo {
	const raw = typeof referrerUrl === "string" ? referrerUrl.trim() : "";

	if (isDirectValue(raw)) {
		return directReferrer();
	}

	const url = parseUrlCandidate(raw);
	if (!url) {
		if (PROTOCOL_PREFIX_REGEX.test(raw)) {
			return directReferrer(raw);
		}
		return {
			type: "unknown",
			name: raw,
			url: raw,
			domain: "",
		};
	}

	const hostname = url.hostname;
	const normalizedHostname = normalizeHostname(hostname);

	if (isInternalHostname(hostname, currentDomain)) {
		return directReferrer(raw);
	}

	const match = lookupReferrer(hostname);
	if (match) {
		return {
			type: match.type,
			name: match.name,
			url: raw,
			domain: normalizedHostname,
		};
	}

	const hasSearchParam =
		url.searchParams.has("q") ||
		url.searchParams.has("query") ||
		url.searchParams.has("search");

	return {
		type: hasSearchParam ? "search" : "unknown",
		name: normalizedHostname,
		url: raw,
		domain: normalizedHostname,
	};
}

export function categorizeReferrer(referrerInfo: ReferrerInfo): string {
	switch (referrerInfo.type) {
		case "search":
			return "Search Engine";
		case "social":
			return "Social Media";
		case "email":
			return "Email";
		case "ads":
			return "Advertising";
		case "ai":
			return "AI";
		case "direct":
			return "Direct";
		default:
			return "Other";
	}
}

export function isInternalReferrer(
	referrerUrl: string,
	websiteHostname?: string | null
): boolean {
	if (!referrerUrl || isDirectValue(referrerUrl)) {
		return false;
	}

	const url = parseUrlCandidate(referrerUrl);
	return url ? isInternalHostname(url.hostname, websiteHostname) : false;
}
