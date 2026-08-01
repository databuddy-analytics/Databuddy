import type { ClickHouseClient } from "@clickhouse/client";
import { clickHouse, TABLE_NAMES } from "@databuddy/db/clickhouse";
import { readBooleanEnv } from "@databuddy/env/boolean";
import { captureError, record } from "@lib/tracing";
import { createError } from "evlog";
import { CompressionTypes, Kafka, type Producer } from "kafkajs";

function stringifyEvent(event: unknown): string {
	return JSON.stringify(event, (_key, value) =>
		value === undefined ? null : value
	);
}

function toError(error: unknown): Error {
	return error instanceof Error ? error : new Error(String(error));
}

export class ProducerShuttingDownError extends Error {
	readonly _tag = "ProducerShuttingDownError";
	readonly eventCount: number;
	readonly retryable = true;

	constructor({ eventCount }: { eventCount: number }) {
		super("Basket producer is shutting down");
		this.name = this._tag;
		this.eventCount = eventCount;
	}
}

export class UnknownKafkaTopicError extends Error {
	readonly _tag = "UnknownKafkaTopicError";
	readonly retryable = false;
	readonly topic: string;

	constructor({ topic }: { topic: string }) {
		super(`Unknown Kafka topic: ${topic}`);
		this.name = this._tag;
		this.topic = topic;
	}
}

export class ClickHouseFallbackError extends Error {
	readonly _tag = "ClickHouseFallbackError";
	override readonly cause?: Error;
	readonly retryable = true;
	readonly table: string;
	readonly topic: string;

	constructor({
		cause,
		table,
		topic,
	}: {
		cause?: Error;
		table: string;
		topic: string;
	}) {
		super(`Direct ClickHouse fallback insert failed for ${topic}`);
		this.name = this._tag;
		this.cause = cause;
		this.table = table;
		this.topic = topic;
	}
}

export class ShutdownDrainError extends Error {
	readonly _tag = "ShutdownDrainError";
	readonly deadlineMs: number;
	readonly inFlight: number;
	readonly retryable = true;

