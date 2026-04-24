import { UAParser } from "ua-parser-js";
import type { ParsedUserAgent } from "./types";
import { UA_BOT_NAMES, UA_PATTERNS, UA_REGEX } from "./ua-patterns";

export function parseUserAgent(userAgent: string): ParsedUserAgent {
	if (!userAgent) {
		return { raw: "" };
	}

	try {
		const parser = new UAParser(userAgent);
		const result = parser.getResult();

		return {
			browserName: result.browser.name || undefined,
			browserVersion: result.browser.version || undefined,
			osName: result.os.name || undefined,
			osVersion: result.os.version || undefined,
			deviceType: result.device.type || undefined,
			deviceBrand: result.device.vendor || undefined,
			deviceModel: result.device.model || undefined,
			raw: userAgent,
		};
	} catch {
		return { raw: userAgent };
	}
}

export function extractBotName(userAgent: string): string | undefined {
	if (!userAgent) {
		return;
	}

	const lower = userAgent.toLowerCase();
	for (const [pattern, name] of Object.entries(UA_BOT_NAMES)) {
		if (lower.includes(pattern)) {
			return name;
		}
	}

	try {
		const parser = new UAParser(userAgent);
		return parser.getBrowser().name || undefined;
	} catch {
		return;
	}
}

export function matchCategory(userAgent: string): string | null {
	if (!userAgent) {
		return null;
	}
	const lower = userAgent.toLowerCase();
	for (const cat of Object.keys(UA_PATTERNS)) {
		const literals = UA_PATTERNS[cat];
		if (literals.some((p) => lower.includes(p))) {
			return cat;
		}
		const regexes = UA_REGEX[cat];
		if (regexes?.some((r) => r.test(userAgent))) {
			return cat;
		}
	}
	return null;
}
