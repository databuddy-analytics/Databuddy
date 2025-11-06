import { RECOMMENDED_DEFAULTS } from "./tracking-defaults";
import type { TrackingOptions } from "./types";

/**
 * Toggle a specific tracking option
 */
export function toggleTrackingOption(
	options: TrackingOptions,
	option: keyof TrackingOptions
): TrackingOptions {
	return {
		...options,
		[option]: !options[option],
	};
}

/**
 * Enable all basic tracking options
 */
export function enableAllBasicTracking(
	options: TrackingOptions
): TrackingOptions {
	return {
		...options,
		trackScreenViews: true,
		trackSessions: true,
		trackInteractions: true,
		trackOutgoingLinks: true,
	};
}

/**
 * Enable all interaction tracking options
 */
export function enableAllInteractionTracking(
	options: TrackingOptions
): TrackingOptions {
	return {
		...options,
		trackAttributes: true,
		trackOutgoingLinks: true,
		trackInteractions: true,
		trackHashChanges: true,
	};
}

/**
 * Enable all engagement tracking options
 */
export function enableAllEngagementTracking(
	options: TrackingOptions
): TrackingOptions {
	return {
		...options,
		trackEngagement: true,
		trackScrollDepth: true,
		trackExitIntent: true,
		trackBounceRate: true,
	};
}

/**
 * Enable all performance tracking options
 */
export function enableAllPerformanceTracking(
	options: TrackingOptions
): TrackingOptions {
	return {
		...options,
		trackPerformance: true,
		trackWebVitals: true,
		trackErrors: true,
	};
}

/**
 * Enable all advanced tracking options
 */
export function enableAllAdvancedTracking(
	options: TrackingOptions
): TrackingOptions {
	return {
		...options,
		...enableAllEngagementTracking(options),
		...enableAllPerformanceTracking(options),
		trackErrors: true,
		trackPerformance: true,
		trackWebVitals: true,
	};
}

/**
 * Enable batching with optimal settings
 */
export function enableOptimalBatching(
	options: TrackingOptions
): TrackingOptions {
	return {
		...options,
		enableBatching: true,
		batchSize: 10,
		batchTimeout: 2000,
	};
}

/**
 * Enable all optimization options
 */
export function enableAllOptimization(
	options: TrackingOptions
): TrackingOptions {
	return {
		...options,
		...enableOptimalBatching(options),
		samplingRate: 1.0,
		enableRetries: true,
		maxRetries: 3,
		initialRetryDelay: 500,
	};
}

/**
 * Disable all tracking (privacy mode)
 */
export function enablePrivacyMode(options: TrackingOptions): TrackingOptions {
	return {
		...options,
		disabled: true,
		trackScreenViews: false,
		trackSessions: false,
		trackInteractions: false,
		trackOutgoingLinks: false,
		trackAttributes: false,
		trackEngagement: false,
		trackScrollDepth: false,
		trackExitIntent: false,
		trackBounceRate: false,
		trackPerformance: false,
		trackWebVitals: false,
		trackErrors: false,
	};
}

/**
 * Reset options to recommended defaults
 */
export function resetToDefaults(): TrackingOptions {
	return { ...RECOMMENDED_DEFAULTS };
}
