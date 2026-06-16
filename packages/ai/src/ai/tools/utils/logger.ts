import { log } from "evlog";
import { getActiveAiRequestLogger } from "../../../lib/request-logger";

/**
 * Request-scoped logger for AI tools (wide event via evlog).
 * Falls back to global `log` when no request scope is active (same pattern as mergeWideEvent).
 */
export function createToolLogger(toolName: string) {
	return {
		info: (message: string, context?: Record<string, unknown>) => {
			const requestLogger = getActiveAiRequestLogger();
			if (requestLogger) {
				requestLogger.info(message, {
					aiTool: { name: toolName },
					...context,
				});
				return;
			}
			log.info({ service: "api", aiTool: toolName, message, ...context });
		},
		error: (message: string, context?: Record<string, unknown>) => {
			const requestLogger = getActiveAiRequestLogger();
			if (requestLogger) {
				// Use warn so that recoverable tool errors (e.g. a failed SQL
				// query or annotation creation that the AI model handles) do
				// not escalate the job-level wide event to ERROR when the job
				// ultimately succeeds. Genuine job failures are logged at ERROR
				// by the job runner itself (jobs.ts logger.error(err)).
				requestLogger.warn(message, {
					aiTool: { name: toolName },
					...context,
				});
				return;
			}
			log.error({
				service: "api",
				aiTool: toolName,
				message,
				...context,
			});
		},
		warn: (message: string, context?: Record<string, unknown>) => {
			const requestLogger = getActiveAiRequestLogger();
			if (requestLogger) {
				requestLogger.warn(message, {
					aiTool: { name: toolName },
					...context,
				});
				return;
			}
			log.warn({ service: "api", aiTool: toolName, message, ...context });
		},
		debug: (message: string, context?: Record<string, unknown>) => {
			const requestLogger = getActiveAiRequestLogger();
			if (requestLogger) {
				requestLogger.set({
					aiTool: { name: toolName, level: "debug", message, ...context },
				});
				return;
			}
			log.info({
				service: "api",
				aiTool: toolName,
				level: "debug",
				message,
				...context,
			});
		},
	};
}
