import { CompressionTypes, Kafka, type Producer } from 'kafkajs';
import { Semaphore } from 'async-mutex';
import { clickHouse, TABLE_NAMES } from '@databuddy/db';

const BROKER = process.env.KAFKA_BROKERS as string;
const SEMAPHORE_LIMIT = 15;
const BUFFER_INTERVAL = 5000;
const BUFFER_MAX = 1000;
const BUFFER_HARD_MAX = 10000;
const MAX_RETRIES = 3;
const RECONNECT_COOLDOWN = 60000;
const CHUNK_SIZE = 5000;
const KAFKA_TIMEOUT = 10000;
const FLUSH_TIMEOUT = 30000;

const semaphore = new Semaphore(SEMAPHORE_LIMIT);

type BufferedEvent = {
	table: string;
	event: any;
	retries: number;
	timestamp: number;
};

type Stats = {
	kafkaSent: number;
	kafkaFailed: number;
	buffered: number;
	flushed: number;
	dropped: number;
	errors: number;
};

const stats: Stats = {
	kafkaSent: 0,
	kafkaFailed: 0,
	buffered: 0,
	flushed: 0,
	dropped: 0,
	errors: 0,
};

const buffer: BufferedEvent[] = [];
let timer: Timer | null = null;
let started = false;
let flushing = false;
let shuttingDown = false;

const topicMap: Record<string, string> = {
	'analytics-events': TABLE_NAMES.events,
	'analytics-errors': TABLE_NAMES.errors,
	'analytics-web-vitals': TABLE_NAMES.web_vitals,
	'analytics-custom-events': TABLE_NAMES.custom_events,
	'analytics-outgoing-links': TABLE_NAMES.outgoing_links,
};

let kafka: Kafka | null = null;
let producer: Producer | null = null;
let connected = false;
let failed = false;
let lastRetry = 0;

if (BROKER) {
	kafka = new Kafka({
		clientId: 'basket',
		brokers: [BROKER],
		connectionTimeout: 5000,
		requestTimeout: KAFKA_TIMEOUT,
		sasl: {
			mechanism: 'scram-sha-256',
			username: process.env.KAFKA_USER as string,
			password: process.env.KAFKA_PASSWORD as string,
		},
	});
	producer = kafka.producer({
		allowAutoTopicCreation: true,
		retry: {
			initialRetryTime: 300,
			retries: 3,
			maxRetryTime: 3000,
		},
		idempotent: true,
		maxInFlightRequests: 5,
	});
}

async function connect() {
	if (!BROKER || !producer || connected) return connected;
	if (failed && Date.now() - lastRetry < RECONNECT_COOLDOWN) return false;

	try {
		await producer.connect();
		connected = true;
		failed = false;
		lastRetry = 0;
		console.log('Kafka connected');
		return true;
	} catch (err) {
		failed = true;
		lastRetry = Date.now();
		console.error('Kafka connection failed, using ClickHouse fallback', err);
		return false;
	}
}

async function flush() {
	if (buffer.length === 0 || flushing) return;

	flushing = true;
	const items = buffer.splice(0);

	try {
		const grouped = items.reduce((acc, { table, event, retries, timestamp }) => {
			if (!acc[table]) acc[table] = [];
			acc[table].push({ event, retries, timestamp });
			return acc;
		}, {} as Record<string, Array<{ event: any; retries: number; timestamp: number }>>);

		const results = await Promise.allSettled(
			Object.entries(grouped).map(async ([table, items]) => {
				const controller = new AbortController();
				const timeout = setTimeout(() => controller.abort(), FLUSH_TIMEOUT);

				try {
					const events = items.map(i => i.event);
					let chunksFlushed = 0;

					for (let i = 0; i < events.length; i += CHUNK_SIZE) {
						const chunk = events.slice(i, i + CHUNK_SIZE);
						await clickHouse.insert({
							table,
							values: chunk,
							format: 'JSONEachRow',
						});
						chunksFlushed++;
					}

					stats.flushed += events.length;

					if (process.env.NODE_ENV === 'development') {
						console.log(`Flushed ${events.length} to ${table} (${chunksFlushed} chunks)`);
					}
				} catch (err) {
					clearTimeout(timeout);
					stats.errors++;
					console.error(`Flush failed for ${table}:`, err);

					items.forEach(({ event, retries, timestamp }) => {
						const age = Date.now() - timestamp;
						if (retries < MAX_RETRIES && age < 300000) {
							buffer.push({ table, event, retries: retries + 1, timestamp });
						} else {
							stats.dropped++;
							console.error(`Dropped event (retries: ${retries}, age: ${age}ms)`, {
								table,
								eventId: event.event_id,
							});
						}
					});
				} finally {
					clearTimeout(timeout);
				}
			})
		);

		const failures = results.filter(r => r.status === 'rejected');
		if (failures.length > 0) {
			console.error(`${failures.length} table flush operations failed`);
		}
	} catch (err) {
		stats.errors++;
		console.error('Critical flush error:', err);
		buffer.push(...items);
	} finally {
		flushing = false;
	}
}

