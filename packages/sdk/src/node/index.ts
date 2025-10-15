import type {
	BatchEventInput,
	BatchEventResponse,
	CustomEventInput,
	DatabuddyConfig,
	EventResponse,
} from './types';
import { createLogger, createNoopLogger, type Logger } from './logger';
import { EventQueue } from './queue';

export type {
	BatchEventInput,
	BatchEventResponse,
	CustomEventInput,
	DatabuddyConfig,
	EventResponse,
	Logger,
} from './types';

const DEFAULT_API_URL = 'https://basket.databuddy.cc';
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_BATCH_TIMEOUT = 2000;
const DEFAULT_MAX_QUEUE_SIZE = 1000;

export class Databuddy {
	private clientId: string;
	private apiUrl: string;
	private logger: Logger;
	private enableBatching: boolean;
	private batchSize: number;
	private batchTimeout: number;
	private queue: EventQueue;
	private flushTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(config: DatabuddyConfig) {
		if (!config.clientId || typeof config.clientId !== 'string') {
			throw new Error('clientId is required and must be a string');
		}

		this.clientId = config.clientId.trim();
		this.apiUrl = config.apiUrl?.trim() || DEFAULT_API_URL;
		this.enableBatching = config.enableBatching !== false;
		this.batchSize = Math.min(config.batchSize || DEFAULT_BATCH_SIZE, 100);
		this.batchTimeout = config.batchTimeout || DEFAULT_BATCH_TIMEOUT;
		this.queue = new EventQueue(config.maxQueueSize || DEFAULT_MAX_QUEUE_SIZE);

		// Initialize logger: use provided logger, or create one based on debug flag
		if (config.logger) {
			this.logger = config.logger;
		} else if (config.debug) {
			this.logger = createLogger(true);
		} else {
			this.logger = createNoopLogger();
		}

		this.logger.info('Initialized', {
			clientId: this.clientId,
			apiUrl: this.apiUrl,
			enableBatching: this.enableBatching,
			batchSize: this.batchSize,
			batchTimeout: this.batchTimeout,
		});
	}

	/**
	 * Track a custom event
	 * If batching is enabled, queues the event and auto-flushes when batch size is reached or timeout expires
	 * If batching is disabled, sends the event immediately
	 *
	 * @param event - Custom event data
	 * @returns Response indicating success or failure
	 *
	 * @example
	 * ```typescript
	 * await client.track({
	 *   name: 'user_signup',
	 *   properties: { plan: 'pro' }
	 * });
	 * ```
	 */
	async track(event: CustomEventInput): Promise<EventResponse> {
		if (!event.name || typeof event.name !== 'string') {
			return {
				success: false,
				error: 'Event name is required and must be a string',
			};
		}

		const batchEvent: BatchEventInput = {
			type: 'custom',
			name: event.name,
			eventId: event.eventId,
			anonymousId: event.anonymousId,
			sessionId: event.sessionId,
			timestamp: event.timestamp,
			properties: event.properties || null,
		};

		if (!this.enableBatching) {
			return this.send(batchEvent);
		}

		const shouldFlush = this.queue.add(batchEvent);
		this.logger.debug('Event queued', { queueSize: this.queue.size() });

		this.scheduleFlush();

		if (shouldFlush || this.queue.size() >= this.batchSize) {
			await this.flush();
		}

		return { success: true };
	}

	private async send(event: BatchEventInput): Promise<EventResponse> {
		try {
			const url = `${this.apiUrl}/?client_id=${encodeURIComponent(this.clientId)}`;

			this.logger.info('📤 SENDING SINGLE EVENT:', {
				name: event.name,
				properties: JSON.stringify(event.properties, null, 2),
				propertiesCount: Object.keys(event.properties || {}).length
			});

			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(event),
			});

			if (!response.ok) {
				const errorText = await response.text().catch(() => 'Unknown error');
				this.logger.error('Request failed', {
					status: response.status,
					statusText: response.statusText,
					body: errorText,
				});
				return {
					success: false,
					error: `HTTP ${response.status}: ${response.statusText}`,
				};
			}

