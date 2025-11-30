import type { ClickHouseClient } from "@clickhouse/client";
import { clickHouse, TABLE_NAMES } from "@databuddy/db";
import { CompressionTypes, Kafka, type Producer } from "kafkajs";
import { captureError, record, setAttributes } from "./tracing";

/**
 * JSON stringify with undefined -> null conversion
 * ClickHouse needs explicit nulls, not omitted fields
 */
function stringifyEvent(event: unknown): string {
	return JSON.stringify(event, (_key, value) => (value === undefined ? null : value));
}

type BufferedEvent = {
	table: string;
	event: unknown;
};

type ProducerStats = {
	sent: number;
	failed: number;
	buffered: number;
	flushed: number;
	dropped: number;
	errors: number;
	lastErrorTime: number | null;
};

type ProducerConfig = {
	broker?: string;
	username?: string;
	password?: string;
	selfHost?: boolean;
	reconnectCooldown?: number;
	kafkaTimeout?: number;
	maxProducerRetries?: number;
	producerRetryDelay?: number;
	bufferInterval?: number;
	bufferMax?: number;
	bufferHardMax?: number;
	chunkSize?: number;
	flushTimeout?: number;
};

type RequiredProducerConfig = {
	broker?: string;
	username?: string;
	password?: string;
	selfHost: boolean;
	reconnectCooldown: number;
	kafkaTimeout: number;
	maxProducerRetries: number;
	producerRetryDelay: number;
	bufferInterval: number;
	bufferMax: number;
	bufferHardMax: number;
	chunkSize: number;
	flushTimeout: number;
};

type ProducerDependencies = {
	clickHouse: ClickHouseClient;
	topicMap: Record<string, string>;
	onError?: (error: Error) => void;
};

export class EventProducer {
	private readonly config: RequiredProducerConfig;
	private readonly dependencies: ProducerDependencies;
	private readonly stats: ProducerStats;
	private readonly buffer: BufferedEvent[] = [];

	private kafka: Kafka | null = null;
	private producer: Producer | null = null;
	private connected = false;
	private failed = false;
	private lastRetry = 0;
	private shuttingDown = false;
	private timer: Timer | null = null;
	private started = false;
	private flushing = false;

	constructor(config: ProducerConfig, dependencies: ProducerDependencies) {
		this.config = {
			selfHost: false,
			reconnectCooldown: 60_000,
			kafkaTimeout: 10_000,
			maxProducerRetries: 3,
			producerRetryDelay: 300,
			bufferInterval: 5000,
			bufferMax: 1000,
			bufferHardMax: 10_000,
			chunkSize: 5000,
			flushTimeout: 30_000,
			...config,
		};
		this.dependencies = dependencies;
		this.stats = {
			sent: 0,
			failed: 0,
			buffered: 0,
			flushed: 0,
			dropped: 0,
			errors: 0,
			lastErrorTime: null,
		};

		if (this.isEnabled()) {
			this.initializeProducer();
		}
	}

	private isEnabled(): boolean {
		if (this.config.selfHost) {
			return false;
		}
		return Boolean(this.config.broker);
	}

	private initializeProducer(): void {
		if (!(this.config.username && this.config.password)) {
			captureError(
				new Error(
					"REDPANDA_BROKER set but credentials missing. Kafka producer disabled."
				)
			);
			return;
		}

		this.kafka = new Kafka({
			clientId: "basket",
			brokers: [this.config.broker ?? ""],
			connectionTimeout: 5000,
			requestTimeout: this.config.kafkaTimeout,
			sasl: {
				mechanism: "scram-sha-256",
				username: this.config.username,
				password: this.config.password,
			},
		});

		this.producer = this.kafka.producer({
			allowAutoTopicCreation: true,
			retry: {
				initialRetryTime: this.config.producerRetryDelay,
				retries: this.config.maxProducerRetries,
				maxRetryTime: 3000,
			},
			idempotent: true,
			maxInFlightRequests: 15,
		});
	}

	private async connect(): Promise<boolean> {
		if (!(this.isEnabled() && this.producer) || this.connected) {
			return this.connected;
		}

		if (
			this.failed &&
			Date.now() - this.lastRetry < this.config.reconnectCooldown
		) {
			return false;
		}

		try {
			await this.producer.connect();
			this.connected = true;
			this.failed = false;
			this.lastRetry = 0;
			return true;
		} catch (error) {
			this.failed = true;
			this.lastRetry = Date.now();
			this.stats.errors += 1;
			this.stats.lastErrorTime = Date.now();
			captureError(error, {
				message: "Redpanda connection failed, using ClickHouse fallback",
			});
			if (this.dependencies.onError) {
				this.dependencies.onError(new Error(String(error)));
			}
			return false;
		}
	}

