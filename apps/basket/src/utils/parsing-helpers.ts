import { logBlockedTraffic } from "@lib/blocked-traffic";
import { mergeWideEvent, record } from "@lib/tracing";
import { VALIDATION_LIMITS } from "@utils/validation";
import type { z } from "zod";

type ParseResult<T> =
	| { success: true; data: T }
	| { success: false; error: { issues: z.core.$ZodIssue[] } };

export function validateEventSchema<T>(
	schema: z.ZodSchema<T>,
	event: unknown,
	request: Request,
	query: unknown,
	clientId: string
): Promise<ParseResult<T>> {
	return record("validateEventSchema", async () => {
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
			mergeWideEvent({ validation: validationContext });
			return {
				success: false,
				error: { issues: parseResult.error.issues },
			};
		}

		return parseResult;
	});
}

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

export function batchBotIgnoredItem(eventType: string) {
	return {
		status: "error" as const,
		message: "Bot detected",
		eventType,
		error: "ignored" as const,
	};
}

export function parseTimestamp(timestamp: unknown): number {
	return typeof timestamp === "number" ? timestamp : Date.now();
}

export function parseProperties(properties: unknown): string {
	return properties ? JSON.stringify(properties) : "{}";
}

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
