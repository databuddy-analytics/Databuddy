import type { ClickHouseClient } from "@clickhouse/client";
import { clickHouse, TABLE_NAMES } from "@databuddy/db/clickhouse";
import { readBooleanEnv } from "@databuddy/env/boolean";
import { captureError, record } from "@lib/tracing";
import { Data, Effect, Layer, ManagedRuntime, Ref } from "effect";
import { createError } from "evlog";
import { CompressionTypes, Kafka, type Producer } from "kafkajs";

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
)<{ readonly retryable: true }> {}
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

export interface ProducerConfig {
	broker?: string;
	chunkSize: number;
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
	sendMany: (
		topic: string,
		events: unknown[]
	) => Effect.Effect<void, ProducerError>;
	sendOne: (
		topic: string,
		event: unknown,
		key?: string
	) => Effect.Effect<void, ProducerError>;
	shutDown: Effect.Effect<void, ShutdownDrainError>;
	stats: Effect.Effect<ProducerStatsSnapshot>;
}

const INITIAL_STATE: ProducerState = {
	sent: 0,
	failedCount: 0,
	errors: 0,
	lastErrorTime: null,
	connected: false,
	connectionFailed: false,
	lastRetry: 0,
	producerInitialized: false,
	shuttingDown: false,
	inFlight: 0,
};

function toError(err: unknown): Error {
	return err instanceof Error ? err : new Error(String(err));
}

async function insertClickHouseChunks(
	ch: ClickHouseClient,
	table: string,
	events: unknown[],
	chunkSize: number
) {
	for (let i = 0; i < events.length; i += chunkSize) {
		await ch.insert({
			table,
			values: events.slice(i, i + chunkSize),
			format: "JSONEachRow",
		});
	}
}

