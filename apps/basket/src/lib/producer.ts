import { createHash } from "node:crypto";
import type { ClickHouseClient } from "@clickhouse/client";
import { clickHouse, TABLE_NAMES } from "@databuddy/db/clickhouse";
import { readBooleanEnv } from "@databuddy/env/app";
import { PRODUCER_DRAIN_TIMEOUT_MS } from "@lib/shutdown-budget";
import { captureError, record } from "@lib/tracing";
import { Data, Deferred, Effect, Ref } from "effect";
import { createError, log } from "evlog";
import {
	type Admin,
	CompressionTypes,
	Kafka,
	type Message,
	type Producer,
} from "kafkajs";

export interface ProducerConfig {
	broker?: string;
	chunkSize: number;
	connectTimeout: number;
	directFallbackTimeout: number;
	healthProbeTimeout: number;
	kafkaTimeout: number;
	maxProducerRetries: number;
	password?: string;
	producerRetryDelay: number;
	reconnectCooldown: number;
	selfHost: boolean;
	shutdownDrainTimeout: number;
	username?: string;
}

type ClickHouseInserter = Pick<ClickHouseClient, "insert">;
type KafkaProducer = Pick<Producer, "connect" | "disconnect" | "send">;
type KafkaAdmin = Pick<
	Admin,
	"connect" | "describeCluster" | "disconnect" | "listTopics"
>;

interface DeliveryOptions {
	readonly allowDirectFallback?: boolean;
}

export interface EventProducer {
	checkConnection: Effect.Effect<void, ProducerUnavailableError>;
	sendMany: (
		topic: string,
		events: unknown[],
		deliveryIds?: string[],
		options?: DeliveryOptions
	) => Effect.Effect<void, DeliveryError>;
	sendOne: (
		topic: string,
		event: unknown,
		key?: string,
		options?: DeliveryOptions
	) => Effect.Effect<void, DeliveryError>;
	shutDown: Effect.Effect<void, ShutdownDrainError>;
}

class KafkaConnectionError extends Data.TaggedError("KafkaConnectionError")<{
	readonly cause?: Error;
}> {}
class KafkaSendError extends Data.TaggedError("KafkaSendError")<{
	readonly topic: string;
	readonly cause?: Error;
}> {}
class ProducerShuttingDownError extends Data.TaggedError(
	"ProducerShuttingDownError"
)<{
	readonly eventCount: number;
	readonly retryable: true;
}> {}
class ProducerUnavailableError extends Data.TaggedError(
	"ProducerUnavailableError"
)<{
	readonly cause?: Error;
	readonly retryable: true;
}> {}
class UnknownKafkaTopicError extends Data.TaggedError(
	"UnknownKafkaTopicError"
)<{
	readonly retryable: false;
	readonly topic: string;
}> {}
class ClickHouseFallbackError extends Data.TaggedError(
	"ClickHouseFallbackError"
)<{
	readonly cause?: Error;
	readonly retryable: true;
	readonly table: string;
	readonly topic: string;
}> {}
export class ShutdownDrainError extends Data.TaggedError("ShutdownDrainError")<{
	readonly cause?: Error;
	readonly deadlineMs: number;
	readonly inFlight: number;
	readonly phase: "disconnect" | "drain";
	readonly retryable: true;
}> {}

type DeliveryError =
	| KafkaSendError
	| ProducerShuttingDownError
	| ProducerUnavailableError
	| UnknownKafkaTopicError
	| ClickHouseFallbackError;

interface ProducerState {
	connected: boolean;
	connecting: Deferred.Deferred<boolean> | null;
	connectionFailedAt: number | null;
	inFlight: number;
	producerInitialized: boolean;
	shuttingDown: boolean;
}

type ConnectDecision =
	| { readonly type: "connected" }
	| { readonly deferred: Deferred.Deferred<boolean>; readonly type: "connect" }
	| { readonly type: "fallback" }
	| { readonly type: "shutting-down" }
	| { readonly deferred: Deferred.Deferred<boolean>; readonly type: "wait" };

const INITIAL_STATE: ProducerState = {
	connected: false,
	connecting: null,
	connectionFailedAt: null,
	inFlight: 0,
	producerInitialized: false,
	shuttingDown: false,
};

