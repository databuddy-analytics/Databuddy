import type { TrackingOptions } from "./types";

// Library defaults - what the actual tracking library uses when no options are provided
export const ACTUAL_LIBRARY_DEFAULTS: TrackingOptions = {
	// Core tracking
	disabled: false,
	trackScreenViews: true,
	trackHashChanges: false,
	trackSessions: true,

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
	enableRetries: true,
	maxRetries: 3,
	initialRetryDelay: 500,

	// Batching
	enableBatching: false,
	batchSize: 10,
	batchTimeout: 2000,
};

// Recommended defaults for new users - what we suggest they start with
export const RECOMMENDED_DEFAULTS: TrackingOptions = {
	// Core tracking
	disabled: false,
	trackScreenViews: true,
	trackHashChanges: false,
	trackSessions: true,

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
	enableRetries: true,
	maxRetries: 3,
	initialRetryDelay: 500,

	// Batching
	enableBatching: true,
	batchSize: 10,
	batchTimeout: 2000,
};
