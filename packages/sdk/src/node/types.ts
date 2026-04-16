import type { Logger } from "./logger";

export type { Logger } from "./logger";

/**
 * Middleware function that can transform or filter events
 * Return null to drop the event, or return a modified event
 */
export type Middleware = (
	event: BatchEventInput
) => BatchEventInput | null | Promise<BatchEventInput | null>;

export interface DatabuddyConfig {
	/** API key for authentication (dbdy_xxx) */
	apiKey: string;
	/** Custom API endpoint (default: https://basket.databuddy.cc) */
	apiUrl?: string;
	/** Number of events to batch before flushing (default: 10, max: 100) */
	batchSize?: number;
	/** Time in ms before auto-flushing batched events (default: 2000) */
	batchTimeout?: number;
	/** Enable debug logging */
	debug?: boolean;
	/** Enable automatic batching (default: true) */
	enableBatching?: boolean;
	/** Enable event deduplication based on eventId (default: true) */
	enableDeduplication?: boolean;
	/** Custom logger instance */
	logger?: Logger;
	/** Maximum deduplication cache size (default: 10000) */
	maxDeduplicationCacheSize?: number;
	/** Maximum number of events to queue (default: 1000) */
	maxQueueSize?: number;
	/** Middleware functions to transform events */
	middleware?: Middleware[];
	/** Optional default namespace for logical grouping (e.g., 'billing', 'auth', 'api') */
	namespace?: string;
	/** Optional default source identifier for events (e.g., 'backend', 'webhook', 'cli') */
	source?: string;
	/** Optional default website ID to scope events to */
	websiteId?: string;
}

export interface CustomEventInput {
	/** Anonymous user ID */
	anonymousId?: string | null;
	/** Unique event ID for deduplication */
	eventId?: string;
	/** Event name (required) */
	name: string;
	/** Namespace for logical grouping (overrides default) */
	namespace?: string | null;
	/** Event properties/metadata */
	properties?: Record<string, unknown> | null;
	/** Session ID */
	sessionId?: string | null;
	/** Source identifier (overrides default) */
	source?: string | null;
	/** Event timestamp in milliseconds */
	timestamp?: number | null;
	/** Website ID to scope the event to (overrides default) */
	websiteId?: string | null;
}

export interface EventResponse {
	/** Error message if failed */
	error?: string;
	/** Server-assigned event ID */
	eventId?: string;
	/** Whether the event was successfully sent */
	success: boolean;
}

export interface BatchEventInput {
	/** Anonymous user ID */
	anonymousId?: string | null;
	/** Unique event ID for deduplication */
	eventId?: string;
	/** Event name */
	name: string;
	/** Namespace for logical grouping */
	namespace?: string | null;
	/** Event properties/metadata */
	properties?: Record<string, unknown> | null;
	/** Session ID */
	sessionId?: string | null;
	/** Source identifier */
	source?: string | null;
	/** Event timestamp in milliseconds */
	timestamp?: number | null;
	/** Event type */
	type: "custom";
	/** Website ID to scope the event to */
	websiteId?: string | null;
}

/**
 * Global properties that will be attached to all events
 */
export interface GlobalProperties {
	[key: string]: unknown;
}

export interface BatchEventResponse {
	/** Error message if batch failed */
	error?: string;
	/** Number of events processed */
	processed?: number;
	/** Results for each event in the batch */
	results?: Array<{
		status: string;
		type?: string;
		eventId?: string;
		message?: string;
		error?: string;
	}>;
	/** Whether the batch was successfully sent */
	success: boolean;
}