const ASYNC_INSERT_BUSY_TIMEOUT_MS = 50;

const TOPIC_ERROR_TYPES = new Set([
	"INVALID_TOPIC_EXCEPTION",
	"TOPIC_AUTHORIZATION_FAILED",
	"UNKNOWN_TOPIC_OR_PARTITION",
]);

class DeadlineError extends Error {}

function toError(err: unknown): Error {
	return err instanceof Error ? err : new Error(String(err));
}

function stringifyEvent(event: unknown): string {
	return JSON.stringify(event, (_key, value) =>
		value === undefined ? null : value
	);
}

function isTopicError(error: unknown): boolean {
	let current = error;
	for (let depth = 0; current instanceof Error && depth < 5; depth++) {
		const type = (current as { type?: unknown }).type;
		if (typeof type === "string" && TOPIC_ERROR_TYPES.has(type)) {
			return true;
		}
		current = current.cause;
	}
	return false;
}

interface DeadlineOptions {
	message: string;
	onAbandon?: () => void;
	signal?: AbortSignal;
	timeoutMs: number;
}

function withDeadline<T>(
	operation: Promise<T>,
	{ message, onAbandon, signal, timeoutMs }: DeadlineOptions
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		let settled = false;
		let timeout: ReturnType<typeof setTimeout> | undefined;

		const finish = (complete: () => void, abandoned = false) => {
			if (settled) {
				return;
			}
			settled = true;
			if (abandoned) {
				onAbandon?.();
			}
			clearTimeout(timeout);
			signal?.removeEventListener("abort", handleAbort);
			complete();
		};
		const handleAbort = () =>
			finish(
				() =>
					reject(
						signal?.reason instanceof Error
							? signal.reason
							: new Error(`${message} (cancelled)`)
					),
				true
			);

		operation.then(
			(value) => finish(() => resolve(value)),
			(error) => finish(() => reject(error))
		);
		timeout = setTimeout(
			() => finish(() => reject(new DeadlineError(message)), true),
			timeoutMs
		);
		timeout.unref?.();
		if (signal?.aborted) {
			handleAbort();
		} else {
			signal?.addEventListener("abort", handleAbort, { once: true });
		}
	});
}

interface ActiveHealthProbe {
	cancelled: boolean;
	promise: Promise<void>;
}

interface KafkaHealthProbe {
	beginShutdown: () => void;
	disconnect: () => Promise<void>;
	hasActiveProbe: () => boolean;
	probe: (timeoutMs: number) => Promise<void>;
}

function createKafkaHealthProbe(
	admin: KafkaAdmin,
	requiredTopics: string[]
): KafkaHealthProbe {
	let activeProbe: ActiveHealthProbe | null = null;
	let connected = false;
	let disconnecting: Promise<void> | null = null;
	let shuttingDown = false;

	const disconnect = (): Promise<void> => {
		if (disconnecting) {
			return disconnecting;
		}
		if (!(connected || activeProbe)) {
			return Promise.resolve();
		}

		connected = false;
		const operation = admin.disconnect().finally(() => {
			if (disconnecting === operation) {
				disconnecting = null;
			}
		});
		disconnecting = operation;
		return operation;
	};

	const startProbe = (): ActiveHealthProbe => {
		if (activeProbe) {
			return activeProbe;
		}

		const probe: ActiveHealthProbe = {
			cancelled: false,
			promise: Promise.resolve(),
		};
		const assertActive = () => {
			if (probe.cancelled || shuttingDown) {
				throw new Error("Redpanda health probe cancelled");
			}
		};
		probe.promise = (async () => {
			try {
				if (!connected) {
					await admin.connect();
					connected = true;
				}
				assertActive();
				const cluster = await admin.describeCluster();
				assertActive();
				if (cluster.brokers.length === 0) {
					throw new Error("Redpanda returned no brokers");
				}
				const existingTopics = new Set(await admin.listTopics());
				assertActive();
				const missingTopics = requiredTopics.filter(
					(topic) => !existingTopics.has(topic)
				);
				if (missingTopics.length > 0) {
					throw new Error(
						`Redpanda is missing topics: ${missingTopics.join(", ")}`
					);
				}
			} catch (error) {
				try {
					await disconnect();
				} catch (disconnectError) {
					captureError(disconnectError, {
						message: "Error disconnecting Redpanda health client",
					});
				}
				throw error;
			}
		})();
		activeProbe = probe;
		const clearActiveProbe = () => {
			if (activeProbe === probe) {
				activeProbe = null;
			}
		};
		probe.promise.then(clearActiveProbe, clearActiveProbe);
		return probe;
	};

	return {
		beginShutdown: () => {
			shuttingDown = true;
			if (activeProbe) {
				activeProbe.cancelled = true;
			}
		},
		disconnect,
		hasActiveProbe: () => activeProbe !== null,
		probe: async (timeoutMs) => {
			if (shuttingDown) {
				throw new Error("Redpanda health client is shutting down");
			}
			const probe = startProbe();
			try {
				await withDeadline(probe.promise, {
					message: `Redpanda health probe exceeded ${timeoutMs}ms`,
					timeoutMs,
				});
			} catch (error) {
				if (error instanceof DeadlineError) {
					probe.cancelled = true;
					disconnect().catch((disconnectError) => {
						captureError(disconnectError, {
							message: "Failed to cancel Redpanda health probe",
						});
					});
				}
				throw error;
			}
		},
	};
}

