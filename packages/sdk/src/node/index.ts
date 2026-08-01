/** biome-ignore-all lint/performance/noBarrelFile: im a big fan of barrels */

import { randomUUID } from "node:crypto";
import { createLogger, createNoopLogger, type Logger } from "./logger";
import type {
	BatchEventInput,
	BatchEventResponse,
	CustomEventInput,
	DatabuddyConfig,
	EventResponse,
	FailureDetails,
	GlobalProperties,
	IdentifyInput,
	Middleware,
} from "./types";

export type {
	BatchEventInput,
	BatchEventResponse,
	CustomEventInput,
	DatabuddyConfig,
	EventResponse,
	GlobalProperties,
	IdentifyInput,
	Logger,
	Middleware,
	FailureDetails,
	ProfileTraits,
} from "./types";

const DEFAULT_API_URL = "https://basket.databuddy.cc";
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_BATCH_TIMEOUT = 2000;
const DEFAULT_MAX_QUEUE_SIZE = 1000;
const DEFAULT_MAX_DEDUPLICATION_CACHE_SIZE = 10_000;
const MIN_RETRY_DELAY = 250;
const MAX_RETRY_DELAY = 30_000;

type FailedResponse = FailureDetails & {
	error: string;
	success: false;
};

function isRetryableStatus(status: number): boolean {
	return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function responseFailure(response: Response): Promise<FailedResponse> {
	const text = await response.text().catch(() => "");
	let payload: Record<string, unknown> | null = null;
	try {
		const parsed = text ? JSON.parse(text) : null;
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			payload = parsed as Record<string, unknown>;
		}
	} catch {
		// Non-JSON upstream responses use the HTTP status fallback below.
	}
	const serverMessage = payload?.error ?? payload?.message;
	const requestId =
		response.headers.get("x-request-id") ??
		(typeof payload?.requestId === "string" ? payload.requestId : undefined);

	return {
		success: false,
		error:
			typeof serverMessage === "string" && serverMessage.trim()
				? serverMessage
				: `HTTP ${response.status}: ${response.statusText || "Request failed"}`,
		statusCode: response.status,
		retryable:
			typeof payload?.retryable === "boolean"
				? payload.retryable
				: isRetryableStatus(response.status),
		...(typeof payload?.code === "string" ? { code: payload.code } : {}),
		...(typeof payload?.why === "string" ? { why: payload.why } : {}),
		...(typeof payload?.fix === "string" ? { fix: payload.fix } : {}),
		...(requestId ? { requestId } : {}),
	};
}

function networkFailure(error: unknown): FailedResponse {
	return {
		success: false,
		error: error instanceof Error ? error.message : "Network request failed",
		code: "NETWORK_ERROR",
		retryable: true,
	};
}

function validationFailure(error: string): FailedResponse {
	return {
		success: false,
		error,
		code: "VALIDATION_ERROR",
		retryable: false,
	};
}

function withStableDeliveryIdentity(
	event: BatchEventInput,
	fallback?: BatchEventInput
): BatchEventInput {
	const candidateId = event.eventId?.trim();
	const fallbackId = fallback?.eventId?.trim();
	const candidateTimestamp = event.timestamp;
	const fallbackTimestamp = fallback?.timestamp;
	return {
		...event,
		eventId: candidateId || fallbackId || randomUUID(),
		timestamp:
			typeof candidateTimestamp === "number" &&
			Number.isFinite(candidateTimestamp)
				? Math.floor(candidateTimestamp)
				: typeof fallbackTimestamp === "number" &&
						Number.isFinite(fallbackTimestamp)
					? Math.floor(fallbackTimestamp)
					: Date.now(),
	};
}

export class Databuddy {
	private readonly apiKey: string;
	private readonly websiteId?: string;
	private readonly namespace?: string;
	private readonly source?: string;
	private readonly anonymizeVisitorIds?: boolean | "auto";
	private readonly apiUrl: string;
	private readonly logger: Logger;
	private readonly enableBatching: boolean;
	private readonly batchSize: number;
	private readonly batchTimeout: number;
	private readonly maxQueueSize: number;
	private queue: BatchEventInput[] = [];
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private retryAttempts = 0;
	private globalProperties: GlobalProperties = {};
	private middleware: Middleware[] = [];
	private readonly enableDeduplication: boolean;
	private readonly deduplicationCache: Set<string> = new Set();
	private readonly maxDeduplicationCacheSize: number;

