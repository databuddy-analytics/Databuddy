import { log } from "evlog";
import { captureError } from "@databuddy/ai/lib/tracing";

export function registerProcessErrorHandlers() {
	process.on("unhandledRejection", (reason) => {
		captureError(reason);
		log.error({
			process: "unhandledRejection",
			error_message: reason instanceof Error ? reason.message : String(reason),
			error_stack: reason instanceof Error ? reason.stack : undefined,
			error_source: "process",
		});
	});

	process.on("uncaughtException", (error) => {
		captureError(error);
		log.error({
			process: "uncaughtException",
			error_message: error.message,
			error_stack: error.stack,
			error_source: "process",
		});
		process.exit(1);
	});
}
