type LogLevel = "info" | "error" | "warn" | "debug";

/**
 * Structured logger for AI tools.
 * Provides consistent log formatting across all tools.
 */
export function createToolLogger(toolName: string) {
	const formatMessage = (
		level: LogLevel,
		message: string,
		context?: Record<string, unknown>
	) => {
		const emoji = {
			info: "📊",
			error: "❌",
			warn: "⚠️",
			debug: "🔍",
		}[level];

		return {
			emoji,
			prefix: `[${toolName}]`,
			message,
			context,
		};
	};

	return {
		info: (message: string, context?: Record<string, unknown>) => {
			const {
				emoji,
				prefix,
				context: ctx,
			} = formatMessage("info", message, context);
			console.info(`${emoji} ${prefix} ${message}`, ctx ?? "");
		},

		error: (message: string, context?: Record<string, unknown>) => {
			const {
				emoji,
				prefix,
				context: ctx,
			} = formatMessage("error", message, context);
			console.error(`${emoji} ${prefix} ${message}`, ctx ?? "");
		},

		warn: (message: string, context?: Record<string, unknown>) => {
			const {
				emoji,
				prefix,
				context: ctx,
			} = formatMessage("warn", message, context);
			console.warn(`${emoji} ${prefix} ${message}`, ctx ?? "");
		},

		debug: (message: string, context?: Record<string, unknown>) => {
			const {
				emoji,
				prefix,
				context: ctx,
			} = formatMessage("debug", message, context);
			console.debug(`${emoji} ${prefix} ${message}`, ctx ?? "");
		},
	};
}
