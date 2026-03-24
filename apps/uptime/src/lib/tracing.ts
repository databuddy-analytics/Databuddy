import { log } from "evlog";
import { useLogger as getRequestLogger } from "evlog/elysia";

/**
 * Run a named operation. Request-level timing and HTTP metadata are emitted by
 * evlog on the wide event.
 */
export function record<T>(_name: string, fn: () => Promise<T> | T): Promise<T> {
	return Promise.resolve().then(() => fn());
}

/**
 * Merge structured fields into the active request wide event (evlog).
 */
export function mergeWideEvent(
	fields: Record<string, string | number | boolean>
): void {
	try {
		getRequestLogger().set(fields as Record<string, string | number | boolean>);
	} catch {
		log.info({ service: "uptime", ...fields });
	}
}

/**
 * Attach an error to the active request wide event when inside the evlog
 * middleware; otherwise emit a global structured log line.
 *
 * When **`error_step`** is set, also merges **`request_error: true`** and the
 * same fields onto the wide event (same pattern as success `mergeWideEvent`).
 * Process-level handlers should omit `error_step` to avoid noisy wide merges.
 */
export function captureError(
	error: unknown,
	attributes?: Record<string, string | number | boolean>
): void {
	const err = error instanceof Error ? error : new Error(String(error));
	if (attributes?.error_step != null) {
		mergeWideEvent({
			request_error: true,
			...attributes,
		});
	}
	try {
		const requestLog = getRequestLogger();
		if (attributes) {
			requestLog.error(
				err,
				attributes as Record<string, string | number | boolean>
			);
		} else {
			requestLog.error(err);
		}
	} catch {
		log.error({
			service: "uptime",
			error: err.message,
			...(attributes ?? {}),
		});
	}
}
