/**
 * Referrer Analysis Utilities
 *
 * Functions for analyzing referrer URLs to extract information about traffic sources.
 */

import { referrers } from "@databuddy/shared/lists/referrers";

export interface ReferrerInfo {
	type: string;
	name: string;
	url: string;
	domain: string;
}

/**
 * Parse a referrer URL to identify its source
 */
export function parseReferrer(
	referrerUrl: string | null | undefined,
	currentDomain?: string
): ReferrerInfo {
	if (!referrerUrl) {
		return {
			type: "direct",
			name: "Direct",
			url: "",
			domain: "",
		};
	}

	try {
		// Parse URL to get hostname
		const url = new URL(referrerUrl);
		const hostname = url.hostname;

		// If the referrer is from the same domain as the current site, treat it as direct traffic
		if (
			currentDomain &&
			(hostname === currentDomain || hostname.endsWith(`.${currentDomain}`))
		) {
			return {
				type: "direct",
				name: "Direct",
				url: "",
				domain: "",
			};
		}

		// Try to match against known referrers
		const referrerMatch = getReferrerByDomain(hostname);

		if (referrerMatch) {
			return {
				type: referrerMatch.type,
				name: referrerMatch.name,
				url: referrerUrl,
				domain: hostname,
			};
		}

		// Try to identify type by URL pattern
		if (
			url.searchParams.has("q") ||
			url.searchParams.has("query") ||
			url.searchParams.has("search")
		) {
			return {
				type: "search",
				name: hostname,
				url: referrerUrl,
				domain: hostname,
			};
		}

		// Default to unknown with domain name
		return {
			type: "unknown",
			name: hostname,
			url: referrerUrl,
			domain: hostname,
		};
	} catch {
		// If URL is invalid, treat as direct traffic
		return {
			type: "direct",
			name: "Direct",
			url: referrerUrl,
			domain: "",
		};
	}
}

/**
 * Find a referrer by domain in the referrers database
 */
function getReferrerByDomain(
	domain: string
): { type: string; name: string } | null {
	// Check exact match first
	if (domain in referrers) {
		return referrers[domain];
	}

	// Try to match with domain parts (e.g., subdomain.example.com might match example.com)
	const domainParts = domain.split(".");
	for (let i = 1; i < domainParts.length - 1; i++) {
		const partialDomain = domainParts.slice(i).join(".");
		if (partialDomain in referrers) {
			return referrers[partialDomain];
		}
	}

	return null;
}

/**
 * Categorize referrer sources into main categories
 */
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
		case "direct":
			return "Direct";
		default:
			return "Other";
	}
}

export function isInternalReferrer(
	referrerUrl: string,
	websiteHostname?: string
): boolean {
	if (!referrerUrl || referrerUrl === "direct") {
		return false;
	}

	try {
		const url = new URL(referrerUrl);

		// Check if it's localhost or contains the same hostname
		if (
			url.hostname === "localhost" ||
			url.hostname.includes("127.0.0.1") ||
			(websiteHostname && url.hostname === websiteHostname)
		) {
			return true;
		}

		return false;
	} catch {
		// If URL parsing fails, it's not an internal referrer
		return false;
	}
}
