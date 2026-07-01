import { createError, defineErrorCatalog, EvlogError, parseError } from "evlog";
import type { z } from "zod";

export const basketErrorCatalog = defineErrorCatalog("basket", {
	TRACK_PAYLOAD_TOO_LARGE: {
		message: "Payload too large",
		status: 413,
		why: "Request body exceeds the maximum allowed size.",
		fix: "Send a smaller payload or fewer events per request.",
	},
	TRACK_INVALID_BODY: {
		message: "Invalid request body",
		status: 400,
		why: "The JSON body did not match the custom event schema.",
		fix: "Send a valid track payload per the SDK documentation.",
	},
	TRACK_MISSING_SCOPE: {
		message: "API key missing track:events scope",
		status: 403,
		why: "The API key is not allowed to send track events.",
		fix: "Use an API key that includes the track:events scope.",
	},
	TRACK_MISSING_OWNER: {
		message: "API key missing owner",
		status: 400,
		why: "The key is not linked to a user or organization.",
		fix: "Use an organization-scoped API key or contact support.",
	},
	TRACK_MISSING_CREDENTIALS: {
		message: "API key or website_id required",
		status: 401,
		why: "Neither an API key nor a website_id query parameter was provided.",
		fix: "Send an API key header or include website_id on the query string.",
	},
	TRACK_WEBSITE_NOT_FOUND: {
		message: "Website not found",
		status: 404,
		why: "No active website matches the given website_id.",
		fix: "Check the website_id and that the site exists in your organization.",
	},
	TRACK_WEBSITE_NO_ORGANIZATION: {
		message: "Website missing organization",
		status: 400,
		why: "The website is not linked to an organization.",
		fix: "Assign the website to an organization in the dashboard.",
	},
	TRACK_WEBSITE_SCOPE_MISMATCH: {
		message: "Website scope mismatch",
		status: 403,
		why: "The event website_id does not match the authenticated website.",
		fix: "Send events only for the authenticated website, or use an API key with access to multiple websites.",
	},
	TRACK_RATE_LIMITED: {
		message: "Rate limit exceeded",
		status: 429,
		why: "Too many /track requests from this principal.",
		fix: "Reduce request frequency or batch events.",
	},
	INGEST_PAYLOAD_TOO_LARGE: {
		message: "Payload too large",
		status: 413,
		why: "Request body exceeds the maximum allowed size.",
		fix: "Send a smaller payload or split events across requests.",
	},
	INGEST_MISSING_CLIENT_ID: {
		message: "Missing client ID",
		status: 400,
		why: "No client_id query parameter or databuddy-client-id header was sent.",
		fix: "Pass client_id in the query string or set the databuddy-client-id header.",
	},
	INGEST_INVALID_CLIENT_ID: {
		message: "Invalid or inactive client ID",
		status: 400,
		why: "The Client ID is unknown, inactive, or not found.",
		fix: "Use the client ID from your site snippet and ensure the site is active.",
	},
	INGEST_ORIGIN_NOT_AUTHORIZED: {
		message: "Origin not authorized",
		status: 403,
		why: "The request Origin does not match allowed origins for this website.",
		fix: "Add this origin in website security settings or send requests from an allowed domain.",
	},
	INGEST_IP_NOT_AUTHORIZED: {
		message: "IP address not authorized",
		status: 403,
		why: "The client IP is not in the allowed list for this website.",
		fix: "Allow this IP in website security settings or connect from an allowed network.",
	},
	INGEST_WEBSITE_MISSING_ORGANIZATION: {
		message: "Website missing organization",
		status: 400,
		why: "Custom events require the website to belong to an organization.",
		fix: "Assign the website to an organization in the dashboard.",
	},
	INGEST_UNKNOWN_EVENT_TYPE: {
		message: "Unknown event type",
		status: 400,
		why: "The type field does not match a supported ingestion event.",
		fix: "Use track, outgoing_link, or another supported type per the SDK.",
	},
	INGEST_BATCH_NOT_ARRAY: {
		message: "Batch endpoint expects array of events",
		status: 400,
		why: "The request body must be a JSON array of events.",
		fix: "Send an array of event objects as the request body.",
	},
	INGEST_BATCH_TOO_LARGE: {
		message: "Batch too large",
		status: 400,
		why: "The batch exceeds the maximum number of events per request.",
		fix: "Split the batch into smaller requests.",
	},
	BILLING_LIMIT_EXCEEDED: {
		message: "Event quota exceeded",
		status: 402,
		why: "The billing provider denied this usage check.",
		fix: "Upgrade the plan, reduce event volume, or contact support.",
	},
	BILLING_CHECK_UNAVAILABLE: {
		message: "Billing check unavailable",
		status: 503,
		why: "The event quota could not be verified before ingestion.",
		fix: "Retry after the billing provider is reachable.",
	},
	INVALID_EVENT_SCHEMA: {
		message: "Invalid event schema",
		status: 400,
		why: "The JSON did not match the expected event shape.",
		fix: "Correct the fields listed in errors and retry.",
	},
});

