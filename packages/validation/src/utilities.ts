import {
	DURATION_REGEX,
	LANGUAGE_REGEX,
	RESOLUTION_SIMPLE_REGEX,
	SESSION_ID_REGEX,
	TIMEZONE_REGEX,
} from "./regexes";

export const SAFE_HEADERS = new Set([
	"user-agent",
	"referer",
	"accept-language",
	"accept-encoding",
	"accept",
	"origin",
	"host",
	"content-type",
	"content-length",
	"cf-connecting-ip",
	"cf-ipcountry",
	"cf-ray",
	"x-forwarded-for",
	"x-real-ip",
]);

export function parseDurationToSeconds(duration: string): number {
	const match = DURATION_REGEX.exec(duration);
	if (!match) {
		throw new Error(`Invalid duration format: ${duration}`);
	}

	const num = Number.parseInt(match[1], 10);
	const unit = match[2];

	const multiplier = {
		s: 1,
		m: 60,
		h: 3600,
		d: 86_400,
	}[unit];

	if (multiplier === undefined) {
		throw new Error(`Invalid duration format: ${duration}`);
	}

	return num * multiplier;
}

export function sanitizeString(input: unknown, maxLength?: number): string {
	if (typeof input !== "string") {
		return "";
	}

	const actualMaxLength = maxLength ?? 2048;

	return input
		.trim()
		.slice(0, actualMaxLength)
		.split("")
		.filter((char) => {
			const code = char.charCodeAt(0);
			return !(
				code <= 8 ||
				code === 11 ||
				code === 12 ||
				(code >= 14 && code <= 31) ||
				code === 127
			);
		})
		.join("")
		.replace(/[<>'"&]/g, "")
		.replace(/\s+/g, " ");
}

export function validateTimezone(timezone: unknown): string {
	if (typeof timezone !== "string") {
		return "";
	}

	const sanitized = sanitizeString(timezone, 64);

	if (!TIMEZONE_REGEX.test(sanitized)) {
		return "";
	}

	return sanitized;
}

export function validateTimezoneOffset(offset: unknown): number | null {
	if (typeof offset === "number") {
		if (offset >= -12 * 60 && offset <= 14 * 60) {
			return Math.round(offset);
		}
		return null;
	}
	return null;
}

export function validateLanguage(language: unknown): string {
	if (typeof language !== "string") {
		return "";
	}

	const sanitized = sanitizeString(language, 35);

	if (!LANGUAGE_REGEX.test(sanitized)) {
		return "";
	}

	return sanitized.toLowerCase();
}

export function validateSessionId(sessionId: unknown): string {
	if (typeof sessionId !== "string") {
		return "";
	}

	const sanitized = sanitizeString(sessionId, 128);

	if (!SESSION_ID_REGEX.test(sanitized)) {
		return "";
	}

	return sanitized;
}

export function validateUtmParameter(utm: unknown): string {
	if (typeof utm !== "string") {
		return "";
	}

	return sanitizeString(utm, 512);
}

export function validateNumeric(
	value: unknown,
	min = 0,
	max = Number.MAX_SAFE_INTEGER
): number | null {
	if (
		typeof value === "number" &&
		!Number.isNaN(value) &&
		Number.isFinite(value)
	) {
		const rounded = Math.round(value);
		return rounded >= min && rounded <= max ? rounded : null;
	}
	if (typeof value === "string") {
		const parsed = Number.parseFloat(value);
		if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
			const rounded = Math.round(parsed);
			return rounded >= min && rounded <= max ? rounded : null;
		}
	}
	return null;
}

export function validateUrl(url: unknown): string {
	if (typeof url !== "string") {
		return "";
	}

	const sanitized = sanitizeString(url);

	try {
		const parsed = new URL(sanitized);
		if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
			return "";
		}
		return parsed.toString();
	} catch {
		return "";
	}
}

export function filterSafeHeaders(
	headers: Record<string, string | string[] | undefined>
): Record<string, string> {
	const safeHeaders: Record<string, string> = {};

	for (const [key, value] of Object.entries(headers)) {
		const lowerKey = key.toLowerCase();
		if (SAFE_HEADERS.has(lowerKey) && value) {
			const stringValue = Array.isArray(value) ? value[0] : value;
			if (stringValue) {
				safeHeaders[lowerKey] = sanitizeString(stringValue, 255);
			}
		}
	}

	return safeHeaders;
}

export function validateProperties(
	properties: unknown
): Record<string, unknown> {
	if (
		!properties ||
		typeof properties !== "object" ||
		Array.isArray(properties)
	) {
		return {};
	}

	const validated: Record<string, unknown> = {};
	const props = properties as Record<string, unknown>;

	const keys = Object.keys(props).slice(0, 100);

	for (const key of keys) {
		const sanitizedKey = sanitizeString(key, 128);
		if (!sanitizedKey) {
			continue;
		}

		const value = props[key];

		if (typeof value === "string") {
			validated[sanitizedKey] = sanitizeString(value);
		} else if (typeof value === "number") {
			validated[sanitizedKey] = validateNumeric(value);
		} else if (typeof value === "boolean") {
			validated[sanitizedKey] = value;
		} else if (value === null || value === undefined) {
			validated[sanitizedKey] = null;
		}
	}

	return validated;
}

export function validatePayloadSize(
	data: unknown,
	maxSize = 1024 * 1024
): boolean {
	try {
		const serialized = JSON.stringify(data);
		return serialized.length <= maxSize;
	} catch {
		return false;
	}
}

export function validatePerformanceMetric(value: unknown): number | undefined {
	return validateNumeric(value, 0, 300_000) as number | undefined;
}

export function validateScreenResolution(resolution: unknown): string {
	if (typeof resolution !== "string") {
		return "";
	}

	const sanitized = sanitizeString(resolution, 32);

	return RESOLUTION_SIMPLE_REGEX.test(sanitized) ? sanitized : "";
}

export function validateViewportSize(viewport: unknown): string {
	return validateScreenResolution(viewport);
}

export function validateScrollDepth(depth: unknown): number | null {
	return validateNumeric(depth, 0, 100);
}

export function validatePageCount(count: unknown): number | null {
	return validateNumeric(count, 1, 10_000);
}

export function validateInteractionCount(count: unknown): number | null {
	return validateNumeric(count, 0, 100_000);
}

export function validateExitIntent(intent: unknown): number {
	const validated = validateNumeric(intent, 0, 1);
	return validated !== null ? validated : 0;
}