	constructor(config: DatabuddyConfig) {
		const apiKey =
			typeof config.apiKey === "string" ? config.apiKey.trim() : "";
		if (!apiKey) {
			throw new Error("apiKey is required and must be a string");
		}

		this.apiKey = apiKey;
		this.websiteId = config.websiteId?.trim();
		this.namespace = config.namespace?.trim();
		this.source = config.source?.trim();
		this.anonymizeVisitorIds = config.anonymizeVisitorIds;
		this.apiUrl = config.apiUrl?.trim() || DEFAULT_API_URL;
		this.enableBatching = config.enableBatching !== false;
		this.batchSize = Math.min(
			Math.max(1, Math.floor(config.batchSize ?? DEFAULT_BATCH_SIZE)),
			100
		);
		this.batchTimeout = Math.max(
			1,
			Math.floor(config.batchTimeout ?? DEFAULT_BATCH_TIMEOUT)
		);
		this.maxQueueSize = Math.max(
			1,
			Math.floor(config.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE)
		);
		this.middleware = config.middleware || [];
		this.enableDeduplication = config.enableDeduplication !== false;
		this.maxDeduplicationCacheSize = Math.max(
			0,
			Math.floor(
				config.maxDeduplicationCacheSize ?? DEFAULT_MAX_DEDUPLICATION_CACHE_SIZE
			)
		);

		if (config.logger) {
			this.logger = config.logger;
		} else if (config.debug) {
			this.logger = createLogger(true);
		} else {
			this.logger = createNoopLogger();
		}

		this.logger.info("Initialized", {
			hasApiKey: true,
			websiteId: this.websiteId,
			namespace: this.namespace,
			source: this.source,
			apiUrl: this.apiUrl,
			enableBatching: this.enableBatching,
			batchSize: this.batchSize,
			batchTimeout: this.batchTimeout,
			middlewareCount: this.middleware.length,
			enableDeduplication: this.enableDeduplication,
		});
	}

	async track(event: CustomEventInput): Promise<EventResponse> {
		if (!event.name || typeof event.name !== "string") {
			return validationFailure("Event name is required and must be a string");
		}

		const batchEvent = withStableDeliveryIdentity({
			type: "custom",
			name: event.name,
			eventId: event.eventId,
			anonymousId: event.anonymousId,
			anonymizeVisitorIds:
				event.anonymizeVisitorIds ?? this.anonymizeVisitorIds,
			profileId: event.profileId,
			sessionId: event.sessionId,
			timestamp: event.timestamp,
			properties: {
				...this.globalProperties,
				...(event.properties || {}),
			},
			websiteId: event.websiteId ?? this.websiteId,
			namespace: event.namespace ?? this.namespace,
			source: event.source ?? this.source,
		});

		const middlewareEvent = await this.applyMiddleware(batchEvent);
		if (!middlewareEvent) {
			this.logger.debug("Event dropped by middleware", { name: event.name });
			return { success: true, delivery: "skipped" };
		}
		const processedEvent = withStableDeliveryIdentity(
			middlewareEvent,
			batchEvent
		);

		if (this.isDuplicate(processedEvent)) {
			this.logger.debug("Event deduplicated", {
				eventId: processedEvent.eventId,
			});
			return { success: true, delivery: "skipped" };
		}

		if (!this.enableBatching) {
			const response = await this.send(processedEvent);
			if (response.success) {
				this.rememberEvents([processedEvent]);
			}
			return response;
		}

		this.queue.push(processedEvent);
		this.logger.debug("Event queued", { queueSize: this.queue.length });

		this.scheduleFlush();

		if (
			this.queue.length >= this.maxQueueSize ||
			this.queue.length >= this.batchSize
		) {
			return this.flush();
		}

		return { success: true, delivery: "queued" };
	}

