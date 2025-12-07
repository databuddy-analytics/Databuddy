export interface Logger {
	info(msg: string, data?: Record<string, unknown>): void;
	error(msg: string, data?: Record<string, unknown>): void;
	warn(msg: string, data?: Record<string, unknown>): void;
	debug(msg: string, data?: Record<string, unknown>): void;
}

export function createLogger(debug = false): Logger {
	return createConsoleLogger(debug);
}

function createConsoleLogger(debug: boolean): Logger {
	const noop = () => {};

	return {
		info(msg: string, data?: Record<string, unknown>) {
			if (debug) {
				console.info(`[Databuddy] ${msg}`, data ? JSON.stringify(data) : "");
			}
		},
		error(msg: string, data?: Record<string, unknown>) {
			if (debug) {
				console.error(`[Databuddy] ${msg}`, data ? JSON.stringify(data) : "");
			}
		},
		warn(msg: string, data?: Record<string, unknown>) {
			if (debug) {
				console.warn(`[Databuddy] ${msg}`, data ? JSON.stringify(data) : "");
			}
		},
		debug: debug
			? (msg: string, data?: Record<string, unknown>) => {
					console.debug(`[Databuddy] ${msg}`, data ? JSON.stringify(data) : "");
				}
			: noop,
	};
}

export function createNoopLogger(): Logger {
	const noop = () => {};
	return {
		info: noop,
		error: noop,
		warn: noop,
		debug: noop,
	};
}