function deduplicationToken(
	table: string,
	events: unknown[],
	deliveryIds?: string[]
): string {
	const hash = createHash("sha256").update(table);
	for (const [index, event] of events.entries()) {
		hash.update("\0");
		const deliveryId = deliveryIds?.[index];
		if (deliveryId) {
			hash.update(deliveryId);
			continue;
		}
		if (event && typeof event === "object") {
			const candidate = event as { event_id?: unknown; id?: unknown };
			const id = candidate.id ?? candidate.event_id;
			if (typeof id === "string" || typeof id === "number") {
				hash.update(String(id));
				continue;
			}
		}
		hash.update(stringifyEvent(event));
	}
	return hash.digest("hex");
}

function withoutDeliveryIds(table: string, events: unknown[]): unknown[] {
	if (table !== TABLE_NAMES.custom_events) {
		return events;
	}

	return events.map((event) => {
		if (
			!event ||
			typeof event !== "object" ||
			!Object.hasOwn(event, "delivery_id")
		) {
			return event;
		}

		const { delivery_id: _deliveryId, ...customEvent } = event as Record<
			string,
			unknown
		>;
		return customEvent;
	});
}

async function insertIntoClickHouse(
	ch: ClickHouseInserter,
	table: string,
	events: unknown[],
	chunkSize: number,
	timeoutMs: number,
	deliveryIds?: string[]
) {
	const controller = new AbortController();
	const insertAllChunks = async () => {
		for (let i = 0; i < events.length; i += chunkSize) {
			const values = events.slice(i, i + chunkSize);
			const token = deduplicationToken(
				table,
				values,
				deliveryIds?.slice(i, i + chunkSize)
			);
			await ch.insert({
				table,
				values: withoutDeliveryIds(table, values),
				format: "JSONEachRow",
				abort_signal: controller.signal,
				clickhouse_settings: {
					async_insert: 1,
					wait_for_async_insert: 1,
					async_insert_busy_timeout_ms: ASYNC_INSERT_BUSY_TIMEOUT_MS,
					insert_deduplication_token: token,
				},
				query_id: `basket-${token}`,
			});
		}
	};

	await withDeadline(insertAllChunks(), {
		message: `Direct ClickHouse fallback exceeded ${timeoutMs}ms admission deadline`,
		onAbandon: () => controller.abort(),
		timeoutMs,
	});
}

