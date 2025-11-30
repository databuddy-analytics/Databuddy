import type { BaseTracker } from "../core/tracker";
import type { ErrorSpan } from "../core/types";
import { logger } from "../core/utils";

export function initErrorTracking(tracker: BaseTracker) {
	if (tracker.isServer()) {
		return;
	}

	const trackError = (error: Omit<ErrorSpan, "timestamp" | "path" | "anonymousId" | "sessionId">) => {
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
			} catch { }
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
