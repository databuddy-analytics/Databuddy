import type { BaseTracker } from "../core/tracker";
import { generateUUIDv4, logger } from "../core/utils";

type ErrorPayload = {
	timestamp: number;
	message: string;
	filename?: string;
	lineno?: number;
	colno?: number;
	stack?: string;
	errorType: string;
};

export function initErrorTracking(tracker: BaseTracker) {
	if (tracker.isServer()) {
		return;
	}

	const trackError = (errorData: ErrorPayload) => {
		if (tracker.options.disabled || tracker.isLikelyBot || tracker.isServer()) {
			logger.log("Error tracking skipped (disabled/bot/server)");
			return;
		}

		const payload = {
			eventId: generateUUIDv4(),
			anonymousId: tracker.anonymousId,
			sessionId: tracker.sessionId,
			...errorData,
			...tracker.getBaseContext(),
		};

		logger.log("Tracking error", payload);

		tracker.api.fetch("/errors", payload, { keepalive: true }).catch(() => {
			tracker.sendBeacon(payload);
		});
	};

	const errorHandler = (event: ErrorEvent) => {
		trackError({
			timestamp: Date.now(),
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
				timestamp: Date.now(),
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

		trackError({
			timestamp: Date.now(),
			message,
			stack: reason?.stack,
			errorType: "UnhandledRejection",
		});
	};

	window.addEventListener("error", errorHandler);
	window.addEventListener("unhandledrejection", rejectionHandler);

	logger.log("Error tracking initialized");
}