export function createEventProducer({
	clickHouse: ch,
	config,
	kafka = null,
	kafkaAdmin = null,
	topicMap,
}: {
	clickHouse: ClickHouseInserter;
	config: ProducerConfig;
	kafka?: KafkaProducer | null;
	kafkaAdmin?: KafkaAdmin | null;
	topicMap: Record<string, string>;
}): EventProducer {
	const state = Ref.makeUnsafe<ProducerState>(INITIAL_STATE);
	const producer = config.selfHost || !config.broker ? null : kafka;
	const healthProbe = kafkaAdmin
		? createKafkaHealthProbe(kafkaAdmin, Object.keys(topicMap))
		: null;
	const unacknowledgedSends = new Map<Promise<unknown>, number>();
	const unacknowledgedCount = () =>
		Array.from(unacknowledgedSends.values()).reduce((total, n) => total + n, 0);
	const topicFailedAt = new Map<string, number>();

	const withinCooldown = (failedAt: number | null) =>
		failedAt !== null && Date.now() - failedAt < config.reconnectCooldown;

	const reportError = (
		cause: unknown,
		context: Parameters<typeof captureError>[1]
	) => Effect.sync(() => captureError(cause, context));

	const unavailable = (cause: unknown) =>
		new ProducerUnavailableError({ cause: toError(cause), retryable: true });

	const withInFlight = <A, E, S>(
		count: number,
		shuttingDownError: () => S,
		effect: Effect.Effect<A, E>
	): Effect.Effect<A, E | S> =>
		Ref.modify(state, (s) => {
			if (s.shuttingDown) {
				return [false, s] as const;
			}
			return [true, { ...s, inFlight: s.inFlight + count }] as const;
		}).pipe(
			Effect.flatMap(
				(accepted): Effect.Effect<A, E | S> =>
					accepted
						? effect.pipe(
								Effect.ensuring(
									Ref.update(state, (s) => ({
										...s,
										inFlight: Math.max(0, s.inFlight - count),
									}))
								)
							)
						: Effect.fail(shuttingDownError())
			)
		);

	const connect: Effect.Effect<boolean> = Effect.gen(function* () {
		if (!producer) {
			return false;
		}

		const attempt = yield* Deferred.make<boolean>();
		const decision = yield* Ref.modify<ProducerState, ConnectDecision>(
			state,
			(s) => {
				if (s.shuttingDown) {
					return [{ type: "shutting-down" as const }, s];
				}
				if (s.connected) {
					return [{ type: "connected" as const }, s];
				}
				if (s.connecting) {
					return [{ deferred: s.connecting, type: "wait" as const }, s];
				}
				if (withinCooldown(s.connectionFailedAt)) {
					return [{ type: "fallback" as const }, s];
				}
				return [
					{ deferred: attempt, type: "connect" as const },
					{ ...s, connecting: attempt },
				];
			}
		);

		if (decision.type === "connected") {
			return true;
		}
		if (decision.type === "fallback" || decision.type === "shutting-down") {
			return false;
		}
		if (decision.type === "wait") {
			return yield* Deferred.await(decision.deferred);
		}

		let abandoned = false;
		const connection = producer.connect();
		connection.then(
			() => {
				if (abandoned) {
					producer.disconnect().catch((error) => {
						captureError(error, {
							message: "Failed to reconcile a late Redpanda connection",
						});
					});
				}
			},
			() => undefined
		);

		const clearAttempt = (s: ProducerState) =>
			s.connecting === attempt ? null : s.connecting;

		return yield* Effect.tryPromise({
			try: (signal) =>
				withDeadline(connection, {
					message: `Redpanda connection exceeded ${config.connectTimeout}ms`,
					onAbandon: () => {
						abandoned = true;
					},
					signal,
					timeoutMs: config.connectTimeout,
				}),
			catch: (e) => new KafkaConnectionError({ cause: toError(e) }),
		}).pipe(
			Effect.flatMap(() =>
				Ref.modify(state, (s) => {
					const accepted = !s.shuttingDown;
					return [
						accepted,
						{
							...s,
							connected: accepted,
							connecting: clearAttempt(s),
							connectionFailedAt: null,
							producerInitialized: true,
						},
					] as const;
				})
			),
			Effect.catchTag("KafkaConnectionError", (err) =>
				Ref.update(state, (s) => ({
					...s,
					connecting: clearAttempt(s),
					connectionFailedAt: Date.now(),
				})).pipe(
					Effect.andThen(
						Effect.sync(() =>
							log.warn({
								message:
									"Redpanda connection failed, using ClickHouse fallback",
								error_message: err.cause?.message,
							})
						)
					),
					Effect.as(false)
				)
			),
			Effect.tap((connected) => Deferred.succeed(attempt, connected)),
			Effect.ensuring(
				Deferred.succeed(attempt, false).pipe(
					Effect.andThen(
						Ref.update(state, (s) => ({ ...s, connecting: clearAttempt(s) }))
					)
				)
			)
		);
	});

	const checkConnection: Effect.Effect<void, ProducerUnavailableError> =
		withInFlight(
			1,
			() => unavailable("Producer is shutting down"),
			connect.pipe(
				Effect.flatMap((connected) => {
					if (!healthProbe) {
						return Effect.fail(unavailable("Redpanda is not configured"));
					}
					if (!connected) {
						return Effect.fail(
							unavailable("Redpanda producer is not connected")
						);
					}
					return Effect.tryPromise({
						try: () => healthProbe.probe(config.healthProbeTimeout),
						catch: unavailable,
					});
				})
			)
		);

	const tableForTopic = (
		topic: string
	): Effect.Effect<string, UnknownKafkaTopicError> => {
		const table = topicMap[topic];
		if (table) {
			return Effect.succeed(table);
		}
		return reportError(
			createError({
				code: "basket.UNKNOWN_KAFKA_TOPIC",
				message: "Unknown Kafka topic",
				status: 500,
				why: `Topic "${topic}" is not mapped to a ClickHouse table.`,
				fix: "Check topicMap configuration.",
			}),
			{ topic }
		).pipe(
			Effect.andThen(
				Effect.fail(new UnknownKafkaTopicError({ retryable: false, topic }))
			)
		);
	};

	const insertDirectly = (
		topic: string,
		events: unknown[],
		deliveryIds?: string[]
	): Effect.Effect<void, ClickHouseFallbackError | UnknownKafkaTopicError> =>
		tableForTopic(topic).pipe(
			Effect.flatMap((table) =>
				Effect.tryPromise({
					try: () =>
						record("clickhouseDirectFallbackInsert", () =>
							insertIntoClickHouse(
								ch,
								table,
								events,
								config.chunkSize,
								config.directFallbackTimeout,
								deliveryIds
							)
						),
					catch: (e) =>
						new ClickHouseFallbackError({
							cause: toError(e),
							retryable: true,
							table,
							topic,
						}),
				}).pipe(
					Effect.tapError((error) =>
						reportError(error.cause, {
							message:
								"Direct ClickHouse fallback insert failed; rejecting delivery",
							table,
							topic,
						})
					)
				)
			)
		);

	const rejectSend = (err: KafkaSendError, messageCount: number) => {
		const topicOnly = isTopicError(err.cause);
		const startCooldown = topicOnly
			? Effect.sync(() => {
					topicFailedAt.set(err.topic, Date.now());
				})
			: Ref.update(state, (s) => ({
					...s,
					connected: false,
					connectionFailedAt: Date.now(),
				}));
		return startCooldown.pipe(
			Effect.andThen(
				reportError(err.cause, {
					cooldown: topicOnly ? "topic" : "producer",
					message:
						"Redpanda send failed or its acknowledgement is ambiguous; rejecting delivery",
					message_count: messageCount,
					topic: err.topic,
				})
			),
			Effect.andThen(Effect.fail(err))
		);
	};

	const sendToKafka = (
		kafkaProducer: KafkaProducer,
		topic: string,
		messages: Message[]
	): Effect.Effect<void, KafkaSendError> =>
		Effect.suspend(() => {
			const send = kafkaProducer.send({
				topic,
				messages,
				timeout: config.kafkaTimeout,
				compression: CompressionTypes.GZIP,
			});
			const forget = () => unacknowledgedSends.delete(send);
			send.then(forget, forget);
			return Effect.tryPromise({
				try: (signal) =>
					withDeadline(send, {
						message: `Redpanda send acknowledgement exceeded ${config.kafkaTimeout}ms`,
						onAbandon: () => {
							unacknowledgedSends.set(send, messages.length);
						},
						signal,
						timeoutMs: config.kafkaTimeout,
					}),
				catch: (e) => new KafkaSendError({ topic, cause: toError(e) }),
			}).pipe(
				Effect.catchTag("KafkaSendError", (err) =>
					rejectSend(err, messages.length)
				)
			);
		});

	const deliver = (
		topic: string,
		messages: Message[],
		events: unknown[],
		deliveryIds: string[] | undefined,
		options: DeliveryOptions = {}
	): Effect.Effect<void, DeliveryError> =>
		withInFlight(
			events.length,
			() =>
				new ProducerShuttingDownError({
					eventCount: events.length,
					retryable: true,
				}),
			Effect.gen(function* () {
				const topicAvailable = !withinCooldown(
					topicFailedAt.get(topic) ?? null
				);
				if (producer && topicAvailable && (yield* connect)) {
					return yield* sendToKafka(producer, topic, messages);
				}
				if (options.allowDirectFallback === false) {
					return yield* Effect.fail(
						unavailable(
							"Redpanda is unavailable and this retry must not fall back to ClickHouse"
						)
					);
				}
				yield* insertDirectly(topic, events, deliveryIds);
			})
		);

	const sendOne: EventProducer["sendOne"] = (topic, event, key, options) =>
		deliver(
			topic,
			[
				{
					value: stringifyEvent(event),
					key: key || (event as { client_id?: string }).client_id,
				},
			],
			[event],
			undefined,
			options
		);

	const sendMany: EventProducer["sendMany"] = (
		topic,
		events,
		deliveryIds,
		options
	) => {
		if (events.length === 0) {
			return Effect.void;
		}
		const messages = events.map((event, index) => {
			const identity = event as {
				client_id?: string;
				delivery_id?: string;
				event_id?: string;
			};
			return {
				value: stringifyEvent(event),
				key:
					(topic === "analytics-custom-events"
						? deliveryIds?.[index]
						: undefined) ||
					identity.delivery_id ||
					identity.client_id ||
					identity.event_id,
			};
		});
		return deliver(topic, messages, events, deliveryIds, options);
	};

	const disconnectProducer = Effect.gen(function* () {
		const s = yield* Ref.get(state);
		if (!(producer && (s.producerInitialized || s.connecting))) {
			return;
		}

		yield* Effect.tryPromise({
			try: () => producer.disconnect(),
			catch: (e) => new KafkaConnectionError({ cause: toError(e) }),
		}).pipe(
			Effect.ensuring(
				Ref.update(state, (current) => ({
					...current,
					connected: false,
					connecting: null,
					producerInitialized: false,
				}))
			),
			Effect.tapError((err) =>
				reportError(err.cause, {
					message: "Error disconnecting Redpanda producer",
				})
			)
		);
	});

	const disconnectHealthProbe = healthProbe
		? Effect.tryPromise({
				try: () => healthProbe.disconnect(),
				catch: (error) => new KafkaConnectionError({ cause: toError(error) }),
			}).pipe(
				Effect.tapError((error) =>
					reportError(error.cause, {
						message: "Error disconnecting Redpanda health probe",
					})
				)
			)
		: Effect.void;

	const drainInFlight = Effect.gen(function* () {
		while (
			(yield* Ref.get(state)).inFlight > 0 ||
			healthProbe?.hasActiveProbe() ||
			unacknowledgedSends.size > 0
		) {
			yield* Effect.sleep("10 millis");
		}
	});

	const shutDown: Effect.Effect<void, ShutdownDrainError> = Effect.gen(
		function* () {
			const deadlineAt = Date.now() + config.shutdownDrainTimeout;
			let failure: ShutdownDrainError | null = null;
			const remainingMs = () => Math.max(1, deadlineAt - Date.now());
			const recordFailure = (phase: "disconnect" | "drain", cause: unknown) =>
				Ref.get(state).pipe(
					Effect.flatMap((s) =>
						Effect.sync(() => {
							failure ??= new ShutdownDrainError({
								cause: toError(cause),
								deadlineMs: config.shutdownDrainTimeout,
								inFlight: s.inFlight + unacknowledgedCount(),
								phase,
								retryable: true,
							});
						})
					)
				);

			yield* Ref.update(state, (s) => ({ ...s, shuttingDown: true }));
			yield* Effect.sync(() => healthProbe?.beginShutdown());
			yield* drainInFlight.pipe(
				Effect.timeout(`${remainingMs()} millis`),
				Effect.catch((error) => recordFailure("drain", error))
			);
			yield* Effect.all([disconnectProducer, disconnectHealthProbe], {
				concurrency: "unbounded",
				discard: true,
			}).pipe(
				Effect.timeout(`${remainingMs()} millis`),
				Effect.catch((error) => recordFailure("disconnect", error))
			);
			if (failure) {
				return yield* Effect.fail(failure);
			}
		}
	);

	return { checkConnection, sendMany, sendOne, shutDown };
}

