/**
 * Databuddy SDK Client-side Tracker
 * Provides type-safe tracking functions
 */

import type {
	DatabuddyTracker,
	EventName,
	PropertiesForEvent,
	TrackFunction,
} from './types';

/**
 * Check if the Databuddy tracker is available
 */
export function isTrackerAvailable(): boolean {
	return typeof window !== 'undefined' && (!!window.databuddy || !!window.db);
}

/**
 * Get the Databuddy tracker instance
 */
export function getTracker(): DatabuddyTracker | null {
	if (typeof window === 'undefined') {
		return null;
	}
	return window.databuddy || null;
}

/**
 * Type-safe track function
 */
export const track: TrackFunction = async <T extends EventName>(
	eventName: T,
	properties?: PropertiesForEvent<T>
): Promise<void> => {
	if (typeof window === 'undefined') {
		return;
	}

	// Try window.db first (shorthand), then window.databuddy
	const tracker = window.db?.track || window.databuddy?.track;

	if (!tracker) {
		return;
	}

	try {
		await tracker(eventName, properties as any);
	} catch (_error) {}
};
/**
 * Clear the current session
 */
export function clear(): void {
	if (typeof window === 'undefined') {
		return;
	}

	const tracker = window.db?.clear || window.databuddy?.clear;

	if (!tracker) {
		return;
	}

	try {
		tracker();
	} catch (_error) {}
}

/**
 * Flush any queued events
 */
export function flush(): void {
	if (typeof window === 'undefined') {
		return;
	}

	const tracker = window.db?.flush || window.databuddy?.flush;

	if (!tracker) {
		return;
	}

	try {
		tracker();
	} catch (_error) {}
}

/**
 * Track an error event
 */
export function trackError(
	message: string,
	properties?: {
		filename?: string;
		lineno?: number;
		colno?: number;
		stack?: string;
		error_type?: string;
		[key: string]: any;
	}
): Promise<void> {
	return track('error', { message, ...properties });
}

export default {
	track,
	clear,
	flush,
	trackError,
};
