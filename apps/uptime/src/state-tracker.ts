import { MonitorStatus } from "./types";

interface MonitorState {
	status: MonitorStatus;
	consecutiveFailures: number;
	lastStatusChange: number;
	lastCheck: number;
}

/**
 * In-memory state tracker for uptime monitors
 * Tracks status changes and consecutive failures
 */
class StateTracker {
	private states = new Map<string, MonitorState>();

	/**
	 * Update monitor state and return previous state
	 */
	updateState(
		monitorId: string,
		currentStatus: MonitorStatus,
		timestamp: number
	): {
		previousStatus: MonitorStatus | undefined;
		consecutiveFailures: number;
		downtimeDuration: number | undefined;
	} {
		const existing = this.states.get(monitorId);

		if (!existing) {
			// First check
			this.states.set(monitorId, {
				status: currentStatus,
				consecutiveFailures: currentStatus === MonitorStatus.DOWN ? 1 : 0,
				lastStatusChange: timestamp,
				lastCheck: timestamp,
			});

			return {
				previousStatus: undefined,
				consecutiveFailures: currentStatus === MonitorStatus.DOWN ? 1 : 0,
				downtimeDuration: undefined,
			};
		}

		const previousStatus = existing.status;
		const statusChanged = previousStatus !== currentStatus;

		let consecutiveFailures = existing.consecutiveFailures;
		let lastStatusChange = existing.lastStatusChange;

		// Calculate downtime duration BEFORE updating lastStatusChange
		const downtimeDuration =
			statusChanged && currentStatus === MonitorStatus.UP
				? timestamp - existing.lastStatusChange
				: undefined;

		if (statusChanged) {
			// Status changed
			consecutiveFailures = currentStatus === MonitorStatus.DOWN ? 1 : 0;
			lastStatusChange = timestamp;
		} else if (currentStatus === MonitorStatus.DOWN) {
			// Still down, increment failures
			consecutiveFailures += 1;
		} else {
			// Still up, reset failures
			consecutiveFailures = 0;
		}

		this.states.set(monitorId, {
			status: currentStatus,
			consecutiveFailures,
			lastStatusChange,
			lastCheck: timestamp,
		});

		return {
			previousStatus,
			consecutiveFailures,
			downtimeDuration,
		};
	}

	/**
	 * Get current state for a monitor
	 */
	getState(monitorId: string): MonitorState | undefined {
		return this.states.get(monitorId);
	}

	/**
	 * Clear state for a monitor
	 */
	clearState(monitorId: string): void {
		this.states.delete(monitorId);
	}

	/**
	 * Clear all states
	 */
	clearAll(): void {
		this.states.clear();
	}
}

export const stateTracker = new StateTracker();
