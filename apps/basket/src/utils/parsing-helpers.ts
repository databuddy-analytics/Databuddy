import type { z } from "zod";
import { logBlockedTraffic } from "../lib/blocked-traffic";
import { record, setAttributes } from "../lib/tracing";
import { VALIDATION_LIMITS } from "./validation";

type ParseResult<T> =
	| { success: true; data: T }
	| { success: false; error: { issues: z.ZodIssue[] } };

/**
 * Validates event schema in production, skips validation in development
 */
export function validateEventSchema<T>(
	schema: z.ZodSchema<T>,
	event: unknown,
	request: Request,
	query: unknown,
	clientId: string
): Promise<ParseResult<T>> {
	return record("validateEventSchema", async () => {
		if (process.env.NODE_ENV === "development") {
			return { success: true, data: event as T };
		}

		const parseResult = await schema.safeParseAsync(event);

		if (!parseResult.success) {
			logBlockedTraffic(
				request,
				event,
				query,
				"invalid_schema",
				"Schema Validation",
				undefined,
				clientId
			);
			setAttributes({
				"validation.failed": true,
				"validation.reason": "invalid_schema",
				"schema.error_count": parseResult.error.issues.length,
			});
			return {
				success: false,
				error: { issues: parseResult.error.issues },
			};
		}

		return parseResult;
	});
}

/**
 * Standard error response for schema validation failures
 */
export function createSchemaErrorResponse(errors: z.ZodIssue[]) {
	return {
		status: "error",
		message: "Invalid event schema",
		errors,
	};
}

/**
 * Standard error response for bot detection
 */
export function createBotDetectedResponse(eventType: string) {
	return {
		status: "error",
		message: "Bot detected",
		eventType,
		error: "ignored",
	};
}

/**
 * Validates timestamp, returns current time if invalid
 */
export function parseTimestamp(timestamp: unknown): number {
	return typeof timestamp === "number" ? timestamp : Date.now();
}

/**
 * Parses properties object to JSON string, defaults to empty object
 */
export function parseProperties(properties: unknown): string {
	return properties ? JSON.stringify(properties) : "{}";
}

/**
 * Creates standardized bot check result
 */
export type BotCheckResult = {
	isBot: boolean;
	response?: {
		status: string;
		message: string;
		eventType: string;
		error?: string;
	};
};

/**
 * Parses and sanitizes event ID, generates UUID if missing
 */
export function parseEventId(
	eventId: unknown,
	generateFn: () => string
): string {
	const sanitizeString = (str: unknown, maxLength: number): string => {
		if (typeof str !== "string") {
			return "";
		}
		return str.slice(0, maxLength);
	};

	const sanitized = sanitizeString(
		eventId,
		VALIDATION_LIMITS.SHORT_STRING_MAX_LENGTH
	);
	return sanitized || generateFn();
}
