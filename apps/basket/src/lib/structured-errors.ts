import { createError, EvlogError, parseError } from "evlog";
import type { z } from "zod";

/**
 * Structured errors for the basket API (evlog EvlogError).
 * Prefer throwing these over ad-hoc Response bodies so the global handler can
 * emit consistent JSON and wide-event context.
 */
export const basketErrors = {
	llmMissingApiKey: () =>
		createError({
			message: "Invalid or missing API key with write:llm scope",
			status: 401,
			why: "No API key was sent or the key could not be resolved.",
			fix: "Send a valid API key with the write:llm scope in the Authorization or x-api-key header.",
		}),

	llmMissingScope: () =>
		createError({
			message: "Invalid or missing API key with write:llm scope",
			status: 401,
			why: "The API key does not include the write:llm scope.",
			fix: "Create or use an API key that includes the write:llm scope.",
		}),

	llmMissingOwner: () =>
		createError({
			message: "API key missing owner ID",
			status: 400,
			why: "The key is not linked to a user or organization.",
			fix: "Use an organization-scoped API key or contact support.",
		}),

	llmBillingOwnerUnresolved: () =>
		createError({
			message: "Could not resolve billing owner",
			status: 400,
			why: "Workspace owner could not be loaded for billing.",
			fix: "Verify the organization has an active owner.",
		}),

	llmInvalidBody: () =>
		createError({
			message: "Invalid request body",
			status: 400,
			why: "The JSON body did not match the LLM span schema.",
			fix: "Send a valid AI call payload per the SDK documentation.",
		}),

	trackPayloadTooLarge: () =>
		createError({
			message: "Payload too large",
			status: 413,
			why: "Request body exceeds the maximum allowed size.",
			fix: "Send a smaller payload or fewer events per request.",
		}),

	trackInvalidBody: () =>
		createError({
			message: "Invalid request body",
			status: 400,
			why: "The JSON body did not match the custom event schema.",
			fix: "Send a valid track payload per the SDK documentation.",
		}),

	trackMissingScope: () =>
		createError({
			message: "API key missing track:events scope",
			status: 403,
			why: "The API key is not allowed to send track events.",
			fix: "Use an API key that includes the track:events scope.",
		}),

	trackMissingOwner: () =>
		createError({
			message: "API key missing owner",
			status: 400,
			why: "The key is not linked to a user or organization.",
			fix: "Use an organization-scoped API key or contact support.",
		}),

	trackMissingCredentials: () =>
		createError({
			message: "API key or website_id required",
			status: 401,
			why: "Neither an API key nor a website_id query parameter was provided.",
			fix: "Send an API key header or include website_id on the query string.",
		}),

	trackWebsiteNotFound: () =>
		createError({
			message: "Website not found",
			status: 404,
			why: "No active website matches the given website_id.",
			fix: "Check the website_id and that the site exists in your workspace.",
		}),

	trackWebsiteNoOrganization: () =>
		createError({
			message: "Website missing organization",
			status: 400,
			why: "The website is not linked to an organization.",
			fix: "Assign the website to an organization in the dashboard.",
		}),

	ingestPayloadTooLarge: () =>
		createError({
			message: "Payload too large",
			status: 413,
			why: "Request body exceeds the maximum allowed size.",
			fix: "Send a smaller payload or split events across requests.",
		}),

	ingestMissingClientId: () =>
		createError({
			message: "Missing client ID",
			status: 400,
			why: "No client_id query parameter or databuddy-client-id header was sent.",
			fix: "Pass client_id in the query string or set the databuddy-client-id header.",
		}),

	ingestInvalidClientId: () =>
		createError({
			message: "Invalid or inactive client ID",
			status: 400,
			why: "The website ID is unknown, inactive, or not found.",
			fix: "Use the client ID from your site snippet and ensure the site is active.",
		}),

	ingestOriginNotAuthorized: () =>
		createError({
			message: "Origin not authorized",
			status: 403,
			why: "The request Origin does not match allowed origins for this website.",
			fix: "Add this origin in website security settings or send requests from an allowed domain.",
		}),

	ingestIpNotAuthorized: () =>
		createError({
			message: "IP address not authorized",
			status: 403,
			why: "The client IP is not in the allowed list for this website.",
			fix: "Allow this IP in website security settings or connect from an allowed network.",
		}),

	ingestWebsiteMissingOrganization: () =>
		createError({
			message: "Website missing organization",
			status: 400,
			why: "Custom events require the website to belong to an organization.",
			fix: "Assign the website to an organization in the dashboard.",
		}),

	ingestUnknownEventType: () =>
		createError({
			message: "Unknown event type",
			status: 400,
			why: "The type field does not match a supported ingestion event.",
			fix: "Use track, outgoing_link, or another supported type per the SDK.",
		}),

	ingestBatchNotArray: () =>
		createError({
			message: "Batch endpoint expects array of events",
			status: 400,
			why: "The request body must be a JSON array of events.",
			fix: "Send an array of event objects as the request body.",
		}),

	ingestBatchTooLarge: () =>
		createError({
			message: "Batch too large",
			status: 400,
			why: "The batch exceeds the maximum number of events per request.",
			fix: "Split the batch into smaller requests.",
		}),
};

export type IngestSchemaValidationError = EvlogError & {
	readonly issues: z.ZodIssue[];
};

export function createIngestSchemaValidationError(
	issues: z.ZodIssue[]
): IngestSchemaValidationError {
	const err = createError({
		message: "Invalid event schema",
		status: 400,
		why: "The JSON did not match the expected event shape.",
		fix: "Correct the fields listed in errors and retry.",
	});
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

export function buildBasketErrorPayload(
	error: unknown,
	options: {
		elysiaCode?: string | number;
		extra?: Record<string, unknown>;
	} = {}
): { status: number; payload: Record<string, unknown> } {
	const parsed = parseError(error);
	const isDevelopment = process.env.NODE_ENV === "development";
	const errorMessage = error instanceof Error ? error.message : String(error);
	const statusCode =
		parsed.status >= 400 && parsed.status < 600 ? parsed.status : 500;
	const safeClientError =
		isDevelopment || statusCode === 404
			? errorMessage
			: "An internal server error occurred";
	const exposeStructured =
		isDevelopment || (parsed.status >= 400 && parsed.status < 500);

	const codeString =
		options.elysiaCode == null
			? "INTERNAL_SERVER_ERROR"
			: String(options.elysiaCode);

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
		payload.errors = error.issues;
	}

	return { status: statusCode, payload };
}
