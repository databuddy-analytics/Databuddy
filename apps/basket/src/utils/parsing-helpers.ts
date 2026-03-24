import { logBlockedTraffic } from "@lib/blocked-traffic";
import { record } from "@lib/tracing";
import { VALIDATION_LIMITS } from "@utils/validation";
import { log } from "evlog";
import { useLogger } from "evlog/elysia";
import type { z } from "zod";

function mergeValidationWideEvent(context: Record<string, unknown>): void {
	try {
		useLogger().set({ validation: context });
	} catch {
		log.info({ validation: context });
	}
}

type ParseResult<T> =
	| { success: true; data: T }
	| { success: false; error: { issues: z.core.$ZodIssue[] } };

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
			const validationContext = {
				failed: true,
				reason: "invalid_schema" as const,
				issueCount: parseResult.error.issues.length,
			};
			mergeValidationWideEvent(validationContext);
			return {
				success: false,
				error: { issues: parseResult.error.issues },
			};
		}

		return parseResult;
	});
}

/** Per-item batch result when schema validation fails */
export function batchSchemaItemFailure(
	issues: z.core.$ZodIssue[],
	eventType: string,
	eventId: unknown
) {
	return {
		status: "error" as const,
		message: "Invalid event schema",
		errors: issues,
		eventType,
		eventId,
	};
}

/** Per-item batch result when request is treated as bot (ignored) */
export function batchBotIgnoredItem(eventType: string) {
	return {
		status: "error" as const,
		message: "Bot detected",
		eventType,
		error: "ignored" as const,
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

export interface BotCheckResult {
	isBot: boolean;
	response?: {
		status: string;
		message: string;
		eventType: string;
		error?: string;
	};
}

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