	/**
	 * Link a user ID from your system to their tracked activity. Pass the
	 * client's `anonymousId` (readable via the web SDK's getAnonymousId())
	 * to connect pre-login events from that device. Requires an API key
	 * with the track:events scope for the target website.
	 */
	async identify(input: IdentifyInput): Promise<EventResponse> {
		if (typeof input.profileId !== "string" || !input.profileId.trim()) {
			return validationFailure(
				"profileId is required and must be a non-empty string"
			);
		}

		const websiteId = input.websiteId ?? this.websiteId;
		if (!websiteId) {
			return validationFailure(
				"websiteId is required (set it in config or pass it per call)"
			);
		}

		try {
			const url = `${this.apiUrl}/identify`;
			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify({
					profileId: input.profileId.trim(),
					anonymousId: input.anonymousId ?? undefined,
					traits: input.traits ?? undefined,
					websiteId,
				}),
			});

			if (!response.ok) {
				const failure = await responseFailure(response);
				this.logger.error("Identify failed", {
					status: response.status,
					code: failure.code,
					requestId: failure.requestId,
				});
				return failure;
			}

			return { success: true, delivery: "delivered" };
		} catch (error) {
			this.logger.error("Identify error", { error });
			return networkFailure(error);
		}
	}

	private toTrackPayload(event: BatchEventInput) {
		return {
			eventId: event.eventId,
			name: event.name,
			namespace: event.namespace ?? undefined,
			timestamp: event.timestamp,
			properties: event.properties ?? undefined,
			anonymousId: event.anonymousId ?? undefined,
			anonymizeVisitorIds: event.anonymizeVisitorIds ?? undefined,
			profileId: event.profileId ?? undefined,
			sessionId: event.sessionId ?? undefined,
			websiteId: event.websiteId ?? undefined,
			source: event.source ?? undefined,
		};
	}

	private async send(event: BatchEventInput): Promise<EventResponse> {
		try {
			const url = `${this.apiUrl}/track`;
			const payload = this.toTrackPayload(event);

			this.logger.info("Sending event", {
				name: payload.name,
				websiteId: payload.websiteId,
				source: payload.source,
			});

			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				const failure = await responseFailure(response);
				this.logger.error("Request failed", {
					status: response.status,
					statusText: response.statusText,
					code: failure.code,
					requestId: failure.requestId,
				});
				return failure;
			}

			const data = await response.json();
			this.logger.info("Response received", data);

			if (data.status === "success") {
				return {
					success: true,
					eventId: data.eventId,
					delivery: "delivered",
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
			return networkFailure(error);
		}
	}

	private retryDelay(): number {
		const base = Math.max(
			MIN_RETRY_DELAY,
			Math.min(this.batchTimeout, MAX_RETRY_DELAY)
		);
		const exponent = Math.min(Math.max(0, this.retryAttempts - 1), 16);
		return Math.min(base * 2 ** exponent, MAX_RETRY_DELAY);
	}

	private scheduleFlush(delay = this.batchTimeout): void {
		if (this.flushTimer) {
			return;
		}

		this.flushTimer = setTimeout(() => {
			this.flush().catch((error) => {
				this.logger.error("Auto-flush error", {
					error: error instanceof Error ? error.message : String(error),
				});
			});
		}, delay);
		this.flushTimer.unref?.();
	}

	async flush(): Promise<BatchEventResponse> {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}

		if (this.queue.length === 0) {
			this.retryAttempts = 0;
			return {
				success: true,
				processed: 0,
				results: [],
				delivery: "skipped",
			};
		}

		const events = [...this.queue];
		this.queue = [];

		this.logger.info("Flushing events", { count: events.length });

		const result = await this.batch(events);
		if (!result.success && result.retryable === true) {
			const pending = [...events, ...this.queue];
			this.queue = pending.slice(0, this.maxQueueSize);
			this.retryAttempts += 1;
			this.scheduleFlush(this.retryDelay());
			this.logger.warn("Retryable batch failure kept events queued", {
				queued: this.queue.length,
				dropped: Math.max(0, pending.length - this.queue.length),
				retryAttempt: this.retryAttempts,
				code: result.code,
				requestId: result.requestId,
			});
			return result;
		}
		this.retryAttempts = 0;
		return result;
	}

	async batch(events: BatchEventInput[]): Promise<BatchEventResponse> {
		if (!Array.isArray(events)) {
			return validationFailure("Events must be an array");
		}

		if (events.length === 0) {
			return validationFailure("Events array cannot be empty");
		}

		if (events.length > 100) {
			return validationFailure("Batch size cannot exceed 100 events");
		}

		for (const event of events) {
			if (!event.name || typeof event.name !== "string") {
				return validationFailure("All events must have a valid name");
			}
		}

		const enrichedEvents = events.map((event) =>
			withStableDeliveryIdentity({
				...event,
				properties: {
					...this.globalProperties,
					...(event.properties || {}),
				},
				anonymizeVisitorIds:
					event.anonymizeVisitorIds ?? this.anonymizeVisitorIds,
				websiteId: event.websiteId ?? this.websiteId,
				namespace: event.namespace ?? this.namespace,
				source: event.source ?? this.source,
			})
		);

		const processedEvents: BatchEventInput[] = [];
		const seenEventIds = new Set<string>();
		for (const event of enrichedEvents) {
			const middlewareEvent = await this.applyMiddleware(event);
			if (!middlewareEvent) {
				continue;
			}
			const processedEvent = withStableDeliveryIdentity(middlewareEvent, event);

			if (this.enableDeduplication && processedEvent.eventId) {
				if (
					this.deduplicationCache.has(processedEvent.eventId) ||
					seenEventIds.has(processedEvent.eventId)
				) {
					this.logger.debug("Event deduplicated in batch", {
						eventId: processedEvent.eventId,
					});
					continue;
				}
				seenEventIds.add(processedEvent.eventId);
			}

			processedEvents.push(processedEvent);
		}

		if (processedEvents.length === 0) {
			return {
				success: true,
				processed: 0,
				results: [],
				delivery: "skipped",
			};
		}

		try {
			const url = `${this.apiUrl}/track`;
			const payloads = processedEvents.map((event) =>
				this.toTrackPayload(event)
			);

			this.logger.info("Sending batch", {
				count: payloads.length,
				firstEventName: payloads[0]?.name,
				firstWebsiteId: payloads[0]?.websiteId,
				firstSource: payloads[0]?.source,
			});

			const response = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify(payloads),
			});

			if (!response.ok) {
				const failure = await responseFailure(response);
				this.logger.error("Batch request failed", {
					status: response.status,
					statusText: response.statusText,
					code: failure.code,
					requestId: failure.requestId,
				});
				return failure;
			}

			const data = await response.json();
			this.logger.info("Batch response received", data);

			if (data.status === "success") {
				this.rememberEvents(processedEvents);
				return {
					success: true,
					delivery: "delivered",
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
			return networkFailure(error);
		}
	}

	setGlobalProperties(properties: GlobalProperties): void {
		this.globalProperties = { ...this.globalProperties, ...properties };
		this.logger.debug("Global properties updated", { properties });
	}

	getGlobalProperties(): GlobalProperties {
		return { ...this.globalProperties };
	}

	clearGlobalProperties(): void {
		this.globalProperties = {};
		this.logger.debug("Global properties cleared");
	}

	addMiddleware(middleware: Middleware): void {
		this.middleware.push(middleware);
		this.logger.debug("Middleware added", {
			totalMiddleware: this.middleware.length,
		});
	}

	clearMiddleware(): void {
		this.middleware = [];
		this.logger.debug("Middleware cleared");
	}

	getDeduplicationCacheSize(): number {
		return this.deduplicationCache.size;
	}

	clearDeduplicationCache(): void {
		this.deduplicationCache.clear();
		this.logger.debug("Deduplication cache cleared");
	}

	private isDuplicate(event: BatchEventInput): boolean {
		if (!(this.enableDeduplication && event.eventId)) {
			return false;
		}
		return (
			this.deduplicationCache.has(event.eventId) ||
			this.queue.some((queuedEvent) => queuedEvent.eventId === event.eventId)
		);
	}

	private rememberEvents(events: BatchEventInput[]): void {
		if (!this.enableDeduplication) {
			return;
		}
		for (const event of events) {
			if (event.eventId) {
				this.addToDeduplicationCache(event.eventId);
			}
		}
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
		if (this.maxDeduplicationCacheSize === 0) {
			return;
		}
		while (this.deduplicationCache.size >= this.maxDeduplicationCacheSize) {
			const oldest = this.deduplicationCache.values().next().value;
			if (oldest === undefined) {
				break;
			}
			this.deduplicationCache.delete(oldest);
		}
		this.deduplicationCache.add(eventId);
	}
}

export * from "./flags";

export { Databuddy as db };
