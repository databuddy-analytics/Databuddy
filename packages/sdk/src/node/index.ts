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
const DEFAULT_REQUEST_TIMEOUT = 10_000;
const MAX_BATCH_EVENTS = 100;
const MIN_RETRY_DELAY = 250;
const MAX_RETRY_DELAY = 30_000;

type FailedResponse = FailureDetails & {
	error: string;
	success: false;
};

interface PreparedEvent {
	aliases: object[];
	event: BatchEventInput;
}

class RequestTimeoutError extends Error {
	constructor(timeoutMs: number) {
		super(`Request timed out after ${timeoutMs}ms`);
		this.name = "RequestTimeoutError";
	}
}

function isRetryableStatus(status: number): boolean {
	return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function responseFailure(response: Response): Promise<FailedResponse> {
	const text = await response.text();
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

function queueFullFailure(maxQueueSize: number): FailedResponse {
	return {
		success: false,
		error: `Event queue is full (${maxQueueSize} events)`,
		code: "QUEUE_FULL",
		retryable: true,
		why: "The SDK already has the maximum number of events awaiting delivery.",
		fix: "Retry the same event after an in-flight delivery completes.",
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
	private readonly requestTimeoutMs: number;
	private queue: BatchEventInput[] = [];
	private pendingEvents = 0;
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	private flushPromise: Promise<BatchEventResponse> | null = null;
	private retryAttempts = 0;
	private globalProperties: GlobalProperties = {};
	private middleware: Middleware[] = [];
	private readonly enableDeduplication: boolean;
	private readonly deduplicationCache: Set<string> = new Set();
	private readonly maxDeduplicationCacheSize: number;
	private readonly preparedEvents = new WeakMap<object, PreparedEvent>();

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
		this.requestTimeoutMs = Math.max(
			1,
			Math.floor(config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT)
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

		let processedEvent: BatchEventInput | null;
		const preparedEvent = this.preparedEvents.get(event);
		if (preparedEvent) {
			processedEvent = preparedEvent.event;
		} else {
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
			processedEvent = middlewareEvent
				? withStableDeliveryIdentity(middlewareEvent, batchEvent)
				: null;
			if (processedEvent) {
				this.cachePreparedEvent(processedEvent, [event, processedEvent]);
			}
		}

		if (!processedEvent) {
			this.logger.debug("Event dropped by middleware", { name: event.name });
			return { success: true, delivery: "skipped" };
		}

		if (this.isDuplicate(processedEvent)) {
			this.logger.debug("Event deduplicated", {
				eventId: processedEvent.eventId,
			});
			if (!this.hasQueuedPreparation(processedEvent)) {
				this.forgetPreparedEvent(processedEvent);
			}
			return { success: true, delivery: "skipped" };
		}

		if (!this.enableBatching) {
			const response = await this.send(processedEvent);
			if (response.success) {
				this.rememberEvents([processedEvent]);
			}
			this.settlePreparedEvents([processedEvent], response);
			return response;
		}

		if (this.pendingEvents >= this.maxQueueSize) {
			this.logger.warn("Event queue is full", {
				maxQueueSize: this.maxQueueSize,
				pending: this.pendingEvents,
			});
			return queueFullFailure(this.maxQueueSize);
		}

		this.queue.push(processedEvent);
		this.pendingEvents += 1;
		this.logger.debug("Event queued", {
			pending: this.pendingEvents,
			queueSize: this.queue.length,
		});

		this.scheduleFlush();

		if (
			this.pendingEvents >= this.maxQueueSize ||
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
			return await this.fetchWithDeadline(
				url,
				{
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
				},
				async (response) => {
					if (!response.ok) {
						const failure = await responseFailure(response);
						this.logger.error("Identify failed", {
							status: response.status,
							code: failure.code,
							requestId: failure.requestId,
						});
						return failure;
					}

					await response.arrayBuffer();
					return { success: true, delivery: "delivered" };
				}
			);
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

			return await this.fetchWithDeadline(
				url,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${this.apiKey}`,
					},
					body: JSON.stringify(payload),
				},
				async (response) => {
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
				}
			);
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
			this.flushTimer = null;
			this.flush().catch((error) => {
				this.logger.error("Auto-flush error", {
					error: error instanceof Error ? error.message : String(error),
				});
			});
		}, delay);
		this.flushTimer.unref?.();
	}

	async flush(): Promise<BatchEventResponse> {
		if (this.flushPromise) {
			const active = this.flushPromise;
			const result = await active;
			if (this.flushPromise && this.flushPromise !== active) {
				return this.flush();
			}
			if (!result.success || this.queue.length === 0) {
				return result;
			}
			if (this.flushPromise === active) {
				this.flushPromise = null;
			}
			return this.flush();
		}

		const operation = this.flushQueue();
		this.flushPromise = operation;
		try {
			return await operation;
		} finally {
			if (this.flushPromise === operation) {
				this.flushPromise = null;
			}
		}
	}

	private async flushQueue(): Promise<BatchEventResponse> {
		let processed = 0;
		const results: NonNullable<BatchEventResponse["results"]> = [];
		while (this.queue.length > 0) {
			if (this.flushTimer) {
				clearTimeout(this.flushTimer);
				this.flushTimer = null;
			}

			const events = this.queue;
			this.queue = [];
			this.logger.info("Flushing events", { count: events.length });

			for (let offset = 0; offset < events.length; offset += MAX_BATCH_EVENTS) {
				const chunk = events.slice(offset, offset + MAX_BATCH_EVENTS);
				const result = await this.batch(chunk);
				if (!result.success) {
					if (result.retryable !== true) {
						this.releasePendingEvents(chunk.length);
					}
					const unsent = events.slice(offset + chunk.length);
					const pending = [
						...(result.retryable === true ? chunk : []),
						...unsent,
						...this.queue,
					];
					this.queue = pending.slice(0, this.maxQueueSize);
					const dropped = Math.max(0, pending.length - this.queue.length);
					this.releasePendingEvents(dropped);

					if (result.retryable === true) {
						this.retryAttempts += 1;
						this.scheduleFlush(this.retryDelay());
						this.logger.warn("Retryable batch failure kept events queued", {
							queued: this.queue.length,
							dropped,
							retryAttempt: this.retryAttempts,
							code: result.code,
							requestId: result.requestId,
						});
					} else if (this.queue.length > 0) {
						this.retryAttempts = 0;
						this.scheduleFlush(0);
					}
					return result;
				}

				this.releasePendingEvents(chunk.length);
				processed += result.processed ?? 0;
				if (result.results) {
					results.push(...result.results);
				}
			}
		}

		this.retryAttempts = 0;
		return {
			success: true,
			processed,
			results,
			delivery: processed > 0 ? "delivered" : "skipped",
		};
	}

	async batch(events: BatchEventInput[]): Promise<BatchEventResponse> {
		if (!Array.isArray(events)) {
			return validationFailure("Events must be an array");
		}

		if (events.length === 0) {
			return validationFailure("Events array cannot be empty");
		}

		if (events.length > MAX_BATCH_EVENTS) {
			return validationFailure("Batch size cannot exceed 100 events");
		}

		for (const event of events) {
			if (!event.name || typeof event.name !== "string") {
				return validationFailure("All events must have a valid name");
			}
		}

		const processedEvents: BatchEventInput[] = [];
		const seenEvents = new Map<string, BatchEventInput>();
		for (const event of events) {
			const processedEvent = await this.prepareBatchEvent(event);
			if (!processedEvent) {
				continue;
			}

			if (this.enableDeduplication && processedEvent.eventId) {
				const seenEvent = seenEvents.get(processedEvent.eventId);
				if (this.deduplicationCache.has(processedEvent.eventId) || seenEvent) {
					this.logger.debug("Event deduplicated in batch", {
						eventId: processedEvent.eventId,
					});
					if (
						!(seenEvent && this.sharesPreparedEvent(processedEvent, seenEvent))
					) {
						this.forgetPreparedEvent(processedEvent);
					}
					continue;
				}
				seenEvents.set(processedEvent.eventId, processedEvent);
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

			const result = await this.fetchWithDeadline<BatchEventResponse>(
				url,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${this.apiKey}`,
					},
					body: JSON.stringify(payloads),
				},
				async (response) => {
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
				}
			);
			this.settlePreparedEvents(processedEvents, result);
			return result;
		} catch (error) {
			this.logger.error("Batch request error", {
				error: error instanceof Error ? error.message : String(error),
			});
			return networkFailure(error);
		}
	}

	private async prepareBatchEvent(
		event: BatchEventInput
	): Promise<BatchEventInput | null> {
		const preparedEvent = this.preparedEvents.get(event);
		if (preparedEvent) {
			return preparedEvent.event;
		}

		const enrichedEvent = withStableDeliveryIdentity({
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
		});
		const middlewareEvent = await this.applyMiddleware(enrichedEvent);
		const processedEvent = middlewareEvent
			? withStableDeliveryIdentity(middlewareEvent, enrichedEvent)
			: null;

		if (processedEvent) {
			this.cachePreparedEvent(processedEvent, [
				event,
				enrichedEvent,
				processedEvent,
			]);
		}
		return processedEvent;
	}

	private async fetchWithDeadline<T>(
		input: string | URL | Request,
		init: RequestInit,
		consume: (response: Response) => Promise<T>
	): Promise<T> {
		const controller = new AbortController();
		const timeout = setTimeout(() => {
			controller.abort(new RequestTimeoutError(this.requestTimeoutMs));
		}, this.requestTimeoutMs);
		timeout.unref?.();

		try {
			const response = await fetch(input, {
				...init,
				signal: controller.signal,
			});
			return await consume(response);
		} catch (error) {
			if (controller.signal.reason instanceof RequestTimeoutError) {
				throw controller.signal.reason;
			}
			throw error;
		} finally {
			clearTimeout(timeout);
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

	private cachePreparedEvent(event: BatchEventInput, aliases: object[]): void {
		const preparedEvent: PreparedEvent = {
			aliases: [...new Set(aliases)],
			event,
		};
		for (const alias of preparedEvent.aliases) {
			this.preparedEvents.set(alias, preparedEvent);
		}
	}

	private forgetPreparedEvent(event: object): void {
		const preparedEvent = this.preparedEvents.get(event);
		if (!preparedEvent) {
			return;
		}
		for (const alias of preparedEvent.aliases) {
			if (this.preparedEvents.get(alias) === preparedEvent) {
				this.preparedEvents.delete(alias);
			}
		}
	}

	private settlePreparedEvents(
		events: BatchEventInput[],
		result: { retryable?: boolean; success: boolean }
	): void {
		if (!(result.success || result.retryable !== true)) {
			return;
		}
		for (const event of events) {
			this.forgetPreparedEvent(event);
		}
	}

	private sharesPreparedEvent(first: object, second: object): boolean {
		const preparedEvent = this.preparedEvents.get(first);
		return Boolean(
			preparedEvent && this.preparedEvents.get(second) === preparedEvent
		);
	}

	private hasQueuedPreparation(event: object): boolean {
		const preparedEvent = this.preparedEvents.get(event);
		return Boolean(
			preparedEvent &&
				this.queue.some(
					(queuedEvent) =>
						this.preparedEvents.get(queuedEvent) === preparedEvent
				)
		);
	}

	private releasePendingEvents(count: number): void {
		this.pendingEvents = Math.max(0, this.pendingEvents - count);
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