declare module "evlog" {
	interface RegisteredErrorCatalogs {
		basket: typeof basketErrorCatalog;
	}
}

export const basketErrors = {
	trackPayloadTooLarge: basketErrorCatalog.TRACK_PAYLOAD_TOO_LARGE,
	trackInvalidBody: basketErrorCatalog.TRACK_INVALID_BODY,
	trackMissingScope: basketErrorCatalog.TRACK_MISSING_SCOPE,
	trackMissingOwner: basketErrorCatalog.TRACK_MISSING_OWNER,
	trackMissingCredentials: basketErrorCatalog.TRACK_MISSING_CREDENTIALS,
	trackWebsiteNotFound: basketErrorCatalog.TRACK_WEBSITE_NOT_FOUND,
	trackWebsiteNoOrganization: basketErrorCatalog.TRACK_WEBSITE_NO_ORGANIZATION,
	trackWebsiteScopeMismatch: basketErrorCatalog.TRACK_WEBSITE_SCOPE_MISMATCH,
	trackRateLimited: basketErrorCatalog.TRACK_RATE_LIMITED,
	ingestPayloadTooLarge: basketErrorCatalog.INGEST_PAYLOAD_TOO_LARGE,
	ingestMissingClientId: basketErrorCatalog.INGEST_MISSING_CLIENT_ID,
	ingestInvalidClientId: basketErrorCatalog.INGEST_INVALID_CLIENT_ID,
	ingestOriginNotAuthorized: basketErrorCatalog.INGEST_ORIGIN_NOT_AUTHORIZED,
	ingestIpNotAuthorized: basketErrorCatalog.INGEST_IP_NOT_AUTHORIZED,
	ingestWebsiteMissingOrganization:
		basketErrorCatalog.INGEST_WEBSITE_MISSING_ORGANIZATION,
	ingestUnknownEventType: basketErrorCatalog.INGEST_UNKNOWN_EVENT_TYPE,
	ingestBatchNotArray: basketErrorCatalog.INGEST_BATCH_NOT_ARRAY,
	ingestBatchTooLarge: basketErrorCatalog.INGEST_BATCH_TOO_LARGE,
	billingLimitExceeded: basketErrorCatalog.BILLING_LIMIT_EXCEEDED,
	billingCheckUnavailable: basketErrorCatalog.BILLING_CHECK_UNAVAILABLE,
};

export type IngestSchemaValidationError = EvlogError & {
	readonly issues: z.ZodIssue[];
};

export function createIngestSchemaValidationError(
	issues: z.ZodIssue[]
): IngestSchemaValidationError {
	const err = basketErrorCatalog.INVALID_EVENT_SCHEMA();
	return Object.assign(err, { issues });
}

export function isIngestSchemaValidationError(
	error: unknown
): error is IngestSchemaValidationError {
	return (
		error instanceof EvlogError &&
		"issues" in error &&
		Array.isArray((error as { issues: unknown }).issues)
	);
}

