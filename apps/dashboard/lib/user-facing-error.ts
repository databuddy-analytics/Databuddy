import { toast } from "sonner";

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
	FEATURE_UNAVAILABLE:
		"This feature is not available on your current plan. Upgrade to unlock it.",
	FORBIDDEN: "You do not have permission to do that.",
	INTERNAL_SERVER_ERROR: "Something went wrong on our side. Try again.",
	NOT_FOUND: "That item could not be found. It may have been removed.",
	PLAN_LIMIT_EXCEEDED:
		"You have reached your plan's limit. Upgrade to create more.",
	RATE_LIMITED: "Too many requests. Wait a moment and try again.",
	SERVICE_UNAVAILABLE:
		"The service is temporarily unavailable. Try again shortly.",
	TIMEOUT: "The request took too long. Try again.",
	TOO_MANY_REQUESTS: "Too many requests. Wait a moment and try again.",
	UNAUTHORIZED: "Your session has expired. Sign in and try again.",
	VALIDATION_ERROR: "Some details are invalid. Check them and try again.",
};

const SERVER_AUTHORED_CODES = new Set([
	"BAD_REQUEST",
	"CONFLICT",
	"FEATURE_UNAVAILABLE",
	"FORBIDDEN",
	"PLAN_LIMIT_EXCEEDED",
	"SERVICE_UNAVAILABLE",
	"VALIDATION_ERROR",
]);

const STATUS_MESSAGES: Record<number, string> = {
	400: CODE_MESSAGES.BAD_REQUEST,
	401: CODE_MESSAGES.UNAUTHORIZED,
	402: CODE_MESSAGES.PLAN_LIMIT_EXCEEDED,
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
	if (typeof code === "string") {
		const normalized = code.toUpperCase();
		if (SERVER_AUTHORED_CODES.has(normalized)) {
			const authored = details.message?.trim();
			if (authored?.includes(" ")) {
				return authored;
			}
		}
		const mapped = CODE_MESSAGES[normalized];
		if (mapped) {
			return mapped;
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

export function showErrorToast(error: unknown, fallback?: string) {
	toast.error(getUserFacingErrorMessage(error, fallback));
}

export const mutationErrorToast = {
	onError: (error: unknown) => showErrorToast(error),
	meta: { suppressGlobalErrorToast: true },
};
