import type { ClickHouseClient } from "@clickhouse/client";
import { clickHouse, TABLE_NAMES } from "@databuddy/db/clickhouse";
import { captureError, record } from "@lib/tracing";
import { Data, Effect, Layer, ManagedRuntime, Ref, Schedule } from "effect";
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
export class BufferOverflowError extends Data.TaggedError(
	"BufferOverflowError"
)<{ readonly bufferLength: number }> {}
export class FlushError extends Data.TaggedError("FlushError")<{
	readonly table: string;
	readonly cause?: Error;
}> {}

export type ProducerError =
	| KafkaConnectionError
	| KafkaSendError
	| BufferOverflowError
	| FlushError;

interface BufferedEvent {
	event: unknown;
	table: string;
}

interface ProducerState {
	buffer: BufferedEvent[];
	buffered: number;
	connected: boolean;
	connectionFailed: boolean;
	dropped: number;
	errors: number;
	failedCount: number;
	flushed: number;
	flushing: boolean;
	lastErrorTime: number | null;
	lastRetry: number;
	sent: number;
	shuttingDown: boolean;
}

interface ProducerConfig {
	broker?: string;
	bufferHardMax: number;
	bufferInterval: number;
	bufferMax: number;
	chunkSize: number;
	kafkaTimeout: number;
	maxProducerRetries: number;
	password?: string;
	producerRetryDelay: number;
	reconnectCooldown: number;
	selfHost: boolean;
	username?: string;
}

const INITIAL_STATE: ProducerState = {
	buffer: [],
	sent: 0,
	failedCount: 0,
	buffered: 0,
	flushed: 0,
	dropped: 0,
	errors: 0,
	lastErrorTime: null,
	connected: false,
	connectionFailed: false,
	lastRetry: 0,
	shuttingDown: false,
	flushing: false,
};

function toError(err: unknown): Error {
	return err instanceof Error ? err : new Error(String(err));
}