function startTimer() {
	if (started || shuttingDown) return;
	started = true;
	timer = setInterval(() => {
		if (!flushing && buffer.length > 0) {
			flush().catch(err => {
				stats.errors++;
				console.error('Flush timer error:', err);
			});
		}
	}, BUFFER_INTERVAL);
}

function toBuffer(topic: string, event: any) {
	if (shuttingDown) {
		console.error('Cannot buffer event during shutdown');
		return;
	}

	const table = topicMap[topic];
	if (!table) {
		stats.errors++;
		console.error(`Unknown topic: ${topic}`);
		return;
	}

	if (buffer.length >= BUFFER_HARD_MAX) {
		stats.dropped++;
		console.error(`Buffer overflow, dropping event (size: ${buffer.length})`);
		return;
	}

	buffer.push({ table, event, retries: 0, timestamp: Date.now() });
	stats.buffered++;

	if (!timer) startTimer();
	if (buffer.length >= BUFFER_MAX && !flushing) {
		flush().catch(err => {
			stats.errors++;
			console.error('Auto-flush error:', err);
		});
	}
}

async function send(topic: string, event: any, key?: string) {
	if (shuttingDown) {
		toBuffer(topic, event);
		return;
	}

	const [, release] = await semaphore.acquire();

	try {
		if ((await connect()) && producer && connected) {
			try {
				await producer.send({
					topic,
					messages: [{ value: JSON.stringify(event), key: key || event.client_id }],
					timeout: KAFKA_TIMEOUT,
					compression: CompressionTypes.GZIP,
				});
				stats.kafkaSent++;
				return;
			} catch (err) {
				stats.kafkaFailed++;
				console.error('Kafka send failed, buffering to ClickHouse:', err);
				failed = true;
			}
		}
		toBuffer(topic, event);
	} catch (err) {
		stats.errors++;
		console.error('Send error:', err);
		toBuffer(topic, event);
	} finally {
		release();
	}
}

export const sendEvent = (topic: string, event: any, key?: string) => {
	send(topic, event, key).catch(err => {
		stats.errors++;
		console.error('sendEvent error:', err);
	});
};

export const sendEventSync = async (topic: string, event: any, key?: string) => {
	await send(topic, event, key);
};

export const sendEventBatch = async (topic: string, events: any[]) => {
	if (events.length === 0) return;

	if (shuttingDown) {
		for (const e of events) {
			toBuffer(topic, e);
		}
		return;
	}

	const [, release] = await semaphore.acquire();

	try {
		if ((await connect()) && producer && connected) {
			try {
				await producer.send({
					topic,
					messages: events.map(e => ({
						value: JSON.stringify(e),
						key: e.client_id || e.event_id,
					})),
					timeout: KAFKA_TIMEOUT,
					compression: CompressionTypes.GZIP,
				});
				stats.kafkaSent += events.length;
				return;
			} catch (err) {
				stats.kafkaFailed += events.length;
				console.error('Kafka batch failed, buffering to ClickHouse:', err);
				failed = true;
			}
		}
		for (const e of events) {
			toBuffer(topic, e);
		}
	} catch (err) {
		stats.errors++;
		console.error('sendEventBatch error:', err);
		for (const e of events) {
			toBuffer(topic, e);
		}
	} finally {
		release();
	}
};

export const disconnectProducer = async () => {
	if (shuttingDown) return;
	shuttingDown = true;

	console.log('Shutting down producer...', {
		bufferSize: buffer.length,
		inFlight: SEMAPHORE_LIMIT - semaphore.getValue(),
	});

	let checks = 0;
	while (semaphore.getValue() < SEMAPHORE_LIMIT && checks++ < 50) {
		await new Promise(r => setTimeout(r, 100));
	}

	await flush();

	let finalFlushAttempts = 0;
	while (buffer.length > 0 && finalFlushAttempts++ < 3 && !flushing) {
		console.log(`Final flush attempt ${finalFlushAttempts}, ${buffer.length} events remaining`);
		await flush();
		await new Promise(r => setTimeout(r, 1000));
	}

	if (timer) {
		clearInterval(timer);
		timer = null;
		started = false;
	}

	if (connected && producer) {
		try {
			await producer.disconnect();
			connected = false;
			console.log('Kafka producer disconnected');
		} catch (err) {
			console.error('Error disconnecting Kafka producer:', err);
		}
	}

	console.log('Producer shutdown complete', {
		stats,
		remainingBuffer: buffer.length,
	});
};

export const getProducerStats = () => ({ ...stats, bufferSize: buffer.length, connected, failed });

if (process.env.NODE_ENV === 'development') {
	setInterval(() => {
		const metrics = getProducerStats();
		if (metrics.kafkaSent > 0 || metrics.buffered > 0 || metrics.errors > 0) {
			console.log('Producer metrics:', metrics);
		}
	}, 30000);
}

process.on('SIGTERM', () => disconnectProducer().catch(console.error));
process.on('SIGINT', () => disconnectProducer().catch(console.error));
