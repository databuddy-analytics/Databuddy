import { EvlogError, log } from "evlog";
import { useLogger } from "evlog/elysia";

export function mergeWideEvent(fields: Record<string, unknown>): void {
	try {
		useLogger().set(fields);
	} catch {
		log.info(fields);
	}
}

export async function record<T>(
	name: string,
	fn: () => Promise<T> | T
): Promise<T> {
	const start = performance.now();
	try {
		return await fn();
	} finally {
		const ms = Math.round((performance.now() - start) * 100) / 100;
		try {
			useLogger().set({ [`timing.${name}`]: ms });
		} catch {}
	}
}

export function captureError(
	error: unknown,
	attributes?: Record<string, string | number | boolean>
): void {
	const err = error instanceof Error ? error : new Error(String(error));
	try {
		const requestLog = useLogger();
		if (err instanceof EvlogError && err.status >= 400 && err.status < 500) {
			requestLog.set({
				client_http_error: true,
				http_status: err.status,
				error_message: err.message,
			});
			if (attributes) {
				requestLog.warn(err.message, attributes as Record<string, unknown>);
			} else {
				requestLog.warn(err.message);
			}
			return;
		}
		if (attributes) {
			requestLog.error(err, attributes as Record<string, unknown>);
		} else {
			requestLog.error(err);
		}
	} catch {
		log.error({
			service: "basket",
			error_message: err.message,
			...(attributes ?? {}),
		});
	}
}
