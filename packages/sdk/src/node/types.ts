import type { Logger } from "./logger";

export type { Logger } from "./logger";

/** Return `null` to drop the event, or return a modified event. */
export type Middleware = (
	event: BatchEventInput
) => BatchEventInput | null | Promise<BatchEventInput | null>;

export interface DatabuddyConfig {
	/** Whether Databuddy anonymizes visitor IDs before storage. Default: true. */
	anonymizeVisitorIds?: boolean | "auto";
	/** API key for authentication (`dbdy_xxx`) */
	apiKey: string;
	/** Event ingestion endpoint (default: `'https://basket.databuddy.cc'`) */
	apiUrl?: string;
	/** Events per batch before flushing (default: 10, max: 100) */
	batchSize?: number;
	/** Auto-flush interval in ms (default: 2000) */
	batchTimeout?: number;
	debug?: boolean;
	/** Enable automatic batching (default: true) */
	enableBatching?: boolean;
	/** Deduplicate events by `eventId` (default: true) */
	enableDeduplication?: boolean;
	logger?: Logger;
	/** Max deduplication cache entries (default: 10000) */
	maxDeduplicationCacheSize?: number;
	/** Max queued events before forced flush (default: 1000) */
	maxQueueSize?: number;
	middleware?: Middleware[];
	/** Logical grouping for events (e.g. `'auth'`, `'jobs'`) */
	namespace?: string;
	/** Overall request deadline in ms (default: 10000) */
	requestTimeoutMs?: number;
	/** Origin identifier (e.g. `'backend'`, `'webhook'`, `'cli'`) */
	source?: string;
	/** Default Databuddy Client ID to scope events to */
	websiteId?: string;
}

export interface CustomEventInput {
	/** Overrides config default */
	anonymizeVisitorIds?: boolean | "auto" | null;
	anonymousId?: string | null;
	/** Unique ID for deduplication */
	eventId?: string;
	name: string;
	/** Overrides config default */
	namespace?: string | null;
	/** The identified user this event belongs to (from identify()) */
	profileId?: string | null;
	properties?: Record<string, unknown> | null;
	sessionId?: string | null;
	/** Overrides config default */
	source?: string | null;
	/** Timestamp in ms */
	timestamp?: number | null;
	/** Overrides config default */
	websiteId?: string | null;
}

export interface FailureDetails {
	code?: string;
	fix?: string;
	requestId?: string;
	retryable?: boolean;
	statusCode?: number;
	why?: string;
}

export interface EventResponse extends FailureDetails {
	delivery?: "delivered" | "queued" | "skipped";
	error?: string;
	eventId?: string;
	success: boolean;
}

/**
 * User metadata attached via identify(). Scalar values only — nested objects
 * and arrays are rejected by the server. Limits: 50 keys, 2KB serialized.
 * Setting a value to `null` removes that trait. Special keys promoted to
 * profile fields: `email` (lowercased), `username` and `name` (display name).
 */
export type ProfileTraits = Record<string, string | number | boolean | null>;

export interface IdentifyInput {
	/** Raw client anonymous ID (anon_*) to link past device activity */
	anonymousId?: string | null;
	/** Your user's stable, unique ID (max 128 chars, stored verbatim) */
	profileId: string;
	traits?: ProfileTraits | null;
	/** Overrides config default */
	websiteId?: string | null;
}

export interface BatchEventInput {
	anonymizeVisitorIds?: boolean | "auto" | null;
	anonymousId?: string | null;
	eventId?: string;
	name: string;
	namespace?: string | null;
	profileId?: string | null;
	properties?: Record<string, unknown> | null;
	sessionId?: string | null;
	source?: string | null;
	timestamp?: number | null;
	type: "custom";
	websiteId?: string | null;
}

export interface GlobalProperties {
	[key: string]: unknown;
}

export interface BatchEventResponse extends FailureDetails {
	delivery?: "delivered" | "skipped";
	error?: string;
	processed?: number;
	results?: Array<{
		status: string;
		type?: string;
		eventId?: string;
		message?: string;
		error?: string;
	}>;
	success: boolean;
}