	private async flush(): Promise<void> {
		if (this.buffer.length === 0 || this.flushing) {
			return;
		}

		this.flushing = true;
		const batchSize = Math.min(this.buffer.length, this.config.bufferMax);
		const items = this.buffer.splice(0, batchSize);

		try {
			const grouped = items.reduce(
				(acc, { table, event }) => {
					if (!acc[table]) {
						acc[table] = [];
					}
					acc[table].push(event);
					return acc;
				},
				{} as Record<string, unknown[]>
			);

			const results = await Promise.allSettled(
				Object.entries(grouped).map(async ([table, events]) => {
					const controller = new AbortController();
					const timeout = setTimeout(
						() => controller.abort(),
						this.config.flushTimeout
					);

					try {
						for (let i = 0; i < events.length; i += this.config.chunkSize) {
							const chunk = events.slice(i, i + this.config.chunkSize);
							await this.dependencies.clickHouse.insert({
								table,
								values: chunk,
								format: "JSONEachRow",
							});
						}

						this.stats.flushed += events.length;
					} catch (error) {
						clearTimeout(timeout);
						this.stats.errors += 1;
						captureError(error, { message: `Flush failed for ${table}` });

						if (this.buffer.length + events.length <= this.config.bufferHardMax) {
							for (const event of events) {
								this.buffer.push({ table, event });
							}
						} else {
							this.stats.dropped += events.length;
							captureError(error, {
								message: `Dropped ${events.length} events - buffer full`,
								table,
								bufferSize: this.buffer.length,
							});
						}
					} finally {
						clearTimeout(timeout);
					}
				})
			);

			const failures = results.filter((r) => r.status === "rejected");
			if (failures.length > 0) {
				captureError(new Error("Table flush operations failed"), {
					failures: failures.length,
				});
			}
		} catch (error) {
			this.stats.errors += 1;
			captureError(error, { message: "Critical flush error" });
			this.buffer.push(...items);
		} finally {
			this.flushing = false;
		}
	}

	private startTimer(): void {
		if (this.started || this.shuttingDown) {
			return;
		}
		this.started = true;
		this.timer = setInterval(() => {
			if (!this.flushing && this.buffer.length > 0) {
				// Wrap auto-flush in a span
				record("producer.autoFlush", async () => {
					await this.flush().catch((error) => {
						this.stats.errors += 1;
						captureError(error, { message: "Flush timer error" });
					});
				});
			}
		}, this.config.bufferInterval);
	}

	private toBuffer(topic: string, event: unknown): void {
		if (this.shuttingDown) {
			captureError(new Error("Cannot buffer event during shutdown"));
			return;
		}

		const table = this.dependencies.topicMap[topic];
		if (!table) {
			this.stats.errors += 1;
			captureError(new Error("Unknown topic"), { topic });
			return;
		}

		if (this.buffer.length >= this.config.bufferHardMax) {
			this.stats.dropped += 1;
			captureError(new Error("Buffer overflow, dropping event"), {
				bufferLength: this.buffer.length,
			});
			return;
		}

		this.buffer.push({ table, event });
		this.stats.buffered += 1;

		if (!this.timer) {
			this.startTimer();
		}
		if (this.buffer.length >= this.config.bufferMax && !this.flushing) {
			this.flush().catch((error) => {
				this.stats.errors += 1;
				captureError(error, { message: "Auto-flush error" });
			});
		}
	}

	send(topic: string, event: unknown, key?: string): Promise<void> {
		return record("kafkaSend", async () => {
			setAttributes({
				"kafka.topic": topic,
				"kafka.has_key": Boolean(key),
			});

			if (this.shuttingDown) {
				this.toBuffer(topic, event);
				setAttributes({
					"kafka.buffered": true,
					"kafka.reason": "shutting_down",
				});
				return;
			}

			try {
				if (
					this.isEnabled() &&
					(await this.connect()) &&
					this.producer &&
					this.connected
				) {
					try {
						await this.producer.send({
							topic,
							messages: [
								{
									value: stringifyEvent(event),
									key: key || (event as { client_id?: string }).client_id,
								},
							],
							timeout: this.config.kafkaTimeout,
							compression: CompressionTypes.GZIP,
						});
						this.stats.sent += 1;
						setAttributes({
							"kafka.sent": true,
							"kafka.stats.sent": this.stats.sent,
						});
						return;
					} catch (error) {
						this.stats.failed += 1;
						captureError(error, {
							message: "Redpanda send failed, buffering to ClickHouse",
						});
						this.failed = true;
						setAttributes({
							"kafka.send_failed": true,
							"kafka.stats.failed": this.stats.failed,
						});
					}
				}
				this.toBuffer(topic, event);
				setAttributes({
					"kafka.buffered": true,
					"kafka.reason": "not_connected",
				});
			} catch (error) {
				this.stats.errors += 1;
				this.stats.lastErrorTime = Date.now();
				captureError(error, { message: "Send error" });
				this.toBuffer(topic, event);
				setAttributes({
					"kafka.error": true,
					"kafka.buffered": true,
				});
			}
		});
	}

