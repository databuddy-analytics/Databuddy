import { createHash } from "node:crypto";
import type { ClickHouseClient } from "@clickhouse/client";
import { clickHouse, TABLE_NAMES } from "@databuddy/db/clickhouse";
import { readBooleanEnv } from "@databuddy/env/boolean";
import { captureError, record } from "@lib/tracing";
import { PRODUCER_DRAIN_TIMEOUT_MS } from "@lib/shutdown-budget";
import { Data, Deferred, Effect, Layer, ManagedRuntime, Ref } from "effect";
import { createError } from "evlog";
import { type Admin, CompressionTypes, Kafka, type Producer } from "kafkajs";

function stringifyEvent(event: unknown): string {
	return JSON.stringify(event, (_key, value) =>
		value === undefined ? null : value
	);
}

export class KafkaConnectionError extends Data.TaggedError(
	"KafkaConnectionError"
)<{ readonly cause?: Error }> {}
export class KafkaSendError extends Data.TaggedError("KafkaSendError")<{
	readonly topic: string;
	readonly cause?: Error;
}> {}
export class ProducerShuttingDownError extends Data.TaggedError(
	"ProducerShuttingDownError"
)<{
	readonly eventCount: number;
	readonly retryable: true;
}> {}
export class ProducerUnavailableError extends Data.TaggedError(
	"ProducerUnavailableError"
)<{
	readonly cause?: Error;
	readonly retryable: true;
}> {}
export class UnknownKafkaTopicError extends Data.TaggedError(
	"UnknownKafkaTopicError"
)<{
	readonly retryable: false;
	readonly topic: string;
}> {}
export class ClickHouseFallbackError extends Data.TaggedError(
	"ClickHouseFallbackError"
)<{
	readonly cause?: Error;
	readonly retryable: true;
	readonly table: string;
	readonly topic: string;
}> {}
export class ShutdownDrainError extends Data.TaggedError("ShutdownDrainError")<{
	readonly deadlineMs: number;
	readonly inFlight: number;
	readonly retryable: true;
}> {}

export type ProducerError =
	| KafkaConnectionError
	| KafkaSendError
	| ProducerShuttingDownError
	| ProducerUnavailableError
	| UnknownKafkaTopicError
	| ClickHouseFallbackError;

interface ProducerState {
	connected: boolean;
	connecting: Deferred.Deferred<boolean> | null;
	connectionFailed: boolean;
	errors: number;
	failedCount: number;
	inFlight: number;
	lastErrorTime: number | null;
	lastRetry: number;
	producerInitialized: boolean;
	sent: number;
	shuttingDown: boolean;
}

type ConnectDecision =
	| { readonly type: "connected" }
	| { readonly deferred: Deferred.Deferred<boolean>; readonly type: "connect" }
	| { readonly type: "fallback" }
	| { readonly type: "shutting-down" }
	| { readonly deferred: Deferred.Deferred<boolean>; readonly type: "wait" };

export interface ProducerConfig {
	broker?: string;
	chunkSize: number;
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

export interface ProducerEffects {
	checkConnection: Effect.Effect<void, ProducerUnavailableError>;
	sendMany: (
		topic: string,
		events: unknown[],
		deliveryIds?: string[],
		options?: ProducerDeliveryOptions
	) => Effect.Effect<void, ProducerError>;
	sendOne: (
		topic: string,
		event: unknown,
		key?: string,
		options?: ProducerDeliveryOptions
	) => Effect.Effect<void, ProducerError>;
	shutDown: Effect.Effect<void, ShutdownDrainError>;
	stats: Effect.Effect<ProducerStatsSnapshot>;
}

export interface ProducerDeliveryOptions {
	/** Prevent an uncertain Kafka retry from switching to ClickHouse. */
	readonly allowDirectFallback?: boolean;
}

export interface KafkaResources {
	readonly admin: Admin;
	readonly producer: Producer;
}

const INITIAL_STATE: ProducerState = {
	sent: 0,
	failedCount: 0,
	errors: 0,
	lastErrorTime: null,
	connected: false,
	connecting: null,
	connectionFailed: false,
	lastRetry: 0,
	producerInitialized: false,
	shuttingDown: false,
	inFlight: 0,
};

function toError(err: unknown): Error {
	return err instanceof Error ? err : new Error(String(err));
}

class HealthProbeDeadlineError extends Error {}

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

function withHealthProbeDeadline(
	operation: Promise<void>,
	timeoutMs: number
): Promise<void> {
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_resolve, reject) => {
		timeout = setTimeout(() => {
			reject(
				new HealthProbeDeadlineError(
					`Redpanda health probe exceeded ${timeoutMs}ms`
				)
			);
		}, timeoutMs);
		timeout.unref?.();
	});

	return Promise.race([operation, deadline]).finally(() => {
		if (timeout) {
			clearTimeout(timeout);
		}
	});
}