export function rethrowOrWrap(
	error: unknown,
	log?: { error: (err: Error) => void }
): never {
	if (error instanceof EvlogError) {
		throw error;
	}
	const err = error instanceof Error ? error : new Error(String(error));
	log?.error(err);
	throw createError({
		message: "Internal server error",
		status: 500,
		why: process.env.NODE_ENV === "development" ? err.message : undefined,
		cause: err,
	});
}

export function buildBasketErrorPayload(
	error: unknown,
	options: {
		elysiaCode?: string | number;
		extra?: Record<string, unknown>;
	} = {}
): { status: number; payload: Record<string, unknown> } {
	const parsed = parseError(error);
	const isDevelopment = process.env.NODE_ENV === "development";
	const statusCode =
		parsed.status >= 400 && parsed.status < 600 ? parsed.status : 500;
	const exposeStructured = isDevelopment || error instanceof EvlogError;
	const safeClientError = getSafeBasketErrorMessage({
		error,
		isDevelopment,
		statusCode,
	});

	const codeString = getBasketErrorCode({
		elysiaCode: options.elysiaCode,
		parsedCode: parsed.code,
	});

	const payload: Record<string, unknown> = {
		success: false,
		status: "error",
		error: safeClientError,
		message: safeClientError,
		code: codeString,
		...options.extra,
	};

	if (exposeStructured && parsed.why != null && parsed.why !== "") {
		payload.why = parsed.why;
	}
	if (exposeStructured && parsed.fix != null && parsed.fix !== "") {
		payload.fix = parsed.fix;
	}
	if (exposeStructured && parsed.link != null && parsed.link !== "") {
		payload.link = parsed.link;
	}

	if (isIngestSchemaValidationError(error)) {
		payload.errors = sanitizeValidationIssues(error.issues);
	}

	return { status: statusCode, payload };
}

function getBasketErrorCode({
	elysiaCode,
	parsedCode,
}: {
	elysiaCode?: string | number;
	parsedCode: unknown;
}): string {
	if (typeof parsedCode === "string" && parsedCode !== "") {
		return parsedCode;
	}
	return elysiaCode == null ? "INTERNAL_SERVER_ERROR" : String(elysiaCode);
}

function sanitizeValidationIssues(
	issues: z.ZodIssue[]
): Array<{ code: string; field: string; message: string }> {
	return issues.flatMap((issue) => {
		const nestedIssues = getNestedUnionIssues(issue);
		if (nestedIssues.length > 0) {
			return sanitizeValidationIssues(nestedIssues);
		}
		return [
			{
				code: issue.code,
				field: issue.path.join("."),
				message: issue.message,
			},
		];
	});
}

function getNestedUnionIssues(issue: z.ZodIssue): z.ZodIssue[] {
	const errors = "errors" in issue ? issue.errors : null;
	if (!Array.isArray(errors)) {
		return [];
	}
	return errors.flatMap((branch) =>
		Array.isArray(branch) ? (branch as z.ZodIssue[]) : []
	);
}

function getSafeBasketErrorMessage({
	error,
	isDevelopment,
	statusCode,
}: {
	error: unknown;
	isDevelopment: boolean;
	statusCode: number;
}): string {
	if (isDevelopment) {
		return error instanceof Error ? error.message : String(error);
	}

	if (error instanceof EvlogError) {
		return error.message;
	}

	if (statusCode === 401) {
		return "Authentication required";
	}
	if (statusCode === 403) {
		return "Forbidden";
	}
	if (statusCode === 404) {
		return "Not found";
	}
	if (statusCode === 413) {
		return "Payload too large";
	}
	if (statusCode === 429) {
		return "Rate limit exceeded";
	}
	if (statusCode === 503) {
		return "Service temporarily unavailable";
	}
	if (statusCode >= 400 && statusCode < 500) {
		return "Invalid request";
	}
	return "An internal server error occurred";
}
