import { useLogger } from "evlog/elysia";

/**
 * Request-scoped logger for AI tools (wide event via evlog).
 */
export function createToolLogger(toolName: string) {
	return {
		info: (message: string, context?: Record<string, unknown>) => {
			const log = useLogger();
			log.info(message, { aiTool: { name: toolName }, ...context });
		},
		error: (message: string, context?: Record<string, unknown>) => {
			const log = useLogger();
			log.error(new Error(message), {
				aiTool: { name: toolName },
				...context,
			});
		},
		warn: (message: string, context?: Record<string, unknown>) => {
			const log = useLogger();
			log.warn(message, { aiTool: { name: toolName }, ...context });
		},
		debug: (message: string, context?: Record<string, unknown>) => {
			const log = useLogger();
			log.set({
				aiTool: { name: toolName, level: "debug", message, ...context },
			});
		},
	};
}