function createKafkaHealthProbe(admin: Admin): KafkaHealthProbe {
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
		const operation = admin
			.disconnect()
			.catch((error) => {
				captureError(error, {
					message: "Error disconnecting Redpanda health client",
				});
			})
			.finally(() => {
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

		const candidate: ActiveHealthProbe = {
			cancelled: false,
			promise: Promise.resolve(),
		};
		candidate.promise = (async () => {
			try {
				if (!connected) {
					await admin.connect();
					connected = true;
				}
				if (candidate.cancelled || shuttingDown) {
					throw new Error("Redpanda health probe cancelled");
				}

				const cluster = await admin.describeCluster();
				if (candidate.cancelled || shuttingDown) {
					throw new Error("Redpanda health probe cancelled");
				}
				if (cluster.brokers.length === 0) {
					throw new Error("Redpanda returned no brokers");
				}
			} catch (error) {
				await disconnect();
				throw error;
			}
		})();
		const operation = candidate.promise;
		activeProbe = candidate;
		operation.then(
			() => {
				if (activeProbe === candidate) {
					activeProbe = null;
				}
			},
			() => {
				if (activeProbe === candidate) {
					activeProbe = null;
				}
			}
		);
		return candidate;
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
				await withHealthProbeDeadline(probe.promise, timeoutMs);
			} catch (error) {
				if (error instanceof HealthProbeDeadlineError) {
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

function clickHouseInsertDeduplicationToken(
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

async function insertClickHouseChunks(
	ch: ClickHouseClient,
	table: string,
	events: unknown[],
	chunkSize: number,
	timeoutMs: number,
	deliveryIds?: string[]
) {
	const controller = new AbortController();
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_resolve, reject) => {
		timeout = setTimeout(() => {
			const error = new Error(
				`Direct ClickHouse fallback exceeded ${timeoutMs}ms admission deadline`
			);
			controller.abort(error);
			reject(error);
		}, timeoutMs);
		timeout.unref?.();
	});

	try {
		await Promise.race([
			(async () => {
				for (let i = 0; i < events.length; i += chunkSize) {
					const values = events.slice(i, i + chunkSize);
					const chunkDeliveryIds = deliveryIds?.slice(i, i + chunkSize);
					const deduplicationToken = clickHouseInsertDeduplicationToken(
						table,
						values,
						chunkDeliveryIds
					);
					await ch.insert({
						table,
						values,
						format: "JSONEachRow",
						abort_signal: controller.signal,
						clickhouse_settings: {
							insert_deduplication_token: deduplicationToken,
						},
						query_id: `basket-${deduplicationToken}`,
					});
				}
			})(),
			deadline,
		]);
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
	}
}

function makeProducerEffects(
	config: ProducerConfig,
	kafka: Producer | null,
	kafkaAdmin: Admin | null,
	ch: ClickHouseClient,
	topicMap: Record<string, string>,
	ref: Ref.Ref<ProducerState>
): ProducerEffects {
	const enabled = !config.selfHost && Boolean(config.broker);
	const healthProbe = kafkaAdmin ? createKafkaHealthProbe(kafkaAdmin) : null;

	const inc = (field: keyof ProducerState, n = 1) =>
		Ref.update(ref, (s) => ({ ...s, [field]: (s[field] as number) + n }));

	const reserveInFlight = (count: number) =>
		Ref.modify(ref, (state) => {
			if (state.shuttingDown) {
				return [false, state] as const;
			}
			return [true, { ...state, inFlight: state.inFlight + count }] as const;
		});

	const releaseInFlight = (count: number) =>
		Ref.update(ref, (state) => ({
			...state,
			inFlight: Math.max(0, state.inFlight - count),
		}));

	const connect: Effect.Effect<boolean> = Effect.gen(function* () {
		if (!(enabled && kafka)) {
			return (yield* Ref.get(ref)).connected;
		}

		const candidate = yield* Deferred.make<boolean>();
		const decision = yield* Ref.modify<ProducerState, ConnectDecision>(
			ref,
			(state) => {
				if (state.shuttingDown) {
					return [{ type: "shutting-down" as const }, state];
				}
				if (state.connected) {
					return [{ type: "connected" as const }, state];
				}
				if (state.connecting) {
					return [{ deferred: state.connecting, type: "wait" as const }, state];
				}
				if (
					state.connectionFailed &&
					Date.now() - state.lastRetry < config.reconnectCooldown
				) {
					return [{ type: "fallback" as const }, state];
				}
				return [
					{ deferred: candidate, type: "connect" as const },
					{ ...state, connecting: candidate },
				];
			}
		);

		if (decision.type === "connected") {
			return true;
		}
		if (decision.type === "fallback") {
			return false;
		}
		if (decision.type === "shutting-down") {
			return false;
		}
		if (decision.type === "wait") {
			return yield* Deferred.await(decision.deferred);
		}

		return yield* Effect.tryPromise({
			try: () => kafka.connect(),
			catch: (e) => new KafkaConnectionError({ cause: toError(e) }),
		}).pipe(
			Effect.flatMap(() =>
				Ref.modify(ref, (state) => {
					const accepted = !state.shuttingDown;
					return [
						accepted,
						{
							...state,
							connected: accepted,
							connecting:
								state.connecting === candidate ? null : state.connecting,
							connectionFailed: false,
							lastRetry: 0,
							producerInitialized: true,
						},
					] as const;
				})
			),
			Effect.catchTag("KafkaConnectionError", (err) =>
				Ref.update(ref, (st) => ({
					...st,
					connecting: st.connecting === candidate ? null : st.connecting,
					connectionFailed: true,
					lastRetry: Date.now(),
					errors: st.errors + 1,
					lastErrorTime: Date.now(),
				})).pipe(
					Effect.tap(() =>
						Effect.sync(() =>
							captureError(err.cause, {
								message:
									"Redpanda connection failed, using ClickHouse fallback",
							})
						)
					),
					Effect.as(false)
				)
			),
			Effect.tap((result) => Deferred.succeed(candidate, result)),
			Effect.ensuring(
				Deferred.succeed(candidate, false).pipe(
					Effect.andThen(
						Ref.update(ref, (state) =>
							state.connecting === candidate
								? { ...state, connecting: null }
								: state
						)
					)
				)
			)
		);
	});

	const checkConnection: Effect.Effect<void, ProducerUnavailableError> =
		reserveInFlight(1).pipe(
			Effect.flatMap((accepted) =>
				accepted
					? connect
					: Effect.fail(new ProducerUnavailableError({ retryable: true }))
			),
			Effect.flatMap((connected) => {
				if (!(connected && healthProbe)) {
					return Effect.fail(new ProducerUnavailableError({ retryable: true }));
				}
				return Effect.tryPromise({
					try: () => healthProbe.probe(config.healthProbeTimeout),
					catch: (error) =>
						new ProducerUnavailableError({
							cause: toError(error),
							retryable: true,
						}),
				});
			}),
			Effect.ensuring(releaseInFlight(1))
		);

	const resolveTopic = (
		topic: string
	): Effect.Effect<string, UnknownKafkaTopicError> =>
		Effect.gen(function* () {
			const table = topicMap[topic];
			if (table) {
				return table;
			}

			yield* inc("errors", 1);
			yield* Effect.sync(() =>
				captureError(
					createError({
						code: "basket.UNKNOWN_KAFKA_TOPIC",
						message: "Unknown Kafka topic",
						status: 500,
						why: `Topic "${topic}" is not mapped to a ClickHouse table.`,
						fix: "Check topicMap configuration.",
					}),
					{ topic }
				)
			);
			return yield* Effect.fail(
				new UnknownKafkaTopicError({ retryable: false, topic })
			);
		});

	const persistDirectly = (
		topic: string,
		events: unknown[],
		deliveryIds?: string[]
	): Effect.Effect<void, ClickHouseFallbackError | UnknownKafkaTopicError> =>
		Effect.gen(function* () {
			const table = yield* resolveTopic(topic);
			yield* Effect.tryPromise({
				try: () =>
					record("clickhouseDirectFallbackInsert", () =>
						insertClickHouseChunks(
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
				Effect.tap(() => inc("sent", events.length)),
				Effect.catchTag("ClickHouseFallbackError", (error) =>
					Ref.update(ref, (s) => ({
						...s,
						errors: s.errors + 1,
						lastErrorTime: Date.now(),
					})).pipe(
						Effect.tap(() =>
							Effect.sync(() =>
								captureError(error.cause, {
									message:
										"Direct ClickHouse fallback insert failed; rejecting delivery",
									table,
									topic,
								})
							)
						),
						Effect.flatMap(() => Effect.fail(error))
					)
				)
			);
		});

	const acquireSendSlot = (eventCount: number) =>
		reserveInFlight(eventCount).pipe(
			Effect.flatMap((accepted) =>
				accepted
					? Effect.void
					: Effect.fail(
							new ProducerShuttingDownError({
								eventCount,
								retryable: true,
							})
						)
			)
		);

	const sendViaKafka = (
		topic: string,
		messages: Array<{ value: string; key?: string }>,
		fallbackEvents: unknown[],
		deliveryIds?: string[],
		options: ProducerDeliveryOptions = {}
	): Effect.Effect<void, ProducerError> =>
		acquireSendSlot(fallbackEvents.length).pipe(
			Effect.flatMap(() =>
				Effect.gen(function* () {
					if (enabled && kafka) {
						const isConnected = yield* connect;
						if (isConnected) {
							yield* Effect.tryPromise({
								try: () =>
									kafka.send({
										topic,
										messages,
										timeout: config.kafkaTimeout,
										compression: CompressionTypes.GZIP,
									}),
								catch: (e) => new KafkaSendError({ topic, cause: toError(e) }),
							}).pipe(
								Effect.tap(() => inc("sent", messages.length)),
								Effect.catchTag("KafkaSendError", (err) =>
									Ref.update(ref, (st) => ({
										...st,
										connectionFailed: true,
										connected: false,
										errors: st.errors + 1,
										lastRetry: Date.now(),
										lastErrorTime: Date.now(),
										failedCount: st.failedCount + messages.length,
									})).pipe(
										Effect.tap(() =>
											Effect.sync(() =>
												captureError(err.cause, {
													message:
														"Redpanda send acknowledgement is ambiguous; rejecting delivery",
													message_count: messages.length,
													topic,
												})
											)
										),
										Effect.flatMap(() => Effect.fail(err))
									)
								)
							);
							return;
						}
					}

					if (options.allowDirectFallback === false) {
						return yield* Effect.fail(
							new ProducerUnavailableError({ retryable: true })
						);
					}
					yield* persistDirectly(topic, fallbackEvents, deliveryIds);
				}).pipe(Effect.ensuring(releaseInFlight(fallbackEvents.length)))
			)
		);

	const sendOne = (
		topic: string,
		event: unknown,
		key?: string,
		options?: ProducerDeliveryOptions
	): Effect.Effect<void, ProducerError> =>
		sendViaKafka(
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

	const sendMany = (
		topic: string,
		events: unknown[],
		deliveryIds?: string[],
		options?: ProducerDeliveryOptions
	): Effect.Effect<void, ProducerError> => {
		if (events.length === 0) {
			return Effect.void;
		}
		return sendViaKafka(
			topic,
			events.map((event) => {
				const identity = event as {
					client_id?: string;
					delivery_id?: string;
					event_id?: string;
				};
				return {
					value: stringifyEvent(event),
					key: identity.delivery_id || identity.client_id || identity.event_id,
				};
			}),
			events,
			deliveryIds,
			options
		);
	};

	const disconnectProducer = Effect.gen(function* () {
		const state = yield* Ref.get(ref);
		if (!(state.producerInitialized && kafka)) {
			return;
		}

		yield* Effect.tryPromise({
			try: () => kafka.disconnect(),
			catch: (e) => new KafkaConnectionError({ cause: toError(e) }),
		}).pipe(
			Effect.ensuring(
				Ref.update(ref, (s) => ({
					...s,
					connected: false,
					connecting: null,
					producerInitialized: false,
				}))
			),
			Effect.catch((err) =>
				Effect.sync(() =>
					captureError(err.cause, {
						message: "Error disconnecting Redpanda producer",
					})
				)
			)
		);
	});

	const disconnectHealthProbe = healthProbe
		? Effect.tryPromise({
				try: () => healthProbe.disconnect(),
				catch: (error) => new KafkaConnectionError({ cause: toError(error) }),
			}).pipe(
				Effect.catch((error) =>
					Effect.sync(() =>
						captureError(error.cause, {
							message: "Error disconnecting Redpanda health probe",
						})
					)
				)
			)
		: Effect.void;

	const disconnectKafka = Effect.gen(function* () {
		yield* disconnectProducer;
		yield* disconnectHealthProbe;
	});

	const drainInFlight = Effect.gen(function* () {
		while (
			(yield* Ref.get(ref)).inFlight > 0 ||
			healthProbe?.hasActiveProbe()
		) {
			yield* Effect.sleep("10 millis");
		}
	});

	const shutDown: Effect.Effect<void, ShutdownDrainError> = Effect.gen(
		function* () {
			yield* Ref.update(ref, (s) => ({ ...s, shuttingDown: true }));
			yield* Effect.sync(() => healthProbe?.beginShutdown());
			yield* drainInFlight.pipe(
				Effect.timeout(`${config.shutdownDrainTimeout} millis`),
				Effect.catch(() =>
					Ref.get(ref).pipe(
						Effect.flatMap((state) =>
							Effect.fail(
								new ShutdownDrainError({
									deadlineMs: config.shutdownDrainTimeout,
									inFlight: state.inFlight,
									retryable: true,
								})
							)
						)
					)
				),
				Effect.ensuring(disconnectKafka)
			);
		}
	);

	const stats: Effect.Effect<ProducerStatsSnapshot> = Ref.get(ref).pipe(
		Effect.map(
			({
				connecting,
				shuttingDown: _s,
				connectionFailed,
				producerInitialized: _p,
				...rest
			}) => ({
				...rest,
				connecting: connecting !== null,
				failed: connectionFailed,
				kafkaEnabled: enabled,
			})
		)
	);

	return {
		checkConnection,
		sendOne,
		sendMany,
		shutDown,
		stats,
	};
}

export const createProducerEffects = (
	config: ProducerConfig,
	kafka: Producer | null,
	ch: ClickHouseClient,
	topicMap: Record<string, string>,
	kafkaAdmin: Admin | null = null
): Effect.Effect<ProducerEffects> =>
	Ref.make<ProducerState>(INITIAL_STATE).pipe(
		Effect.map((ref) =>
			makeProducerEffects(config, kafka, kafkaAdmin, ch, topicMap, ref)
		)
	);

export function initializeKafka(config: ProducerConfig): KafkaResources | null {
	if (config.selfHost || !config.broker) {
		return null;
	}
	const hasUsername = Boolean(config.username);
	const hasPassword = Boolean(config.password);
	if (hasUsername !== hasPassword) {
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
		ssl: process.env.REDPANDA_SSL === "true",
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

export interface ProducerStatsSnapshot {
	connected: boolean;
	connecting: boolean;
	errors: number;
	failed: boolean;
	failedCount: number;
	inFlight: number;
	kafkaEnabled: boolean;
	lastErrorTime: number | null;
	lastRetry: number;
	sent: number;
}

const CONFIG: ProducerConfig = {
	broker: process.env.REDPANDA_BROKER,
	username: process.env.REDPANDA_USER,
	password: process.env.REDPANDA_PASSWORD,
	selfHost: readBooleanEnv("SELFHOST"),
	reconnectCooldown: 60_000,
	kafkaTimeout: 10_000,
	maxProducerRetries: 3,
	producerRetryDelay: 300,
	chunkSize: 5000,
	directFallbackTimeout: 4000,
	healthProbeTimeout: 4000,
	shutdownDrainTimeout: PRODUCER_DRAIN_TIMEOUT_MS,
};

const TOPIC_MAP: Record<string, string> = {
	"analytics-events": TABLE_NAMES.events,
	"analytics-outgoing-links": TABLE_NAMES.outgoing_links,
	"analytics-blocked-traffic": TABLE_NAMES.blocked_traffic,
	"analytics-error-spans": TABLE_NAMES.error_spans,
	"analytics-vitals-spans": TABLE_NAMES.web_vitals_spans,
	"analytics-custom-events": TABLE_NAMES.custom_events,
	"analytics-ai-traffic-spans": TABLE_NAMES.ai_traffic_spans,
	"analytics-link-visits": TABLE_NAMES.link_visits,
};

let fx: ReturnType<typeof makeProducerEffects> | null = null;

const ProducerLive = Layer.effectDiscard(
	Effect.gen(function* () {
		const kafka = initializeKafka(CONFIG);
		const effects = yield* createProducerEffects(
			CONFIG,
			kafka?.producer ?? null,
			clickHouse,
			TOPIC_MAP,
			kafka?.admin ?? null
		);
		fx = effects;
	})
);

const runtime = ManagedRuntime.make(ProducerLive);

const withFx = <A, E>(
	fn: (f: NonNullable<typeof fx>) => Effect.Effect<A, E>
): Effect.Effect<A | undefined, E> =>
	Effect.suspend(() => (fx ? fn(fx) : Effect.succeed(undefined)));

const withActiveFx = <A, E>(
	fn: (f: NonNullable<typeof fx>) => Effect.Effect<A, E>
): Effect.Effect<A, E | ProducerUnavailableError> =>
	Effect.suspend(
		(): Effect.Effect<A, E | ProducerUnavailableError> =>
			fx
				? fn(fx)
				: Effect.fail(new ProducerUnavailableError({ retryable: true }))
	);

export const send = (
	topic: string,
	event: unknown,
	key?: string,
	options?: ProducerDeliveryOptions
) => withActiveFx((f) => f.sendOne(topic, event, key, options));

export const sendBatch = (
	topic: string,
	events: unknown[],
	deliveryIds?: string[],
	options?: ProducerDeliveryOptions
) => withActiveFx((f) => f.sendMany(topic, events, deliveryIds, options));

export const checkProducerConnection = withActiveFx((f) => f.checkConnection);

export const disconnect = withFx((f) => f.shutDown);

export const getStats = withFx((f) => f.stats);

export const runFork = <A, E>(effect: Effect.Effect<A, E>) =>
	runtime.runFork(
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

export const runPromise = <A, E>(effect: Effect.Effect<A, E>) =>
	runtime.runPromise(effect);

export const disposeRuntime = () => runtime.dispose();