function createKafkaClients(
	config: ProducerConfig
): { admin: Admin; producer: Producer } | null {
	if (config.selfHost || !config.broker) {
		return null;
	}
	if (Boolean(config.username) !== Boolean(config.password)) {
		captureError(
			createError({
				code: "basket.KAFKA_CREDENTIALS_INCOMPLETE",
				message: "Kafka producer disabled: credentials incomplete",
				status: 500,
				why: "REDPANDA_BROKER was set with only one of REDPANDA_USER or REDPANDA_PASSWORD.",
				fix: "Set both broker credentials, remove both for an unauthenticated broker, or use ClickHouse-only mode.",
			})
		);
		return null;
	}

	const client = new Kafka({
		clientId: "basket",
		brokers: [config.broker],
		connectionTimeout: 5000,
		authenticationTimeout: 5000,
		requestTimeout: config.kafkaTimeout,
		enforceRequestTimeout: true,
		retry: {
			initialRetryTime: config.producerRetryDelay,
			maxRetryTime: 1000,
			retries: 0,
		},
		...(config.username &&
			config.password && {
				sasl: {
					mechanism: "scram-sha-256" as const,
					username: config.username,
					password: config.password,
				},
			}),
		ssl: true,
	});

	return {
		admin: client.admin({
			retry: {
				initialRetryTime: config.producerRetryDelay,
				maxRetryTime: 1000,
				retries: 0,
			},
		}),
		producer: client.producer({
			allowAutoTopicCreation: true,
			retry: {
				initialRetryTime: config.producerRetryDelay,
				retries: config.maxProducerRetries,
				maxRetryTime: 3000,
			},
			idempotent: true,
			maxInFlightRequests: 15,
		}),
	};
}

