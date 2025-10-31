import type { Logger } from './logger';

export type { Logger };

/**
 * Middleware function that can transform or filter events
 * Return null to drop the event, or return a modified event
 */
export type Middleware = (
	event: BatchEventInput
) => BatchEventInput | null | Promise<BatchEventInput | null>;

export interface DatabuddyConfig {
	/** Client ID from Databuddy dashboard */
	clientId: string;
	/** Custom API endpoint (default: https://basket.databuddy.cc) */
	apiUrl?: string;
	/** Enable debug logging */
	debug?: boolean;
	/** Custom logger instance */
	logger?: Logger;
	/** Enable automatic batching (default: true) */
	enableBatching?: boolean;
	/** Number of events to batch before flushing (default: 10, max: 100) */
	batchSize?: number;
	/** Time in ms before auto-flushing batched events (default: 2000) */
	batchTimeout?: number;
	/** Maximum number of events to queue (default: 1000) */
	maxQueueSize?: number;
	/** Middleware functions to transform events */
	middleware?: Middleware[];
	/** Enable event deduplication based on eventId (default: true) */
	enableDeduplication?: boolean;
	/** Maximum deduplication cache size (default: 10000) */
	maxDeduplicationCacheSize?: number;
}

export interface CustomEventInput {
	/** Event name (required) */
	name: string;
	/** Unique event ID for deduplication */
	eventId?: string;
	/** Anonymous user ID */
	anonymousId?: string | null;
	/** Session ID */
	sessionId?: string | null;
	/** Event timestamp in milliseconds */
	timestamp?: number | null;
	/** Event properties/metadata */
	properties?: Record<string, unknown> | null;
}

export interface EventResponse {
	/** Whether the event was successfully sent */
	success: boolean;
	/** Server-assigned event ID */
	eventId?: string;
	/** Error message if failed */
	error?: string;
}

export interface BatchEventInput {
	/** Event type */
	type: 'custom';
	/** Event name */
	name: string;
	/** Unique event ID for deduplication */
	eventId?: string;
	/** Anonymous user ID */
	anonymousId?: string | null;
	/** Session ID */
	sessionId?: string | null;
	/** Event timestamp in milliseconds */
	timestamp?: number | null;
	/** Event properties/metadata */
	properties?: Record<string, unknown> | null;
}

/**
 * Global properties that will be attached to all events
 */
export interface GlobalProperties {
	[key: string]: unknown;
}

export interface BatchEventResponse {
	/** Whether the batch was successfully sent */
	success: boolean;
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
	/** Error message if batch failed */
	error?: string;
}

