import { CompressionTypes, Kafka, type Producer } from "kafkajs";
import { captureError } from "./tracing";

const TOPIC = "analytics-uptime-checks";

const connectProducer = (): Promise<Producer> => {
	const broker = process.env.REDPANDA_BROKER;
	if (!broker) {
		return Promise.reject(new Error("REDPANDA_BROKER not set"));
	}

	const username = process.env.REDPANDA_USER;
	const password = process.env.REDPANDA_PASSWORD;
	const kafka = new Kafka({
		brokers: [broker],
		clientId: "uptime-producer",
		...(username && password
			? { sasl: { mechanism: "scram-sha-256", username, password } }
			: {}),
		...(process.env.REDPANDA_SSL === "true" ? { ssl: true } : {}),
	});

	const producer = kafka.producer({
		maxInFlightRequests: 1,
		idempotent: true,
		transactionTimeout: 30_000,
	});

	return producer.connect().then(() => producer);
};

let singletonProducer: Producer | null = null;
let singletonConnection: Promise<Producer | null> | null = null;

export type UptimeEventSendResult =
	| { sent: true }
	| {
			sent: false;
			reason: "producer_unavailable" | "send_failed";
	  };

function ensureProducer(): Promise<Producer | null> {
	if (singletonProducer) {
		return Promise.resolve(singletonProducer);
	}

	if (!process.env.REDPANDA_BROKER) {
		return Promise.resolve(null);
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
			singletonProducer = null;
			return null;
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
): Promise<UptimeEventSendResult> {
	const p = await ensureProducer();
	if (!p) {
		return { sent: false, reason: "producer_unavailable" };
	}

	try {
		await p.send({
			topic: TOPIC,
			acks: -1,
			messages: [
				{
					value: JSON.stringify(event, (_k, v) => (v === undefined ? null : v)),
					key,
				},
			],
			compression: CompressionTypes.GZIP,
		});
		return { sent: true };
	} catch (error) {
		captureError(error, { error_step: "kafka_producer_send" });
		await resetProducer(p);
		return { sent: false, reason: "send_failed" };
	}
}

export async function disconnectProducer(): Promise<void> {
	const producer = singletonProducer ?? (await singletonConnection);
	if (!producer) {
		return;
	}
	await resetProducer(producer);
}
