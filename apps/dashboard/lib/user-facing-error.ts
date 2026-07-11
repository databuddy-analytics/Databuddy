interface ErrorDetails {
	code?: string;
	data?: {
		code?: string;
		httpStatus?: number;
		status?: number;
	};
	message?: string;
	status?: number;
}

const CODE_MESSAGES: Record<string, string> = {
	BAD_REQUEST:
		"That request could not be completed. Check the details and try again.",
	CONFLICT: "That change conflicts with newer data. Refresh and try again.",
	FORBIDDEN: "You do not have permission to do that.",
	INTERNAL_SERVER_ERROR: "Something went wrong on our side. Try again.",
	NOT_FOUND: "That item could not be found. It may have been removed.",
	RATE_LIMITED: "Too many requests. Wait a moment and try again.",
	TIMEOUT: "The request took too long. Try again.",
	TOO_MANY_REQUESTS: "Too many requests. Wait a moment and try again.",
	UNAUTHORIZED: "Your session has expired. Sign in and try again.",
	VALIDATION_ERROR: "Some details are invalid. Check them and try again.",
};

const STATUS_MESSAGES: Record<number, string> = {
	400: CODE_MESSAGES.BAD_REQUEST,
	401: CODE_MESSAGES.UNAUTHORIZED,
	403: CODE_MESSAGES.FORBIDDEN,
	404: CODE_MESSAGES.NOT_FOUND,
	409: CODE_MESSAGES.CONFLICT,
	422: CODE_MESSAGES.VALIDATION_ERROR,
	429: CODE_MESSAGES.RATE_LIMITED,
};

export const DEFAULT_USER_ERROR_MESSAGE =
	"Something went wrong. Try again in a moment.";

export function getUserFacingErrorMessage(
	error: unknown,
	fallback = DEFAULT_USER_ERROR_MESSAGE
): string {
	if (!(error && typeof error === "object")) {
		return fallback;
	}

	const details = error as ErrorDetails;
	const code = details.data?.code ?? details.code;
	if (code) {
		const message = CODE_MESSAGES[code.toUpperCase()];
		if (message) {
			return message;
		}
	}

	const status =
		details.data?.httpStatus ?? details.data?.status ?? details.status;
	if (status && STATUS_MESSAGES[status]) {
		return STATUS_MESSAGES[status];
	}

	const message = details.message?.toLowerCase() ?? "";
	if (message.includes("network") || message.includes("fetch failed")) {
		return "We could not reach Databuddy. Check your connection and try again.";
	}

	return fallback;
}
