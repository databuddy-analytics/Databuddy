import { log } from "evlog";

export function captureError(
	error: unknown,
	attributes?: Record<string, string | number | boolean>
): void {
	const err = error instanceof Error ? error : new Error(String(error));
	log.error({
		service: "uptime",
		error_message: err.message,
		...(attributes ?? {}),
	});
}
