import type { TrackingOptions } from "./types";

// Library defaults - what the actual SDK uses when no options are provided
// Reference: packages/sdk/src/core/types.ts
export const ACTUAL_LIBRARY_DEFAULTS: TrackingOptions = {
	// Core tracking
	disabled: false,
	trackScreenViews: true, // Always true, automatic
	trackHashChanges: false,
	trackSessions: true, // Always true, automatic

	// Interaction tracking
	trackAttributes: false,
	trackOutgoingLinks: false,
	trackInteractions: false,

	// Advanced tracking
	trackEngagement: false,
	trackScrollDepth: false,
	trackExitIntent: false,
	trackBounceRate: false,

	// Performance tracking
	trackPerformance: true,
	trackWebVitals: false,
	trackErrors: false,

	// Optimization
	samplingRate: 1.0,
	enableRetries: false,
	maxRetries: 3,
	initialRetryDelay: 500,

	// Batching
	enableBatching: true,
	batchSize: 10,
	batchTimeout: 2000,
};

// Recommended defaults for new users
export const RECOMMENDED_DEFAULTS: TrackingOptions = {
	...ACTUAL_LIBRARY_DEFAULTS,
};
