/**
 * Logger utility for Databuddy SDK
 * Provides debug logging with configurable enable/disable
 */

class Logger {
	private debugEnabled = false;

	/**
	 * Enable or disable debug logging
	 */
	setDebug(enabled: boolean): void {
		this.debugEnabled = enabled;
	}

	/**
	 * Log debug messages (only when debug is enabled)
	 */
	debug(...args: unknown[]): void {
		if (this.debugEnabled) {
			console.log('[Databuddy]', ...args);
		}
	}

	/**
	 * Log info messages (always enabled)
	 */
	info(...args: unknown[]): void {
		console.info('[Databuddy]', ...args);
	}

	/**
	 * Log warning messages (always enabled)
	 */
	warn(...args: unknown[]): void {
		console.warn('[Databuddy]', ...args);
	}

	/**
	 * Log error messages (always enabled)
	 */
	error(...args: unknown[]): void {
		console.error('[Databuddy]', ...args);
	}

	/**
	 * Log with table format (only when debug is enabled)
	 */
	table(data: unknown): void {
		if (this.debugEnabled) {
			console.table(data);
		}
	}

	/**
	 * Time a function execution (only when debug is enabled)
	 */
	time(label: string): void {
		if (this.debugEnabled) {
			console.time(`[Databuddy] ${label}`);
		}
	}

	/**
	 * End timing a function execution (only when debug is enabled)
	 */
	timeEnd(label: string): void {
		if (this.debugEnabled) {
			console.timeEnd(`[Databuddy] ${label}`);
		}
	}

	/**
	 * Log JSON data (only when debug is enabled)
	 */
	json(data: unknown): void {
		if (this.debugEnabled) {
			console.log('[Databuddy]', JSON.stringify(data, null, 2));
		}
	}
}

export const logger = new Logger();
