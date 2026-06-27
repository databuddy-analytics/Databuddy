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
				// Use warn so individual tool failures don't escalate the job-level
				// log to ERROR when the overall job still succeeds. Fatal job errors
				// are logged directly via logger.error() in the job's own catch block.
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