function makeProducerEffects(
	config: ProducerConfig,
	kafka: Producer | null,
	ch: ClickHouseClient,
	topicMap: Record<string, string>,
	ref: Ref.Ref<ProducerState>
) {
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

	const flush: Effect.Effect<void, FlushError> = Effect.gen(function* () {
		const pre = yield* Ref.get(ref);
		if (pre.buffer.length === 0 || pre.flushing) {
			return;
		}

		const batchSize = Math.min(pre.buffer.length, config.bufferMax);
		const items = yield* Ref.modify(ref, (s) => [
			s.buffer.slice(0, batchSize),
			{ ...s, buffer: s.buffer.slice(batchSize), flushing: true },
		]);

		const grouped = new Map<string, BufferedEvent[]>();
		for (const item of items) {
			const list = grouped.get(item.table);
			if (list) {
				list.push(item);
			} else {
				grouped.set(item.table, [item]);
			}
		}

		yield* Effect.forEach(
			grouped.entries(),
			([table, entries]: [string, BufferedEvent[]]) => {
				const events = entries.map((e: BufferedEvent) => e.event);
				return Effect.tryPromise({
					try: () =>
						record("clickhouseFallbackInsert", async () => {
							for (let i = 0; i < events.length; i += config.chunkSize) {
								await ch.insert({
									table,
									values: events.slice(i, i + config.chunkSize),
									format: "JSONEachRow",
								});
							}
						}),
					catch: (e) => new FlushError({ table, cause: toError(e) }),
				}).pipe(
					Effect.tap(() => inc("flushed", events.length)),
					Effect.catchTag("FlushError", (err) =>
						Ref.get(ref).pipe(
							Effect.flatMap((s) =>
								s.buffer.length + events.length <= config.bufferHardMax
									? Ref.update(ref, (st) => ({
											...st,
											buffer: [
												...st.buffer,
												...events.map((event: unknown) => ({ table, event })),
											],
											errors: st.errors + 1,
										}))
									: inc("dropped", events.length).pipe(
											Effect.tap(() => inc("errors", 1)),
											Effect.tap(() =>
												Effect.sync(() =>
													captureError(err.cause, {
														message: `Dropped ${String(events.length)} events - buffer full`,
													})
												)
											)
										)
							)
						)
					)
				);
			},
			{ concurrency: "unbounded" }
		);

		yield* Ref.update(ref, (s) => ({ ...s, flushing: false }));
	});

	const toBuffer = (
		topic: string,
		event: unknown
	): Effect.Effect<void, BufferOverflowError> =>
		Effect.gen(function* () {
			const table = topicMap[topic];
			if (!table) {
				yield* inc("errors", 1);
				yield* Effect.sync(() =>
					captureError(
						createError({
							message: "Unknown Kafka topic",
							status: 500,
							why: `Topic "${topic}" is not mapped to a ClickHouse table.`,
							fix: "Check topicMap configuration.",
						})
					)
				);
				return;
			}

			const result = yield* Ref.modify(ref, (s) => {
				if (s.shuttingDown) {
					return ["shutdown" as const, { ...s, dropped: s.dropped + 1 }];
				}
				if (s.buffer.length >= config.bufferHardMax) {
					return ["overflow" as const, { ...s, dropped: s.dropped + 1 }];
				}
				return [
					"ok" as const,
					{
						...s,
						buffer: [...s.buffer, { table, event }],
						buffered: s.buffered + 1,
					},
				];
			});

			if (result === "overflow") {
				return yield* Effect.fail(
					new BufferOverflowError({
						bufferLength: (yield* Ref.get(ref)).buffer.length,
					})
				);
			}
		});

	const bufferAll = (topic: string, events: unknown[]) =>
		Effect.forEach(events, (e) => toBuffer(topic, e), {
			discard: true,
		});

	const sendViaKafka = (
		topic: string,
		messages: Array<{ value: string; key?: string }>,
		fallbackEvents: unknown[]
	): Effect.Effect<void, ProducerError> =>
		Effect.gen(function* () {
			const s = yield* Ref.get(ref);
			if (s.shuttingDown) {
				yield* bufferAll(topic, fallbackEvents);
				return;
			}

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
								failedCount: st.failedCount + messages.length,
							})).pipe(
								Effect.tap(() =>
									Effect.sync(() =>
										captureError(err.cause, {
											message: "Redpanda send failed, buffering to ClickHouse",
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

			yield* bufferAll(topic, fallbackEvents);
		});

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

	const shutDown: Effect.Effect<void> = Effect.gen(function* () {
		yield* Ref.update(ref, (s) => ({ ...s, shuttingDown: true }));
		yield* Effect.sleep("1 second");
		yield* flush.pipe(Effect.catchAll(() => Effect.void));
		const post = yield* Ref.get(ref);
		if (post.buffer.length > 0 && !post.flushing) {
			yield* flush.pipe(Effect.catchAll(() => Effect.void));
		}
		if (post.connected && kafka) {
			yield* Effect.tryPromise({
				try: () => kafka.disconnect(),
				catch: (e) => new KafkaConnectionError({ cause: toError(e) }),
			}).pipe(
				Effect.ensuring(Ref.update(ref, (s) => ({ ...s, connected: false }))),
				Effect.catchAll((err) =>
					Effect.sync(() =>
						captureError(err.cause, {
							message: "Error disconnecting Redpanda producer",
						})
					)
				)
			);
		}
	});

	const stats: Effect.Effect<ProducerStatsSnapshot> = Ref.get(ref).pipe(
		Effect.map(
			({
				buffer,
				flushing: _f,
				shuttingDown: _s,
				connectionFailed,
				...rest
			}) => ({
				...rest,
				failed: connectionFailed,
				bufferSize: buffer.length,
				kafkaEnabled: enabled,
			})
		)
	);

	return { flush, sendOne, sendMany, shutDown, stats };
}

function initializeKafka(config: ProducerConfig): Producer | null {
	if (config.selfHost || !config.broker) {
		return null;
	}
	if (!(config.username && config.password)) {
		captureError(
			createError({
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
	buffered: number;
	bufferSize: number;
	connected: boolean;
	dropped: number;
	errors: number;
	failed: boolean;
	failedCount: number;
	flushed: number;
	kafkaEnabled: boolean;
	lastErrorTime: number | null;
	lastRetry: number;
	sent: number;
}

const CONFIG: ProducerConfig = {
	broker: process.env.REDPANDA_BROKER,
	username: process.env.REDPANDA_USER,
	password: process.env.REDPANDA_PASSWORD,
	selfHost: process.env.SELFHOST === "true",
	reconnectCooldown: 60_000,
	kafkaTimeout: 10_000,
	maxProducerRetries: 3,
	producerRetryDelay: 300,
	bufferInterval: 5000,
	bufferMax: 1000,
	bufferHardMax: 10_000,
	chunkSize: 5000,
};

const TOPIC_MAP: Record<string, string> = {
	"analytics-events": TABLE_NAMES.events,
	"analytics-outgoing-links": TABLE_NAMES.outgoing_links,
	"analytics-error-spans": TABLE_NAMES.error_spans,
	"analytics-vitals-spans": TABLE_NAMES.web_vitals_spans,
	"analytics-custom-events": TABLE_NAMES.custom_events,
	"analytics-ai-call-spans": TABLE_NAMES.ai_call_spans,
	"analytics-ai-traffic-spans": TABLE_NAMES.ai_traffic_spans,
};

let fx: ReturnType<typeof makeProducerEffects> | null = null;

const ProducerLive = Layer.scopedDiscard(
	Effect.gen(function* () {
		const ref = yield* Ref.make<ProducerState>({ ...INITIAL_STATE });
		const effects = makeProducerEffects(
			CONFIG,
			initializeKafka(CONFIG),
			clickHouse,
			TOPIC_MAP,
			ref
		);
		fx = effects;
		yield* effects.flush.pipe(
			Effect.catchAll(() => Effect.void),
			Effect.repeat(Schedule.spaced(CONFIG.bufferInterval)),
			Effect.forkScoped
		);
	})
);

const runtime = ManagedRuntime.make(ProducerLive);

const withFx = <A, E>(
	fn: (f: NonNullable<typeof fx>) => Effect.Effect<A, E>
): Effect.Effect<A | undefined, E> =>
	Effect.suspend(() => (fx ? fn(fx) : Effect.void));

export const send = (topic: string, event: unknown, key?: string) =>
	withFx((f) => f.sendOne(topic, event, key));

export const sendBatch = (topic: string, events: unknown[]) =>
	withFx((f) => f.sendMany(topic, events));

export const disconnect = withFx((f) => f.shutDown);

export const getStats = withFx((f) => f.stats);

export const runFork = <A, E>(effect: Effect.Effect<A, E>) =>
	runtime.runFork(effect);

export const runPromise = <A, E>(effect: Effect.Effect<A, E>) =>
	runtime.runPromise(effect);

export const disposeRuntime = () => runtime.dispose();
