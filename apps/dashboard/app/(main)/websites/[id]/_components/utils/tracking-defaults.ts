import type { TrackingOptions } from "./types";

// Mirrors the SDK's zero-config behavior. Source of truth: packages/sdk/src/core/types.ts.
export const ACTUAL_LIBRARY_DEFAULTS: TrackingOptions = {
	disabled: false,
	trackScreenViews: true,
	trackHashChanges: false,
	trackSessions: true,

	trackAttributes: false,
	trackOutgoingLinks: false,
	trackInteractions: false,

	trackPerformance: true,
	trackWebVitals: false,
	trackErrors: false,

	samplingRate: 1.0,
	enableRetries: true,
	maxRetries: 3,
	initialRetryDelay: 500,

	enableBatching: true,
	batchSize: 10,
	batchTimeout: 2000,
};

export const RECOMMENDED_DEFAULTS: TrackingOptions = {
	...ACTUAL_LIBRARY_DEFAULTS,
};