			const data = await response.json();

			this.logger.info('Response received', data);

			if (data.status === 'success') {
				return {
					success: true,
					eventId: data.eventId,
				};
			}

			return {
				success: false,
				error: data.message || 'Unknown error from server',
			};
		} catch (error) {
			this.logger.error('Request error', {
				error: error instanceof Error ? error.message : String(error),
			});
			return {
				success: false,
				error:
					error instanceof Error ? error.message : 'Network request failed',
			};
		}
	}

	private scheduleFlush(): void {
		if (this.flushTimer) {
			return;
		}

		this.flushTimer = setTimeout(() => {
			this.flush().catch((error) => {
				this.logger.error('Auto-flush error', {
					error: error instanceof Error ? error.message : String(error),
				});
			});
		}, this.batchTimeout);
	}

	/**
	 * Manually flush all queued events
	 * Important for serverless/stateless environments where you need to ensure events are sent before the process exits
	 *
	 * @returns Response with batch results
	 *
	 * @example
	 * ```typescript
	 * // In serverless function
	 * await client.track({ name: 'api_call' });
	 * await client.flush(); // Ensure events are sent before function exits
	 * ```
	 */
	async flush(): Promise<BatchEventResponse> {
		// Clear the flush timer
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}

		if (this.queue.isEmpty()) {
			return {
				success: true,
				processed: 0,
				results: [],
			};
		}

		const events = this.queue.getAll();
		this.queue.clear();

		this.logger.info('Flushing events', { count: events.length });

		return this.batch(events);
	}

	/**
	 * Send multiple custom events in a single batch request
	 * Max 100 events per batch
	 * Note: Usually you don't need to call this directly - use track() with batching enabled instead
	 *
	 * @param events - Array of custom events
	 * @returns Response with results for each event
	 *
	 * @example
	 * ```typescript
	 * await client.batch([
	 *   { type: 'custom', name: 'event1', properties: { foo: 'bar' } },
	 *   { type: 'custom', name: 'event2', properties: { baz: 'qux' } }
	 * ]);
	 * ```
	 */
	async batch(events: BatchEventInput[]): Promise<BatchEventResponse> {
		if (!Array.isArray(events)) {
			return {
				success: false,
				error: 'Events must be an array',
			};
		}

		if (events.length === 0) {
			return {
				success: false,
				error: 'Events array cannot be empty',
			};
		}

		if (events.length > 100) {
			return {
				success: false,
				error: 'Batch size cannot exceed 100 events',
			};
		}

		for (const event of events) {
			if (!event.name || typeof event.name !== 'string') {
				return {
					success: false,
					error: 'All events must have a valid name',
				};
			}
		}

		try {
			const url = `${this.apiUrl}/batch?client_id=${encodeURIComponent(this.clientId)}`;

			this.logger.info('📦 SENDING BATCH EVENTS:', {
				count: events.length,
				firstEventName: events[0]?.name,
				firstEventProperties: JSON.stringify(events[0]?.properties, null, 2),
				firstEventPropertiesCount: Object.keys(events[0]?.properties || {}).length
			});

			const response = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(events),
			});

			if (!response.ok) {
				const errorText = await response.text().catch(() => 'Unknown error');
				this.logger.error('Batch request failed', {
					status: response.status,
					statusText: response.statusText,
					body: errorText,
				});
				return {
					success: false,
					error: `HTTP ${response.status}: ${response.statusText}`,
				};
			}

			const data = await response.json();

			this.logger.info('Batch response received', data);

			if (data.status === 'success') {
				return {
					success: true,
					processed: data.processed,
					results: data.results,
				};
			}

			return {
				success: false,
				error: data.message || 'Unknown error from server',
			};
		} catch (error) {
			this.logger.error('Batch request error', {
				error: error instanceof Error ? error.message : String(error),
			});
			return {
				success: false,
				error:
					error instanceof Error ? error.message : 'Network request failed',
			};
		}
	}
}

/**
 * Shorthand alias for Databuddy
 */
export { Databuddy as db };

