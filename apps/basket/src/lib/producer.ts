import type { ClickHouseClient } from "@clickhouse/client";
import { clickHouse, TABLE_NAMES } from "@databuddy/db";
import { Semaphore } from "async-mutex";
import { CompressionTypes, Kafka, type Producer } from "kafkajs";

type BufferedEvent = {
	table: string;
	event: unknown;
	retries: number;
	timestamp: number;
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
	semaphoreLimit?: number;
	reconnectCooldown?: number;
	kafkaTimeout?: number;
	maxProducerRetries?: number;
	producerRetryDelay?: number;
	bufferInterval?: number;
	bufferMax?: number;
	bufferHardMax?: number;
	maxRetries?: number;
	chunkSize?: number;
	flushTimeout?: number;
};

type RequiredProducerConfig = {
	broker?: string;
	username?: string;
	password?: string;
	selfHost: boolean;
	semaphoreLimit: number;
	reconnectCooldown: number;
	kafkaTimeout: number;
	maxProducerRetries: number;
	producerRetryDelay: number;
	bufferInterval: number;
	bufferMax: number;
	bufferHardMax: number;
	maxRetries: number;
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
	private readonly semaphore: Semaphore;
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
			semaphoreLimit: 15,
			reconnectCooldown: 60_000,
			kafkaTimeout: 10_000,
			maxProducerRetries: 3,
			producerRetryDelay: 300,
			bufferInterval: 5000,
			bufferMax: 1000,
			bufferHardMax: 10_000,
			maxRetries: 3,
			chunkSize: 5000,
			flushTimeout: 30_000,
			...config,
		};
		this.dependencies = dependencies;
		this.semaphore = new Semaphore(this.config.semaphoreLimit);
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
			console.error(
				"REDPANDA_BROKER set but credentials missing. Kafka producer disabled."
			);
			return;
		}

		this.kafka = new Kafka({
			clientId: "basket",
			brokers: [this.config.broker!],
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
			maxInFlightRequests: 5,
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
		} catch (err) {
			this.failed = true;
			this.lastRetry = Date.now();
			this.stats.errors++;
			this.stats.lastErrorTime = Date.now();
			const error = err instanceof Error ? err : new Error(String(err));
			console.error(
				"Redpanda connection failed, using ClickHouse fallback:",
				error
			);
			if (this.dependencies.onError) {
				this.dependencies.onError(error);
			}
			return false;
		}
	}

	private async flush(): Promise<void> {
		if (this.buffer.length === 0 || this.flushing) return;

		this.flushing = true;
		const items = this.buffer.splice(0);

		try {
			const grouped = items.reduce(
				(acc, { table, event, retries, timestamp }) => {
					if (!acc[table]) acc[table] = [];
					acc[table].push({ event, retries, timestamp });
					return acc;
				},
				{} as Record<
					string,
					Array<{ event: unknown; retries: number; timestamp: number }>
				>
			);

			const results = await Promise.allSettled(
				Object.entries(grouped).map(async ([table, items]) => {
					const controller = new AbortController();
					const timeout = setTimeout(
						() => controller.abort(),
						this.config.flushTimeout
					);

					try {
						const events = items.map((i) => i.event);

						for (let i = 0; i < events.length; i += this.config.chunkSize) {
							const chunk = events.slice(i, i + this.config.chunkSize);
							await this.dependencies.clickHouse.insert({
								table,
								values: chunk,
								format: "JSONEachRow",
							});
						}

						this.stats.flushed += events.length;
					} catch (err) {
						clearTimeout(timeout);
						this.stats.errors++;
						console.error(`Flush failed for ${table}:`, err);

						items.forEach(({ event, retries, timestamp }) => {
							const age = Date.now() - timestamp;
							if (retries < this.config.maxRetries && age < 300_000) {
								this.buffer.push({
									table,
									event,
									retries: retries + 1,
									timestamp,
								});
							} else {
								this.stats.dropped++;
								console.error(
									`Dropped event (retries: ${retries}, age: ${age}ms)`,
									{
										table,
										eventId: (event as { event_id?: string }).event_id,
									}
								);
							}
						});
					} finally {
						clearTimeout(timeout);
					}
				})
			);

			const failures = results.filter((r) => r.status === "rejected");
			if (failures.length > 0) {
				console.error(`${failures.length} table flush operations failed`);
			}
		} catch (err) {
			this.stats.errors++;
			console.error("Critical flush error:", err);
			this.buffer.push(...items);
		} finally {
			this.flushing = false;
		}
	}

	private startTimer(): void {
		if (this.started || this.shuttingDown) return;
		this.started = true;
		this.timer = setInterval(() => {
			if (!this.flushing && this.buffer.length > 0) {
				this.flush().catch((err) => {
					this.stats.errors++;
					console.error("Flush timer error:", err);
				});
			}
		}, this.config.bufferInterval);
	}

	private toBuffer(topic: string, event: unknown): void {
		if (this.shuttingDown) {
			console.error("Cannot buffer event during shutdown");
			return;
		}

		const table = this.dependencies.topicMap[topic];
		if (!table) {
			this.stats.errors++;
			console.error(`Unknown topic: ${topic}`);
			return;
		}

		if (this.buffer.length >= this.config.bufferHardMax) {
			this.stats.dropped++;
			console.error(
				`Buffer overflow, dropping event (size: ${this.buffer.length})`
			);
			return;
		}

		this.buffer.push({ table, event, retries: 0, timestamp: Date.now() });
		this.stats.buffered++;

		if (!this.timer) this.startTimer();
		if (this.buffer.length >= this.config.bufferMax && !this.flushing) {
			this.flush().catch((err) => {
				this.stats.errors++;
				console.error("Auto-flush error:", err);
			});
		}
	}

	async send(topic: string, event: unknown, key?: string): Promise<void> {
		if (this.shuttingDown) {
			this.toBuffer(topic, event);
			return;
		}

		const [, release] = await this.semaphore.acquire();

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
								value: JSON.stringify(event),
								key: key || (event as { client_id?: string }).client_id,
							},
						],
						timeout: this.config.kafkaTimeout,
						compression: CompressionTypes.GZIP,
					});
					this.stats.sent++;
					return;
				} catch (err) {
					this.stats.failed++;
					console.error("Redpanda send failed, buffering to ClickHouse:", err);
					this.failed = true;
				}
			}
			this.toBuffer(topic, event);
		} catch (err) {
			this.stats.errors++;
			this.stats.lastErrorTime = Date.now();
			console.error("Send error:", err);
			this.toBuffer(topic, event);
		} finally {
			release();
		}
	}

	sendEvent(topic: string, event: unknown, key?: string): void {
		this.send(topic, event, key).catch((err) => {
			this.stats.errors++;
			console.error("sendEvent error:", err);
		});
	}

	async sendEventSync(
		topic: string,
		event: unknown,
		key?: string
	): Promise<void> {
		await this.send(topic, event, key);
	}

	async sendEventBatch(topic: string, events: unknown[]): Promise<void> {
		if (events.length === 0) return;

		if (this.shuttingDown) {
			for (const e of events) {
				this.toBuffer(topic, e);
			}
			return;
		}

		const [, release] = await this.semaphore.acquire();

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
							value: JSON.stringify(e),
							key:
								(e as { client_id?: string; event_id?: string }).client_id ||
								(e as { event_id?: string }).event_id,
						})),
						timeout: this.config.kafkaTimeout,
						compression: CompressionTypes.GZIP,
					});
					this.stats.sent += events.length;
					return;
				} catch (err) {
					this.stats.failed += events.length;
					console.error("Redpanda batch failed, buffering to ClickHouse:", err);
					this.failed = true;
				}
			}
			for (const e of events) {
				this.toBuffer(topic, e);
			}
		} catch (err) {
			this.stats.errors++;
			console.error("sendEventBatch error:", err);
			for (const e of events) {
				this.toBuffer(topic, e);
			}
		} finally {
			release();
		}
	}

	async disconnect(): Promise<void> {
		if (this.shuttingDown) return;
		this.shuttingDown = true;

		let checks = 0;
		while (
			this.semaphore.getValue() < this.config.semaphoreLimit &&
			checks++ < 50
		) {
			await new Promise((r) => setTimeout(r, 100));
		}

		await this.flush();

		let finalFlushAttempts = 0;
		while (
			this.buffer.length > 0 &&
			finalFlushAttempts++ < 3 &&
			!this.flushing
		) {
			await this.flush();
			await new Promise((r) => setTimeout(r, 1000));
		}

		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
			this.started = false;
		}

		if (this.connected && this.producer) {
			try {
				await this.producer.disconnect();
			} catch (err) {
				console.error("Error disconnecting Redpanda producer:", err);
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

process.on("SIGTERM", async () => {
	await disconnectProducer().catch(console.error);
	process.exit(0);
});

process.on("SIGINT", async () => {
	await disconnectProducer().catch(console.error);
	process.exit(0);
});
