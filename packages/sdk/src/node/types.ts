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
	properties?: Record<string, unknown> | null;
	sessionId?: string | null;
	/** Overrides config default */
	source?: string | null;
	/** Timestamp in ms */
	timestamp?: number | null;
	/** Overrides config default */
	websiteId?: string | null;
}

export interface EventResponse {
	error?: string;
	eventId?: string;
	success: boolean;
}

export interface BatchEventInput {
	anonymizeVisitorIds?: boolean | "auto" | null;
	anonymousId?: string | null;
	eventId?: string;
	name: string;
	namespace?: string | null;
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

export interface BatchEventResponse {
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