	sendEvent(topic: string, event: unknown, key?: string): void {
		this.send(topic, event, key).catch((error) => {
			this.stats.errors += 1;
			captureError(error, { message: "sendEvent error" });
		});
	}

	async sendEventSync(
		topic: string,
		event: unknown,
		key?: string
	): Promise<void> {
		await this.send(topic, event, key);
	}

	sendEventBatch(topic: string, events: unknown[]): Promise<void> {
		return record("kafkaSendBatch", async () => {
			if (events.length === 0) {
				return;
			}

			setAttributes({
				"kafka.topic": topic,
				"kafka.batch_size": events.length,
			});

			if (this.shuttingDown) {
				for (const e of events) {
					this.toBuffer(topic, e);
				}
				setAttributes({
					"kafka.buffered": true,
					"kafka.reason": "shutting_down",
				});
				return;
			}

			try {
				if (
					this.isEnabled() &&
					(await this.connect()) &&
					this.producer &&
					this.connected
				) {
					try {
						await this.producer.send({
							topic,
							messages: events.map((e) => ({
								value: stringifyEvent(e),
								key:
									(e as { client_id?: string; event_id?: string }).client_id ||
									(e as { event_id?: string }).event_id,
							})),
							timeout: this.config.kafkaTimeout,
							compression: CompressionTypes.GZIP,
						});
						this.stats.sent += events.length;
						setAttributes({
							"kafka.sent": true,
							"kafka.stats.sent": this.stats.sent,
						});
						return;
					} catch (error) {
						this.stats.failed += events.length;
						captureError(error, {
							message: "Redpanda batch failed, buffering to ClickHouse",
						});
						this.failed = true;
						setAttributes({
							"kafka.send_failed": true,
							"kafka.stats.failed": this.stats.failed,
						});
					}
				}
				for (const e of events) {
					this.toBuffer(topic, e);
				}
				setAttributes({
					"kafka.buffered": true,
					"kafka.reason": "not_connected",
				});
			} catch (error) {
				this.stats.errors += 1;
				captureError(error, { message: "sendEventBatch error" });
				for (const e of events) {
					this.toBuffer(topic, e);
				}
				setAttributes({
					"kafka.error": true,
					"kafka.buffered": true,
				});
			}
		});
	}

	async disconnect(): Promise<void> {
		if (this.shuttingDown) {
			return;
		}
		this.shuttingDown = true;

		// Wait a bit for in-flight requests to complete
		await new Promise((r) => setTimeout(r, 1000));

		// Flush remaining buffer
		await this.flush();

		// Try one more time if there's still items
		if (this.buffer.length > 0 && !this.flushing) {
			await this.flush();
		}

		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
			this.started = false;
		}

		if (this.connected && this.producer) {
			try {
				await this.producer.disconnect();
			} catch (error) {
				captureError(error, {
					message: "Error disconnecting Redpanda producer",
				});
			} finally {
				this.connected = false;
			}
		}
	}

	getStats() {
		return {
			...this.stats,
			bufferSize: this.buffer.length,
			connected: this.connected,
			failed: this.failed,
			kafkaEnabled: this.isEnabled(),
			lastRetry: this.lastRetry,
		};
	}
}

const defaultConfig: ProducerConfig = {
	broker: process.env.REDPANDA_BROKER,
	username: process.env.REDPANDA_USER,
	password: process.env.REDPANDA_PASSWORD,
	selfHost: process.env.SELFHOST === "true",
};

let defaultProducer: EventProducer | null = null;

function getDefaultProducer(): EventProducer {
	if (!defaultProducer) {
		defaultProducer = new EventProducer(defaultConfig, {
			clickHouse,
			topicMap: {
				"analytics-events": TABLE_NAMES.events,
				"analytics-errors": TABLE_NAMES.errors,
				"analytics-web-vitals": TABLE_NAMES.web_vitals,
				"analytics-custom-events": TABLE_NAMES.custom_events,
				"analytics-outgoing-links": TABLE_NAMES.outgoing_links,
			},
		});
	}
	return defaultProducer;
}

export const sendEvent = (
	topic: string,
	event: unknown,
	key?: string
): void => {
	getDefaultProducer().sendEvent(topic, event, key);
};

export const sendEventSync = async (
	topic: string,
	event: unknown,
	key?: string
): Promise<void> => {
	await getDefaultProducer().sendEventSync(topic, event, key);
};

export const sendEventBatch = async (
	topic: string,
	events: unknown[]
): Promise<void> => {
	await getDefaultProducer().sendEventBatch(topic, events);
};

export const disconnectProducer = async (): Promise<void> => {
	if (defaultProducer) {
		await defaultProducer.disconnect();
	}
};

export const getProducerStats = () => getDefaultProducer().getStats();
