import type { Logger } from "../types";

/**
 * Create a logger instance
 * Attempts to use pino if available, falls back to console logger
 */
export function createLogger(debug = false): Logger {
	try {
		// Dynamic require for optional pino dependency
		const pino = require("pino");
		return pino({
			level: debug ? "debug" : "info",
			name: "databuddy-server",
		});
	} catch {
		return createConsoleLogger(debug);
	}
}

/**
 * Create a console-based logger
 */
function createConsoleLogger(debug: boolean): Logger {
	const noop = () => {};

	return {
		info(msg: string, data?: Record<string, unknown>) {
			if (debug) {
				console.info(
					`[Databuddy] ${msg}`,
					data ? JSON.stringify(data) : "",
				);
			}
		},
		error(msg: string, data?: Record<string, unknown>) {
			// Always log errors
			console.error(
				`[Databuddy] ${msg}`,
				data ? JSON.stringify(data) : "",
			);
		},
		warn(msg: string, data?: Record<string, unknown>) {
			if (debug) {
				console.warn(
					`[Databuddy] ${msg}`,
					data ? JSON.stringify(data) : "",
				);
			}
		},
		debug: debug
			? (msg: string, data?: Record<string, unknown>) => {
					console.debug(
						`[Databuddy] ${msg}`,
						data ? JSON.stringify(data) : "",
					);
				}
			: noop,
	};
}

/**
 * Create a no-op logger that discards all messages
 */
export function createNoopLogger(): Logger {
	const noop = () => {};
	return {
		info: noop,
		error: noop,
		warn: noop,
		debug: noop,
	};
}
