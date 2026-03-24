import { log } from "evlog";
import { useLogger as getRequestLogger } from "evlog/elysia";

/**
 * Merge structured fields into the active request wide event (evlog).
 */
export function mergeWideEvent(
	fields: Record<string, string | number | boolean>
): void {
	try {
		getRequestLogger().set(fields as Record<string, unknown>);
	} catch {
		log.info({ service: "api", ...fields });
	}
}

/**
 * Attach an error to the active request wide event when inside the evlog
 * middleware; otherwise emit a global structured log line.
 */
export function captureError(
	error: unknown,
	fields?: Record<string, string | number | boolean>
): void {
	const err = error instanceof Error ? error : new Error(String(error));
	try {
		const requestLog = getRequestLogger();
		if (fields) {
			requestLog.error(err, fields as Record<string, unknown>);
		} else {
			requestLog.error(err);
		}
	} catch {
		log.error({
			service: "api",
			error: err.message,
			...(fields ?? {}),
		});
	}
}
