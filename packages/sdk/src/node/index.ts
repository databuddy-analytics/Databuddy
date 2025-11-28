import { createLogger, createNoopLogger, type Logger } from "./logger";
import { EventQueue } from "./queue";
import type {
	BatchEventInput,
	BatchEventResponse,
	CustomEventInput,
	DatabuddyConfig,
	EventResponse,
	GlobalProperties,
	Middleware,
} from "./types";

export type {
	BatchEventInput,
	BatchEventResponse,
	CustomEventInput,
	DatabuddyConfig,
	EventResponse,
	GlobalProperties,
	Logger,
	Middleware,
} from "./types";

const DEFAULT_API_URL = "https://basket.databuddy.cc";
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_BATCH_TIMEOUT = 2000;
const DEFAULT_MAX_QUEUE_SIZE = 1000;
const DEFAULT_MAX_DEDUPLICATION_CACHE_SIZE = 10_000;

export class Databuddy {
	private readonly clientId: string;
	private apiUrl: string;
	private logger: Logger;
	private enableBatching: boolean;
	private batchSize: number;
	private batchTimeout: number;
	private queue: EventQueue;
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private globalProperties: GlobalProperties = {};
	private middleware: Middleware[] = [];
	private enableDeduplication: boolean;
	private deduplicationCache: Set<string> = new Set();
	private maxDeduplicationCacheSize: number;

	constructor(config: DatabuddyConfig) {
		if (!config.clientId || typeof config.clientId !== "string") {
			throw new Error("clientId is required and must be a string");
		}

		this.clientId = config.clientId.trim();
		this.apiUrl = config.apiUrl?.trim() || DEFAULT_API_URL;
		this.enableBatching = config.enableBatching !== false;
		this.batchSize = Math.min(config.batchSize || DEFAULT_BATCH_SIZE, 100);
		this.batchTimeout = config.batchTimeout || DEFAULT_BATCH_TIMEOUT;
		this.queue = new EventQueue(config.maxQueueSize || DEFAULT_MAX_QUEUE_SIZE);
		this.middleware = config.middleware || [];
		this.enableDeduplication = config.enableDeduplication !== false;
		this.maxDeduplicationCacheSize =
			config.maxDeduplicationCacheSize || DEFAULT_MAX_DEDUPLICATION_CACHE_SIZE;

		// Initialize logger: use provided logger, or create one based on debug flag
		if (config.logger) {
			this.logger = config.logger;
		} else if (config.debug) {
			this.logger = createLogger(true);
		} else {
			this.logger = createNoopLogger();
		}

		this.logger.info("Initialized", {
			clientId: this.clientId,
			apiUrl: this.apiUrl,
			enableBatching: this.enableBatching,
			batchSize: this.batchSize,
			batchTimeout: this.batchTimeout,
			middlewareCount: this.middleware.length,
			enableDeduplication: this.enableDeduplication,
		});
	}

	/**
	 * Track a custom event
	 * @param event - Event data to track
	 * @returns Promise with success/error response
	 * @example
	 * ```typescript
	 * await client.track({
	 *   name: 'user_signup',
	 *   properties: { plan: 'pro', source: 'web' }
	 * });
	 * ```
	 */
	async track(event: CustomEventInput): Promise<EventResponse> {
		if (!event.name || typeof event.name !== "string") {
			return {
				success: false,
				error: "Event name is required and must be a string",
			};
		}

		const batchEvent: BatchEventInput = {
			type: "custom",
			name: event.name,
			eventId: event.eventId,
			anonymousId: event.anonymousId,
			sessionId: event.sessionId,
			timestamp: event.timestamp,
			properties: {
				...this.globalProperties,
				...(event.properties || {}),
			},
		};

		const processedEvent = await this.applyMiddleware(batchEvent);
		if (!processedEvent) {
			this.logger.debug("Event dropped by middleware", { name: event.name });
			return { success: true };
		}

		if (this.enableDeduplication && processedEvent.eventId) {
			if (this.deduplicationCache.has(processedEvent.eventId)) {
				this.logger.debug("Event deduplicated", {
					eventId: processedEvent.eventId,
				});
				return { success: true };
			}
			this.addToDeduplicationCache(processedEvent.eventId);
		}

		if (!this.enableBatching) {
			return this.send(processedEvent);
		}

		const shouldFlush = this.queue.add(processedEvent);
		this.logger.debug("Event queued", { queueSize: this.queue.size() });

		this.scheduleFlush();

		if (shouldFlush || this.queue.size() >= this.batchSize) {
			await this.flush();
		}

		return { success: true };
	}

