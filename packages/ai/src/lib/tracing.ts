import { EvlogError, log } from "evlog";
import { getActiveAiRequestLogger } from "./request-logger";

export function mergeWideEvent<Fields extends object = Record<string, unknown>>(
	fields: Partial<Fields>
): void {
	const payload = fields as Record<string, unknown>;
	const requestLogger = getActiveAiRequestLogger();
	if (requestLogger) {
		requestLogger.set(payload);
		return;
	}
	log.info({ service: "api", ...payload });
}

export function captureError<Fields extends object = Record<string, unknown>>(
	error: unknown,
	fields?: Partial<Fields>
): void {
	const err = error instanceof Error ? error : new Error(String(error));
	const payload = fields as Record<string, unknown> | undefined;
	const requestLog = getActiveAiRequestLogger();
	if (
		requestLog &&
		err instanceof EvlogError &&
		err.status >= 400 &&
		err.status < 500
	) {
		requestLog.set({
			client_http_error: true,
			http_status: err.status,
			error_message: err.message,
		});
		if (payload) {
			requestLog.warn(err.message, payload);
		} else {
			requestLog.warn(err.message);
		}
		return;
	}
	if (requestLog) {
		if (payload) {
			requestLog.error(err, payload);
		} else {
			requestLog.error(err);
		}
		return;
	}
	log.error({
		service: "api",
		error_message: err.message,
		...(payload ?? {}),
	});
}