	constructor({
		deadlineMs,
		inFlight,
	}: {
		deadlineMs: number;
		inFlight: number;
	}) {
		super("Basket producer did not drain before shutdown");
		this.name = this._tag;
		this.deadlineMs = deadlineMs;
		this.inFlight = inFlight;
	}
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

export interface BasketProducer {
	sendMany: (topic: string, events: unknown[]) => Promise<void>;
	sendOne: (topic: string, event: unknown, key?: string) => Promise<void>;
	shutDown: () => Promise<void>;
}

async function insertClickHouseChunks(
	ch: ClickHouseClient,
	table: string,
	events: unknown[],
	chunkSize: number
): Promise<void> {
	for (let index = 0; index < events.length; index += chunkSize) {
		await ch.insert({
			table,
			values: events.slice(index, index + chunkSize),
			format: "JSONEachRow",
		});
	}
}

export function createProducer(
	config: ProducerConfig,
	kafka: Producer | null,
	ch: ClickHouseClient,
	topicMap: Record<string, string>
): BasketProducer {
	const kafkaEnabled =
		!config.selfHost && Boolean(config.broker) && kafka !== null;
	let connected = false;
	let connectionFailed = false;
	let connecting: Promise<boolean> | null = null;
	let inFlight = 0;
	let lastRetry = 0;
	let producerInitialized = false;
	let shuttingDown = false;

	function connect(): Promise<boolean> {
		if (!(kafkaEnabled && kafka)) {
			return Promise.resolve(false);
		}
		if (connected) {
			return Promise.resolve(true);
		}
		if (connectionFailed && Date.now() - lastRetry < config.reconnectCooldown) {
			return Promise.resolve(false);
		}
		if (connecting) {
			return connecting;
		}

		connecting = Promise.resolve()
			.then(() => kafka.connect())
			.then(() => {
				connected = true;
				connectionFailed = false;
				lastRetry = 0;
				producerInitialized = true;
				return true;
			})
			.catch((error) => {
				connectionFailed = true;
				lastRetry = Date.now();
				captureError(toError(error), {
					message: "Redpanda connection failed, using ClickHouse fallback",
				});
				return false;
			})
			.finally(() => {
				connecting = null;
			});

		return connecting;
	}

	function resolveTopic(topic: string): string {
		const table = topicMap[topic];
		if (table) {
			return table;
		}

		captureError(
			createError({
				code: "basket.UNKNOWN_KAFKA_TOPIC",
				message: "Unknown Kafka topic",
				status: 500,
				why: `Topic "${topic}" is not mapped to a ClickHouse table.`,
				fix: "Check topicMap configuration.",
			}),
			{ topic }
		);
		throw new UnknownKafkaTopicError({ topic });
	}

	async function persistDirectly(
		topic: string,
		events: unknown[]
	): Promise<void> {
		const table = resolveTopic(topic);
		try {
			await record("clickhouseDirectFallbackInsert", () =>
				insertClickHouseChunks(ch, table, events, config.chunkSize)
			);
		} catch (error) {
			const fallbackError = new ClickHouseFallbackError({
				cause: toError(error),
				table,
				topic,
			});
			captureError(fallbackError.cause, {
				message: "Direct ClickHouse fallback insert failed; rejecting delivery",
				table,
				topic,
			});
			throw fallbackError;
		}
	}

	function acquireSendSlot(eventCount: number): void {
		if (shuttingDown) {
			throw new ProducerShuttingDownError({ eventCount });
		}
		inFlight += eventCount;
	}

	function releaseSendSlot(eventCount: number): void {
		inFlight = Math.max(0, inFlight - eventCount);
	}

	async function sendViaKafka(
		topic: string,
		messages: Array<{ value: string; key?: string }>,
		fallbackEvents: unknown[]
	): Promise<void> {
		acquireSendSlot(fallbackEvents.length);

		try {
			if (kafkaEnabled && kafka && (await connect())) {
				try {
					await kafka.send({
						topic,
						messages,
						timeout: config.kafkaTimeout,
						compression: CompressionTypes.GZIP,
					});
					return;
				} catch (error) {
					connectionFailed = true;
					connected = false;
					lastRetry = Date.now();
					captureError(toError(error), {
						message: "Redpanda send failed, falling back to ClickHouse",
						message_count: messages.length,
						topic,
					});
				}
			}

			await persistDirectly(topic, fallbackEvents);
		} finally {
			releaseSendSlot(fallbackEvents.length);
		}
	}

	async function disconnectKafka(): Promise<void> {
		if (!(producerInitialized && kafka)) {
			return;
		}

		try {
			await kafka.disconnect();
		} catch (error) {
			captureError(toError(error), {
				message: "Error disconnecting Redpanda producer",
			});
		} finally {
			connected = false;
			producerInitialized = false;
		}
	}

	async function waitForInFlight(): Promise<void> {
		const deadline = Date.now() + config.shutdownDrainTimeout;
		while (inFlight > 0) {
			const remaining = deadline - Date.now();
			if (remaining <= 0) {
				throw new ShutdownDrainError({
					deadlineMs: config.shutdownDrainTimeout,
					inFlight,
				});
			}
			await new Promise((resolve) =>
				setTimeout(resolve, Math.min(10, remaining))
			);
		}
	}

	return {
		async sendOne(topic, event, key): Promise<void> {
			await sendViaKafka(
				topic,
				[
					{
						value: stringifyEvent(event),
						key: key || (event as { client_id?: string }).client_id,
					},
				],
				[event]
			);
		},
		async sendMany(topic, events): Promise<void> {
			if (events.length === 0) {
				return;
			}
			await sendViaKafka(
				topic,
				events.map((event) => ({
					value: stringifyEvent(event),
					key:
						(event as { client_id?: string }).client_id ||
						(event as { event_id?: string }).event_id,
				})),
				events
			);
		},
		async shutDown(): Promise<void> {
			shuttingDown = true;
			try {
				await waitForInFlight();
			} finally {
				await disconnectKafka();
			}
		},
	};
}

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

const producer = createProducer(
	CONFIG,
	initializeKafka(CONFIG),
	clickHouse,
	TOPIC_MAP
);

export const send = (topic: string, event: unknown, key?: string) =>
	producer.sendOne(topic, event, key);

export const sendBatch = (topic: string, events: unknown[]) =>
	producer.sendMany(topic, events);

export const disconnect = () => producer.shutDown();

export function runFork(delivery: Promise<unknown>): void {
	delivery.catch((error) => {
		captureError(error, {
			message: "Asynchronous producer delivery rejected",
		});
	});
}
