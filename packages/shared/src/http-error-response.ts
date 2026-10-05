export interface HttpErrorResponseContext {
	code?: string | number;
	error: unknown;
}

export interface HttpErrorResponse {
	payload: { success: false; error: string; code: string };
	status: number;
}

const ERROR_STATUS_BY_CODE: Record<string, number> = {
	INVALID_COOKIE_SIGNATURE: 400,
	NOT_FOUND: 404,
	PARSE: 400,
	VALIDATION: 422,
};

const SAFE_MESSAGE_BY_CODE: Record<string, string> = {
	INVALID_COOKIE_SIGNATURE:
		"Some of the details are invalid. Check them and try again.",
	NOT_FOUND: "This item was not found. It may have been deleted.",
	PARSE:
		"The request could not be read. Check that it is valid JSON and try again.",
	VALIDATION: "Some of the details are invalid. Check them and try again.",
};

const PUBLIC_RESPONSE_CODES = new Set(Object.keys(SAFE_MESSAGE_BY_CODE));

export function buildHttpErrorResponse({
	code,
	error,
}: HttpErrorResponseContext): HttpErrorResponse {
	const status = getErrorStatus({ code, error });
	const responseCode = getResponseCode(code, status);

	return {
		status,
		payload: {
			success: false,
			error: getSafeErrorMessage(responseCode, status),
			code: responseCode,
		},
	};
}

function getResponseCode(code: string | number | undefined, status: number) {
	if (
		typeof code === "string" &&
		status < 500 &&
		PUBLIC_RESPONSE_CODES.has(code)
	) {
		return code;
	}
	return status >= 500 ? "INTERNAL_SERVER_ERROR" : `HTTP_${status}`;
}

function getErrorStatus({ code, error }: HttpErrorResponseContext): number {
	if (isHttpStatus(code)) {
		return code;
	}

	if (typeof code === "string") {
		const mappedStatus = ERROR_STATUS_BY_CODE[code];
		if (mappedStatus) {
			return mappedStatus;
		}
	}

	return getObjectStatus(error) ?? 500;
}

function getObjectStatus(error: unknown): number | undefined {
	if (!isRecord(error)) {
		return;
	}

	const status = error.status ?? error.statusCode;
	return isHttpStatus(status) ? status : undefined;
}

function getSafeErrorMessage(code: string, status: number): string {
	return SAFE_MESSAGE_BY_CODE[code] ?? getSafeStatusMessage(status);
}

function getSafeStatusMessage(status: number): string {
	if (status === 401) {
		return "Sign in to continue.";
	}
	if (status === 403) {
		return "You do not have permission to do this. Ask an owner or admin of your organization for access.";
	}
	if (status === 404) {
		return "This item was not found. It may have been deleted.";
	}
	if (status === 422) {
		return "Some of the details are invalid. Check them and try again.";
	}
	if (status === 429) {
		return "Too many requests. Try again shortly.";
	}
	if (status >= 400 && status < 500) {
		return "Some of the details are invalid. Check them and try again.";
	}
	return "Something went wrong on our side. Try again in a moment.";
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