	private async send(event: BatchEventInput): Promise<EventResponse> {
		try {
			const url = `${this.apiUrl}/?client_id=${encodeURIComponent(this.clientId)}`;

			this.logger.info("📤 SENDING SINGLE EVENT:", {
				name: event.name,
				properties: JSON.stringify(event.properties, null, 2),
				propertiesCount: Object.keys(event.properties || {}).length,
			});

			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(event),
			});

			if (!response.ok) {
				const errorText = await response.text().catch(() => "Unknown error");
				this.logger.error("Request failed", {
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

			this.logger.info("Response received", data);

			if (data.status === "success") {
				return {
					success: true,
					eventId: data.eventId,
				};
			}

			return {
				success: false,
				error: data.message || "Unknown error from server",
			};
		} catch (error) {
			this.logger.error("Request error", {
				error: error instanceof Error ? error.message : String(error),
			});
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Network request failed",
			};
		}
	}

	private scheduleFlush(): void {
		if (this.flushTimer) {
			return;
		}

		this.flushTimer = setTimeout(() => {
			this.flush().catch((error) => {
				this.logger.error("Auto-flush error", {
					error: error instanceof Error ? error.message : String(error),
				});
			});
		}, this.batchTimeout);
	}

	/**
	 * Manually flush all queued events
	 * Useful in serverless environments to ensure events are sent before process exits
	 * @returns Promise with batch results
	 * @example
	 * ```typescript
	 * await client.track({ name: 'api_call' });
	 * await client.flush(); // Ensure events are sent
	 * ```
	 */
	async flush(): Promise<BatchEventResponse> {
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

		this.logger.info("Flushing events", { count: events.length });

		return this.batch(events);
	}

	/**
	 * Send multiple events in a single batch request
	 * @param events - Array of events to batch (max 100)
	 * @returns Promise with batch results
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
				error: "Events must be an array",
			};
		}

		if (events.length === 0) {
			return {
				success: false,
				error: "Events array cannot be empty",
			};
		}

		if (events.length > 100) {
			return {
				success: false,
				error: "Batch size cannot exceed 100 events",
			};
		}

		for (const event of events) {
			if (!event.name || typeof event.name !== "string") {
				return {
					success: false,
					error: "All events must have a valid name",
				};
			}
		}

		const enrichedEvents = events.map((event) => ({
			...event,
			properties: {
				...this.globalProperties,
				...(event.properties || {}),
			},
		}));

		const processedEvents: BatchEventInput[] = [];
		for (const event of enrichedEvents) {
			const processedEvent = await this.applyMiddleware(event);
			if (!processedEvent) {
				continue;
			}

			if (this.enableDeduplication && processedEvent.eventId) {
				if (this.deduplicationCache.has(processedEvent.eventId)) {
					this.logger.debug("Event deduplicated in batch", {
						eventId: processedEvent.eventId,
					});
					continue;
				}
				this.addToDeduplicationCache(processedEvent.eventId);
			}

			processedEvents.push(processedEvent);
		}

		if (processedEvents.length === 0) {
			return {
				success: true,
				processed: 0,
				results: [],
			};
		}

		try {
			const url = `${this.apiUrl}/batch?client_id=${encodeURIComponent(this.clientId)}`;

			this.logger.info("📦 SENDING BATCH EVENTS:", {
				count: processedEvents.length,
				firstEventName: processedEvents[0]?.name,
				firstEventProperties: JSON.stringify(
					processedEvents[0]?.properties,
					null,
					2
				),
				firstEventPropertiesCount: Object.keys(
					processedEvents[0]?.properties || {}
				).length,
			});

			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(processedEvents),
			});

			if (!response.ok) {
				const errorText = await response.text().catch(() => "Unknown error");
				this.logger.error("Batch request failed", {
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

			this.logger.info("Batch response received", data);

			if (data.status === "success") {
				return {
					success: true,
					processed: data.processed || processedEvents.length,
					results: data.results,
				};
			}

			return {
				success: false,
				error: data.message || "Unknown error from server",
			};
		} catch (error) {
			this.logger.error("Batch request error", {
				error: error instanceof Error ? error.message : String(error),
			});
			return {
				success: false,
				error:
					error instanceof Error ? error.message : "Network request failed",
			};
		}
	}

	/**
	 * Set global properties attached to all events
	 * Properties are merged with existing globals; event properties override globals
	 * @param properties - Properties to merge with existing globals
	 * @example
	 * ```typescript
	 * client.setGlobalProperties({ environment: 'production', version: '1.0.0' });
	 * // All subsequent events will include these properties
	 * ```
	 */
	setGlobalProperties(properties: GlobalProperties): void {
		this.globalProperties = { ...this.globalProperties, ...properties };
		this.logger.debug("Global properties updated", { properties });
	}

