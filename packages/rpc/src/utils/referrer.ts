import { referrers } from "@databuddy/shared/lists/referrers";

export interface ReferrerInfo {
	type: string;
	name: string;
	url: string;
	domain: string;
};

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
		const url = new URL(referrerUrl);
		const hostname = url.hostname;

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

		const referrerMatch = getReferrerByDomain(hostname);

		if (referrerMatch) {
			return {
				type: referrerMatch.type,
				name: referrerMatch.name,
				url: referrerUrl,
				domain: hostname,
			};
		}

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

		return {
			type: "unknown",
			name: hostname,
			url: referrerUrl,
			domain: hostname,
		};
	} catch {
		return {
			type: "direct",
			name: "Direct",
			url: referrerUrl,
			domain: "",
		};
	}
}

function getReferrerByDomain(
	domain: string
): { type: string; name: string } | null {
	if (domain in referrers) {
		return referrers[domain];
	}

	const domainParts = domain.split(".");
	for (let i = 1; i < domainParts.length - 1; i += 1) {
		const partialDomain = domainParts.slice(i).join(".");
		if (partialDomain in referrers) {
			return referrers[partialDomain];
		}
	}

	return null;
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

		if (
			url.hostname === "localhost" ||
			url.hostname.includes("127.0.0.1") ||
			(websiteHostname && url.hostname === websiteHostname)
		) {
			return true;
		}

		return false;
	} catch {
		return false;
	}
}
