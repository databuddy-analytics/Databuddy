/**
 * Universal Validation and Sanitization Utilities
 *
 * Provides reusable validation and sanitization functions for analytics data.
 */

import { z } from "zod/v4";

export const VALIDATION_LIMITS = {
	STRING_MAX_LENGTH: 2048,
	SHORT_STRING_MAX_LENGTH: 255,
	SESSION_ID_MAX_LENGTH: 128,
	SERVICE_MAX_LENGTH: 128,
	ENVIRONMENT_MAX_LENGTH: 128,
	VERSION_MAX_LENGTH: 64,
	HOST_MAX_LENGTH: 512,
	REGION_MAX_LENGTH: 64,
	INSTANCE_ID_MAX_LENGTH: 128,
	TRACE_ID_MAX_LENGTH: 128,
	SPAN_ID_MAX_LENGTH: 128,
	PARENT_SPAN_ID_MAX_LENGTH: 128,
	STATUS_MESSAGE_MAX_LENGTH: 2048,
	REQUEST_ID_MAX_LENGTH: 128,
	CORRELATION_ID_MAX_LENGTH: 128,
	USER_ID_MAX_LENGTH: 128,
	TENANT_ID_MAX_LENGTH: 128,
	NAME_MAX_LENGTH: 128,
	BATCH_MAX_SIZE: 100,
	PAYLOAD_MAX_SIZE: 1024 * 1024, // 1MB
	BATCH_PAYLOAD_MAX_SIZE: 5 * 1024 * 1024, // 5MB
	UTM_MAX_LENGTH: 512,
	LANGUAGE_MAX_LENGTH: 35, // RFC 5646 max length
	TIMEZONE_MAX_LENGTH: 64,
	PATH_MAX_LENGTH: 2048,
	TEXT_MAX_LENGTH: 2048,
	EVENT_ID_MAX_LENGTH: 512,
} as const;

export const FILTERED_ERROR_MESSAGES = new Set([
	"Script error.",
	"Non-Error promise rejection captured",
	"ResizeObserver loop limit exceeded",
	"Loading chunk",
	"ChunkLoadError",
]);

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

/**
 * Sanitizes a string by removing potentially dangerous characters
 */
export function sanitizeString(input: unknown, maxLength?: number): string {
	if (typeof input !== "string") {
		return "";
	}

	const actualMaxLength = maxLength ?? VALIDATION_LIMITS.STRING_MAX_LENGTH;

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
		.replace(/<[^>]*>/g, "") // Remove HTML tags
		.replace(/[<>'"&]/g, "")
		.replace(/\s+/g, " ");
}

const timezoneRegex = /^[A-Za-z0-9_/+-]{1,64}$/;
const languageRegex = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;
const sessionIdRegex = /^[a-zA-Z0-9_-]+$/;
const resolutionRegex = /^\d{1,5}x\d{1,5}$/;

/**
 * Validates and sanitizes timezone strings
 */
export function validateTimezone(timezone: unknown): string {
	if (typeof timezone !== "string") {
		return "";
	}

	const sanitized = sanitizeString(
		timezone,
		VALIDATION_LIMITS.TIMEZONE_MAX_LENGTH
	);

	if (!timezoneRegex.test(sanitized)) {
		return "";
	}

	return sanitized;
}

/**
 * Validates timezone offset
 */
export function validateTimezoneOffset(offset: unknown): number | null {
	if (typeof offset === "number") {
		if (offset >= -12 * 60 && offset <= 14 * 60) {
			return Math.round(offset);
		}
		return null;
	}
	return null;
}

/**
 * Validates and sanitizes language strings
 */
export function validateLanguage(language: unknown): string {
	if (typeof language !== "string") {
		return "";
	}

	const sanitized = sanitizeString(
		language,
		VALIDATION_LIMITS.LANGUAGE_MAX_LENGTH
	);

	if (!languageRegex.test(sanitized)) {
		return "";
	}

	return sanitized.toLowerCase();
}

/**
 * Validates session ID format
 */
export function validateSessionId(sessionId: unknown): string {
	if (typeof sessionId !== "string") {
		return "";
	}

	const sanitized = sanitizeString(
		sessionId,
		VALIDATION_LIMITS.SESSION_ID_MAX_LENGTH
	);

	if (!sessionIdRegex.test(sanitized)) {
		return "";
	}

	return sanitized;
}

/**
 * Validates and sanitizes UTM parameters
 */
export function validateUtmParameter(utm: unknown): string {
	if (typeof utm !== "string") {
		return "";
	}

	return sanitizeString(utm, VALIDATION_LIMITS.UTM_MAX_LENGTH);
}

/**
 * Validates numeric values with range checking
 */
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

/**
 * Validates URL format
 */
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

/**
 * Filters and validates request headers
 */
export function filterSafeHeaders(
	headers: Record<string, string | string[] | undefined>
): Record<string, string> {
	const safeHeaders: Record<string, string> = {};

	for (const [key, value] of Object.entries(headers)) {
		const lowerKey = key.toLowerCase();
		if (SAFE_HEADERS.has(lowerKey) && value) {
			const stringValue = Array.isArray(value) ? value[0] : value;
			if (stringValue) {
				safeHeaders[lowerKey] = sanitizeString(
					stringValue,
					VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
				);
			}
		}
	}

	return safeHeaders;
}

/**
 * Validates analytics properties object
 */
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

/**
 * Comprehensive event validation schema
 */
export const analyticsEventSchema = z.object({
	type: z.enum(["track"]),
	payload: z.object({
		name: z.string().max(VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH).optional(),
		anonymousId: z
			.string()
			.max(VALIDATION_LIMITS.SESSION_ID_MAX_LENGTH)
			.optional(),
		properties: z.record(z.string(), z.unknown()).optional(),
		property: z
			.string()
			.max(VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH)
			.optional(),
		value: z.number().finite().optional(),
	}),
});

export const batchAnalyticsEventSchema = z
	.array(analyticsEventSchema)
	.max(VALIDATION_LIMITS.BATCH_MAX_SIZE);

/**
 * Validates payload size
 */
export function validatePayloadSize(
	data: unknown,
	maxSize = VALIDATION_LIMITS.PAYLOAD_MAX_SIZE
): boolean {
	try {
		const serialized = JSON.stringify(data);
		return serialized.length <= maxSize;
	} catch {
		return false;
	}
}

/**
 * Performance metrics validation
 */
export function validatePerformanceMetric(value: unknown): number | undefined {
	const result = validateNumeric(value, 0, 300_000);
	return result === null ? undefined : result;
}

/**
 * Validates screen resolution format
 */
export function validateScreenResolution(resolution: unknown): string {
	if (typeof resolution !== "string") {
		return "";
	}

	const sanitized = sanitizeString(resolution, 32);

	return resolutionRegex.test(sanitized) ? sanitized : "";
}

/**
 * Validates viewport size format
 */
export function validateViewportSize(viewport: unknown): string {
	return validateScreenResolution(viewport);
}

/**
 * Validates scroll depth percentage
 */
export function validateScrollDepth(depth: unknown): number | null {
	return validateNumeric(depth, 0, 100);
}

/**
 * Validates page count
 */
export function validatePageCount(count: unknown): number | null {
	return validateNumeric(count, 1, 10_000);
}

/**
 * Validates interaction count
 */
export function validateInteractionCount(count: unknown): number | null {
	return validateNumeric(count, 0, 100_000);
}

/**
 * Validates exit intent (0 or 1)
 */
export function validateExitIntent(intent: unknown): number {
	const validated = validateNumeric(intent, 0, 1);
	return validated !== null ? validated : 0;
}
