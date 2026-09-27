import { clickHouse } from "@databuddy/db/clickhouse";
import { readBooleanEnv } from "@databuddy/env/boolean";
import { CompressionTypes, Kafka, type Producer } from "kafkajs";
import { captureError } from "./tracing";

const TOPIC = "analytics-uptime-checks";

function createKafka(): Kafka {
	const broker = process.env.REDPANDA_BROKER;
	if (!broker) {
		throw new Error("REDPANDA_BROKER not set");
	}
	const username = process.env.REDPANDA_USER;
	const password = process.env.REDPANDA_PASSWORD;
	return new Kafka({
		brokers: [broker],
		clientId: "uptime-producer",
		...(username && password
			? { sasl: { mechanism: "scram-sha-256", username, password } }
			: {}),
		ssl: true,
	});
}

const connectProducer = async (): Promise<Producer> => {
	const producer = createKafka().producer({
		maxInFlightRequests: 1,
		idempotent: true,
		transactionTimeout: 30_000,
	});
	await producer.connect();
	return producer;
};

export async function pingRedpanda(): Promise<void> {
	const admin = createKafka().admin();
	try {
		await admin.connect();
	} finally {
		await admin.disconnect().catch(() => undefined);
	}
}

let singletonProducer: Producer | null = null;
let singletonConnection: Promise<Producer> | null = null;

function ensureProducer(): Promise<Producer> {
	if (singletonProducer) {
		return Promise.resolve(singletonProducer);
	}
	if (singletonConnection) {
		return singletonConnection;
	}

	singletonConnection = connectProducer()
		.then((producer) => {
			singletonProducer = producer;
			return producer;
		})
		.catch((error) => {
			captureError(error, { error_step: "kafka_producer_connect" });
			throw error;
		})
		.finally(() => {
			singletonConnection = null;
		});

	return singletonConnection;
}

async function resetProducer(producer: Producer): Promise<void> {
	if (singletonProducer !== producer) {
		return;
	}

	singletonProducer = null;
	try {
		await producer.disconnect();
	} catch (error) {
		captureError(error, { error_step: "kafka_producer_disconnect" });
	}
}

export async function sendUptimeEvent(
	event: unknown,
	key?: string
): Promise<void> {
	if (readBooleanEnv("SELFHOST")) {
		await clickHouse.insert({
			table: "uptime.uptime_monitor",
			values: [event],
			format: "JSONEachRow",
			abort_signal: AbortSignal.timeout(10_000),
			clickhouse_settings: {
				async_insert: 0,
			},
		});
		return;
	}
	const producer = await ensureProducer();
	try {
		await producer.send({
			topic: TOPIC,
			acks: -1,
			messages: [
				{
					value: JSON.stringify(event, (_key, value) =>
						value === undefined ? null : value
					),
					key,
				},
			],
			compression: CompressionTypes.GZIP,
		});
	} catch (error) {
		captureError(error, { error_step: "kafka_producer_send" });
		await resetProducer(producer);
		throw error;
	}
}

export async function disconnectProducer(): Promise<void> {
	const producer =
		singletonProducer ?? (await singletonConnection?.catch(() => null));
	if (producer) {
		await resetProducer(producer);
	}
}
