import type { Logger } from './logger';

export type { Logger };

export interface DatabuddyConfig {
	clientId: string;
	apiUrl?: string;
	debug?: boolean;
	logger?: Logger;
	
	/**
	 * Enable automatic batching of events
	 * Default: true
	 */
	enableBatching?: boolean;
	
	/**
	 * Number of events to batch before auto-flushing
	 * Default: 10, Max: 100
	 */
	batchSize?: number;
	
	/**
	 * Time in milliseconds before auto-flushing batched events
	 * Default: 2000ms (2 seconds)
	 */
	batchTimeout?: number;
	
	/**
	 * Maximum number of events to queue before auto-flushing
	 * Default: 1000
	 */
	maxQueueSize?: number;
}

export interface CustomEventInput {
	name: string;
	eventId?: string;
	anonymousId?: string | null;
	sessionId?: string | null;
	timestamp?: number | null;
	properties?: Record<string, unknown> | null;
}

export interface EventResponse {
	success: boolean;
	eventId?: string;
	error?: string;
}

export interface BatchEventInput {
	type: 'custom';
	name: string;
	eventId?: string;
	anonymousId?: string | null;
	sessionId?: string | null;
	timestamp?: number | null;
	properties?: Record<string, unknown> | null;
}

export interface BatchEventResponse {
	success: boolean;
	processed?: number;
	results?: Array<{
		status: string;
		type?: string;
		eventId?: string;
		message?: string;
		error?: string;
	}>;
	error?: string;
}