function makeProducerEffects(
	config: ProducerConfig,
	kafka: Producer | null,
	ch: ClickHouseClient,
	topicMap: Record<string, string>,
	ref: Ref.Ref<ProducerState>
): ProducerEffects {
	const enabled = !config.selfHost && Boolean(config.broker);

	const inc = (field: keyof ProducerState, n = 1) =>
		Ref.update(ref, (s) => ({ ...s, [field]: (s[field] as number) + n }));

	const connect: Effect.Effect<boolean> = Effect.gen(function* () {
		if (!(enabled && kafka)) {
			return (yield* Ref.get(ref)).connected;
		}
		const s = yield* Ref.get(ref);
		if (s.connected) {
			return true;
		}
		if (
			s.connectionFailed &&
			Date.now() - s.lastRetry < config.reconnectCooldown
		) {
			return false;
		}

		return yield* Effect.tryPromise({
			try: () => kafka.connect(),
			catch: (e) => new KafkaConnectionError({ cause: toError(e) }),
		}).pipe(
			Effect.tap(() =>
				Ref.update(ref, (st) => ({
					...st,
					connected: true,
					connectionFailed: false,
					lastRetry: 0,
					producerInitialized: true,
				}))
			),
			Effect.as(true),
			Effect.catchTag("KafkaConnectionError", (err) =>
				Ref.update(ref, (st) => ({
					...st,
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
			)
		);
	});

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
		events: unknown[]
	): Effect.Effect<void, ClickHouseFallbackError | UnknownKafkaTopicError> =>
		Effect.gen(function* () {
			const table = yield* resolveTopic(topic);
			yield* Effect.tryPromise({
				try: () =>
					record("clickhouseDirectFallbackInsert", () =>
						insertClickHouseChunks(ch, table, events, config.chunkSize)
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
		Ref.modify(ref, (s) => {
			if (s.shuttingDown) {
				return [false, s] as const;
			}
			return [true, { ...s, inFlight: s.inFlight + eventCount }] as const;
		}).pipe(
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

	const releaseSendSlot = (eventCount: number) =>
		Ref.update(ref, (s) => ({
			...s,
			inFlight: Math.max(0, s.inFlight - eventCount),
		}));

	const sendViaKafka = (
		topic: string,
		messages: Array<{ value: string; key?: string }>,
		fallbackEvents: unknown[]
	): Effect.Effect<void, ProducerError> =>
		acquireSendSlot(fallbackEvents.length).pipe(
			Effect.flatMap(() =>
				Effect.gen(function* () {
					if (enabled && kafka) {
						const isConnected = yield* connect;
						if (isConnected) {
							const sent = yield* Effect.tryPromise({
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
								Effect.as(true),
								Effect.catchTag("KafkaSendError", (err) =>
									Ref.update(ref, (st) => ({
										...st,
										connectionFailed: true,
										connected: false,
										lastRetry: Date.now(),
										failedCount: st.failedCount + messages.length,
									})).pipe(
										Effect.tap(() =>
											Effect.sync(() =>
												captureError(err.cause, {
													message:
														"Redpanda send failed, falling back to ClickHouse",
													message_count: messages.length,
													topic,
												})
											)
										),
										Effect.as(false)
									)
								)
							);
							if (sent) {
								return;
							}
						}
					}

					yield* persistDirectly(topic, fallbackEvents);
				}).pipe(Effect.ensuring(releaseSendSlot(fallbackEvents.length)))
			)
		);

	const sendOne = (
		topic: string,
		event: unknown,
		key?: string
	): Effect.Effect<void, ProducerError> =>
		sendViaKafka(
			topic,
			[
				{
					value: stringifyEvent(event),
					key: key || (event as { client_id?: string }).client_id,
				},
			],
			[event]
		);

	const sendMany = (
		topic: string,
		events: unknown[]
	): Effect.Effect<void, ProducerError> => {
		if (events.length === 0) {
			return Effect.void;
		}
		return sendViaKafka(
			topic,
			events.map((e) => ({
				value: stringifyEvent(e),
				key:
					(e as { client_id?: string }).client_id ||
					(e as { event_id?: string }).event_id,
			})),
			events
		);
	};

	const disconnectKafka = Effect.gen(function* () {
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

	const drainInFlight = Effect.gen(function* () {
		while ((yield* Ref.get(ref)).inFlight > 0) {
			yield* Effect.sleep("10 millis");
		}
	});

	const shutDown: Effect.Effect<void, ShutdownDrainError> = Effect.gen(
		function* () {
			yield* Ref.update(ref, (s) => ({ ...s, shuttingDown: true }));
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
				shuttingDown: _s,
				connectionFailed,
				producerInitialized: _p,
				...rest
			}) => ({
				...rest,
				failed: connectionFailed,
				kafkaEnabled: enabled,
			})
		)
	);

	return {
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
	topicMap: Record<string, string>
): Effect.Effect<ProducerEffects> =>
	Ref.make<ProducerState>(INITIAL_STATE).pipe(
		Effect.map((ref) => makeProducerEffects(config, kafka, ch, topicMap, ref))
	);

function initializeKafka(config: ProducerConfig): Producer | null {
	if (config.selfHost || !config.broker) {
		return null;
	}
	if (!(config.username && config.password)) {
		captureError(
			createError({
				code: "basket.KAFKA_CREDENTIALS_MISSING",
				message: "Kafka producer disabled: credentials missing",
				status: 500,
				why: "REDPANDA_BROKER was set without username and password.",
				fix: "Set broker credentials or use ClickHouse-only mode.",
			})
		);
		return null;
	}

	return new Kafka({
		clientId: "basket",
		brokers: [config.broker],
		connectionTimeout: 5000,
		requestTimeout: config.kafkaTimeout,
		sasl: {
			mechanism: "scram-sha-256",
			username: config.username,
			password: config.password,
		},
		ssl: process.env.REDPANDA_SSL === "true",
	}).producer({
		allowAutoTopicCreation: true,
		retry: {
			initialRetryTime: config.producerRetryDelay,
			retries: config.maxProducerRetries,
			maxRetryTime: 3000,
		},
		idempotent: true,
		maxInFlightRequests: 15,
	});
}

export interface ProducerStatsSnapshot {
	connected: boolean;
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
	shutdownDrainTimeout: 8000,
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
		const effects = yield* createProducerEffects(
			CONFIG,
			initializeKafka(CONFIG),
			clickHouse,
			TOPIC_MAP
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

export const send = (topic: string, event: unknown, key?: string) =>
	withActiveFx((f) => f.sendOne(topic, event, key));

export const sendBatch = (topic: string, events: unknown[]) =>
	withActiveFx((f) => f.sendMany(topic, events));

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
