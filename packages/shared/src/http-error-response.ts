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
	INVALID_COOKIE_SIGNATURE: "Invalid request",
	NOT_FOUND: "Not found",
	PARSE: "Invalid request body",
	VALIDATION: "Invalid request",
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
		return "Authentication required";
	}
	if (status === 403) {
		return "Forbidden";
	}
	if (status === 404) {
		return "Not found";
	}
	if (status === 422) {
		return "Invalid request";
	}
	if (status === 429) {
		return "Rate limit exceeded";
	}
	if (status >= 400 && status < 500) {
		return "Invalid request";
	}
	return "Internal server error";
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
