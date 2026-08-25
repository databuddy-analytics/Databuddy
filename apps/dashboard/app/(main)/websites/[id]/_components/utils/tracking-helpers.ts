import type { TrackingOptions } from "./types";

export function enableAllBasicTracking(
	options: TrackingOptions
): TrackingOptions {
	return {
		...options,
		trackInteractions: true,
		trackOutgoingLinks: true,
	};
}

export function enableAllAdvancedTracking(
	options: TrackingOptions
): TrackingOptions {
	return {
		...options,
		trackWebVitals: true,
		trackErrors: true,
	};
}

export function enableAllOptimization(
	options: TrackingOptions
): TrackingOptions {
	return {
		...options,
		enableBatching: true,
		batchSize: 10,
		batchTimeout: 2000,
		samplingRate: 1.0,
		enableRetries: true,
		maxRetries: 3,
		initialRetryDelay: 500,
	};
}
