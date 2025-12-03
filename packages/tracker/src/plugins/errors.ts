import type { BaseTracker } from "../core/tracker";
import type { ErrorSpan } from "../core/types";
import { logger } from "../core/utils";

const extensionSchemes = [
	"chrome-extension://",
	"moz-extension://",
	"safari-extension://",
	"edge-extension://",
] as const;

const isExtensionSource = (candidate?: string | null) => {
	if (!candidate) {
		return false;
	}

	const normalized = candidate.toLowerCase();
	return extensionSchemes.some((scheme) => normalized.includes(scheme));
};

const isScriptErrorMessage = (message?: string) =>
	message?.trim().toLowerCase() === "script error.";

export function initErrorTracking(tracker: BaseTracker) {
	if (tracker.isServer()) {
		return;
	}

	const trackError = (
		error: Omit<ErrorSpan, "timestamp" | "path" | "anonymousId" | "sessionId">
	) => {
		if (tracker.options.disabled || tracker.isLikelyBot || tracker.isServer()) {
			return;
		}

		const errorSpan: ErrorSpan = {
			timestamp: Date.now(),
			path: window.location.pathname,
			anonymousId: tracker.anonymousId,
			sessionId: tracker.sessionId,
			...error,
		};

		logger.log("Queueing error", errorSpan);
		tracker.sendError(errorSpan);
	};

	const errorHandler = (event: ErrorEvent) => {
		if (isScriptErrorMessage(event.message)) {
			return;
		}

		if (
			isExtensionSource(event.filename) ||
			isExtensionSource(event.error?.stack)
		) {
			return;
		}

		trackError({
			message: event.message || "Unknown Error",
			filename: event.filename,
			lineno: event.lineno,
			colno: event.colno,
			stack: event.error?.stack,
			errorType: event.error?.name || "Error",
		});
	};

	const rejectionHandler = (event: PromiseRejectionEvent) => {
		const reason = event.reason;

		if (reason instanceof Error) {
			if (isExtensionSource(reason.stack)) {
				return;
			}

			trackError({
				message: reason.message,
				stack: reason.stack,
				errorType: reason.name || "Error",
			});
			return;
		}

		let message = String(reason);
		if (typeof reason === "object" && reason !== null) {
			try {
				message = JSON.stringify(reason);
			} catch {}
		}

		if (isExtensionSource(reason?.stack)) {
			return;
		}

		trackError({
			message,
			stack: reason?.stack,
			errorType: "UnhandledRejection",
		});
	};

	window.addEventListener("error", errorHandler);
	window.addEventListener("unhandledrejection", rejectionHandler);

	logger.log("Error tracking initialized");
}