const PRODUCER_CONFIG: ProducerConfig = {
	broker: process.env.REDPANDA_BROKER,
	username: process.env.REDPANDA_USER,
	password: process.env.REDPANDA_PASSWORD,
	selfHost: readBooleanEnv("SELFHOST"),
	reconnectCooldown: 60_000,
	connectTimeout: 4000,
	kafkaTimeout: 10_000,
	maxProducerRetries: 3,
	producerRetryDelay: 300,
	chunkSize: 5000,
	directFallbackTimeout: 4000,
	healthProbeTimeout: 4000,
	shutdownDrainTimeout: PRODUCER_DRAIN_TIMEOUT_MS,
};

export const TOPIC_MAP: Record<string, string> = {
	"analytics-events": TABLE_NAMES.events,
	"analytics-outgoing-links": TABLE_NAMES.outgoing_links,
	"analytics-blocked-traffic": TABLE_NAMES.blocked_traffic,
	"analytics-error-spans": TABLE_NAMES.error_spans,
	"analytics-vitals-spans": TABLE_NAMES.web_vitals_spans,
	"analytics-engagement-spans": TABLE_NAMES.engagement_spans,
	"analytics-custom-events": TABLE_NAMES.custom_events,
	"analytics-ai-traffic-spans": TABLE_NAMES.ai_traffic_spans,
	"analytics-mcp-spans": TABLE_NAMES.mcp_spans,
	"analytics-link-visits": TABLE_NAMES.link_visits,
};

const kafkaClients = createKafkaClients(PRODUCER_CONFIG);
const eventProducer = createEventProducer({
	clickHouse,
	config: PRODUCER_CONFIG,
	kafka: kafkaClients?.producer,
	kafkaAdmin: kafkaClients?.admin,
	topicMap: TOPIC_MAP,
});

export const send = eventProducer.sendOne;
export const sendBatch = eventProducer.sendMany;
export const checkProducerConnection = eventProducer.checkConnection;
export const shutDownProducer = eventProducer.shutDown;
export const runPromise = Effect.runPromise;

export const runFork = <A, E>(effect: Effect.Effect<A, E>) =>
	Effect.runFork(
		effect.pipe(
			Effect.tapError((error) =>
				Effect.sync(() =>
					captureError(error, {
						message: "Asynchronous producer delivery rejected",
					})
				)
			)
		)
	);