	/**
	 * Get current global properties
	 * @returns Copy of current global properties
	 * @example
	 * ```typescript
	 * const globals = client.getGlobalProperties();
	 * console.log(globals); // { environment: 'production', version: '1.0.0' }
	 * ```
	 */
	getGlobalProperties(): GlobalProperties {
		return { ...this.globalProperties };
	}

	/**
	 * Clear all global properties
	 * @example
	 * ```typescript
	 * client.clearGlobalProperties();
	 * // No more global properties will be attached to events
	 * ```
	 */
	clearGlobalProperties(): void {
		this.globalProperties = {};
		this.logger.debug("Global properties cleared");
	}

	/**
	 * Add middleware to transform events
	 * Middleware runs before deduplication and is executed in order
	 * Return null to drop the event, or return a modified event
	 * @param middleware - Middleware function
	 * @example
	 * ```typescript
	 * client.addMiddleware((event) => {
	 *   // Add custom field
	 *   event.properties = { ...event.properties, processed: true };
	 *   return event;
	 * });
	 *
	 * // Drop events matching a condition
	 * client.addMiddleware((event) => {
	 *   if (event.name === 'unwanted_event') return null;
	 *   return event;
	 * });
	 * ```
	 */
	addMiddleware(middleware: Middleware): void {
		this.middleware.push(middleware);
		this.logger.debug("Middleware added", {
			totalMiddleware: this.middleware.length,
		});
	}

	/**
	 * Remove all middleware functions
	 * @example
	 * ```typescript
	 * client.clearMiddleware();
	 * // All middleware transformations removed
	 * ```
	 */
	clearMiddleware(): void {
		this.middleware = [];
		this.logger.debug("Middleware cleared");
	}

	/**
	 * Get current deduplication cache size
	 * @returns Number of event IDs in cache
	 * @example
	 * ```typescript
	 * const size = client.getDeduplicationCacheSize();
	 * console.log(`Cache size: ${size}`);
	 * ```
	 */
	getDeduplicationCacheSize(): number {
		return this.deduplicationCache.size;
	}

	/**
	 * Clear the deduplication cache
	 * Useful for testing or resetting duplicate detection
	 * @example
	 * ```typescript
	 * client.clearDeduplicationCache();
	 * // All cached event IDs cleared
	 * ```
	 */
	clearDeduplicationCache(): void {
		this.deduplicationCache.clear();
		this.logger.debug("Deduplication cache cleared");
	}

	private async applyMiddleware(
		event: BatchEventInput
	): Promise<BatchEventInput | null> {
		let processedEvent: BatchEventInput | null = event;

		for (const middleware of this.middleware) {
			if (!processedEvent) {
				break;
			}
			try {
				processedEvent = await middleware(processedEvent);
			} catch (error) {
				this.logger.error("Middleware error", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		return processedEvent;
	}

	private addToDeduplicationCache(eventId: string): void {
		if (this.deduplicationCache.size >= this.maxDeduplicationCacheSize) {
			const oldest = this.deduplicationCache.values().next().value;
			if (oldest) {
				this.deduplicationCache.delete(oldest);
			}
		}
		this.deduplicationCache.add(eventId);
	}
}

/**
 * Shorthand alias for Databuddy
 */
export { Databuddy as db };
export * from "./flags";
