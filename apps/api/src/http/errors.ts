import { config } from "@databuddy/env/app";
import { ValidationError } from "elysia";
import { EvlogError, parseError } from "evlog";
import { getRequestId } from "./request-id";

interface AppErrorContext {
	code?: string | number;
	error: unknown;
	request?: Request;
	requestId?: string;
}

const HTTP_STATUS_BY_ERROR_CODE: Record<string, number> = {
	AUTH_REQUIRED: 401,
	BAD_REQUEST: 400,
	CONFLICT: 409,
	FEATURE_UNAVAILABLE: 402,
	FORBIDDEN: 403,
	INTERNAL_SERVER_ERROR: 500,
	INVALID_COOKIE_SIGNATURE: 400,
	NOT_FOUND: 404,
	PARSE: 400,
	PLAN_LIMIT_EXCEEDED: 402,
	RATE_LIMITED: 429,
	TOO_MANY_REQUESTS: 429,
	UNAUTHORIZED: 401,
	UNKNOWN: 500,
	VALIDATION: 422,
};

const PROTECTED_RESOURCE_METADATA_URL = `${config.urls.api}/.well-known/oauth-protected-resource`;
const LEADING_SLASH_PATTERN = /^\//;

export function handleAppError({
	error,
	code,
	request,
	requestId,
}: AppErrorContext) {
	const responseRequestId = requestId ?? getRequestId(request);
	const parsed = parseError(error);
	const statusCode = getStatusCode({
		code,
		error,
		parsedStatus: parsed.status,
	});
	const errorCode = getErrorCode({
		explicitCode: code,
		parsedCode: parsed.code,
	});
	const isDevelopment = process.env.NODE_ENV === "development";
	const isClientError = statusCode >= 400 && statusCode < 500;
	const exposeStructured =
		isDevelopment || (isClientError && isStructuredError(error));
	const safeClientError = getSafeErrorMessage({
		code: errorCode,
		error,
		isDevelopment,
		isClientError,
		statusCode,
	});
	const validationDetails = getValidationDetails(error, isDevelopment);
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"X-Request-ID": responseRequestId,
	};
	if (statusCode === 401) {
		headers["WWW-Authenticate"] =
			`Bearer resource_metadata="${PROTECTED_RESOURCE_METADATA_URL}"`;
	}

	return new Response(
		JSON.stringify({
			success: false,
			error: safeClientError,
			code: errorCode,
			requestId: responseRequestId,
			...(hasValue(parsed.why) && exposeStructured ? { why: parsed.why } : {}),
			...(hasValue(parsed.fix) && exposeStructured ? { fix: parsed.fix } : {}),
			...(hasValue(parsed.link) && exposeStructured
				? { link: parsed.link }
				: {}),
			...(validationDetails.length > 0 ? { details: validationDetails } : {}),
		}),
		{ status: statusCode, headers }
	);
}

interface ValidationDetail {
	field: string;
	message: string;
}

function getValidationDetails(
	error: unknown,
	isDevelopment: boolean
): ValidationDetail[] {
	if (!(error instanceof ValidationError) || error.type === "response") {
		return [];
	}

	const details: ValidationDetail[] = [];
	const seenFields = new Set<string>();
	for (const issue of error.all) {
		const path = issue.path
			.replace(LEADING_SLASH_PATTERN, "")
			.split("/")
			.filter(Boolean)
			.join(".");
		const field = path ? `${error.type}.${path}` : error.type;
		if (seenFields.has(field)) {
			continue;
		}
		seenFields.add(field);
		details.push({
			field,
			message: isDevelopment
				? getDevelopmentValidationMessage(issue)
				: "Invalid value",
		});
		if (details.length === 20) {
			break;
		}
	}
	return details;
}

function getDevelopmentValidationMessage(issue: {
	message: string;
	summary?: string;
}): string {
	return typeof issue.summary === "string" && issue.summary
		? issue.summary
		: issue.message;
}

function getErrorCode({
	explicitCode,
	parsedCode,
}: {
	explicitCode?: string | number;
	parsedCode: unknown;
}): string {
	if (typeof parsedCode === "string" && parsedCode !== "") {
		return parsedCode;
	}
	return explicitCode == null ? "INTERNAL_SERVER_ERROR" : String(explicitCode);
}

function getSafeErrorMessage({
	code,
	error,
	isClientError,
	isDevelopment,
	statusCode,
}: {
	code: string;
	error: unknown;
	isClientError: boolean;
	isDevelopment: boolean;
	statusCode: number;
}): string {
	if (isDevelopment) {
		return error instanceof Error ? error.message : String(error);
	}

	if (isClientError && isStructuredError(error) && error instanceof Error) {
		return error.message;
	}

	return SAFE_MESSAGE_BY_ERROR_CODE[code] ?? getSafeStatusMessage(statusCode);
}

function isStructuredError(error: unknown): error is EvlogError {
	return error instanceof EvlogError;
}

const SAFE_MESSAGE_BY_ERROR_CODE: Record<string, string> = {
	AUTH_REQUIRED: "Authentication required",
	BAD_REQUEST: "Invalid request",
	CONFLICT: "Conflict",
	FEATURE_UNAVAILABLE: "Feature unavailable",
	FORBIDDEN: "Forbidden",
	INTERNAL_SERVER_ERROR: "An internal server error occurred",
	INVALID_COOKIE_SIGNATURE: "Invalid request",
	NOT_FOUND: "Not found",
	PARSE: "Invalid request body",
	PLAN_LIMIT_EXCEEDED: "Plan limit exceeded",
	RATE_LIMITED: "Rate limit exceeded",
	TOO_MANY_REQUESTS: "Rate limit exceeded",
	UNAUTHORIZED: "Authentication required",
	UNKNOWN: "An internal server error occurred",
	VALIDATION: "Invalid request",
};

function getSafeStatusMessage(statusCode: number): string {
	if (statusCode === 401) {
		return "Authentication required";
	}
	if (statusCode === 403) {
		return "Forbidden";
	}
	if (statusCode === 404) {
		return "Not found";
	}
	if (statusCode === 409) {
		return "Conflict";
	}
	if (statusCode === 413) {
		return "Payload too large";
	}
	if (statusCode === 422) {
		return "Invalid request";
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

function getStatusCode({
	code,
	error,
	parsedStatus,
}: {
	code?: string | number;
	error: unknown;
	parsedStatus: unknown;
}): number {
	if (isHttpStatus(code)) {
		return code;
	}

	if (typeof code === "string") {
		const mappedStatus = HTTP_STATUS_BY_ERROR_CODE[code];
		if (mappedStatus) {
			return mappedStatus;
		}
	}

	return (
		getObjectStatus(error) ?? (isHttpStatus(parsedStatus) ? parsedStatus : 500)
	);
}

function getObjectStatus(error: unknown): number | undefined {
	if (!isRecord(error)) {
		return;
	}

	const status = error.status ?? error.statusCode;
	return isHttpStatus(status) ? status : undefined;
}

function isHttpStatus(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isInteger(value) &&
		value >= 400 &&
		value <= 599
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function hasValue(value: unknown): value is string {
	return typeof value === "string" && value !== "";
}
