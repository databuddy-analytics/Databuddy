import { CompressionTypes, Kafka, type Producer } from "kafkajs";
import { captureError } from "./tracing";

const TOPIC = "analytics-uptime-checks";

let producer: Producer | null = null;
let connected = false;

async function ensureProducer(): Promise<Producer | null> {
	if (connected && producer) return producer;

	const broker = process.env.REDPANDA_BROKER;
	if (!broker) return null;

	try {
		const username = process.env.REDPANDA_USER;
		const password = process.env.REDPANDA_PASSWORD;
		const kafka = new Kafka({
			brokers: [broker],
			clientId: "uptime-producer",
			...(username &&
				password && {
					sasl: { mechanism: "scram-sha-256", username, password },
					ssl: false,
				}),
		});

		producer = kafka.producer({
			maxInFlightRequests: 1,
			idempotent: true,
			transactionTimeout: 30_000,
		});

		await producer.connect();
		connected = true;
		return producer;
	} catch (error) {
		captureError(error, { error_step: "kafka_producer_connect" });
		connected = false;
		return null;
	}
}

export async function sendUptimeEvent(
	event: unknown,
	key?: string
): Promise<void> {
	const p = await ensureProducer();
	if (!p) return;

	try {
		await p.send({
			topic: TOPIC,
			messages: [
				{
					value: JSON.stringify(event, (_k, v) =>
						v === undefined ? null : v
					),
					key,
				},
			],
			compression: CompressionTypes.GZIP,
		});
	} catch (error) {
		captureError(error, { error_step: "kafka_producer_send" });
	}
}

export async function disconnectProducer(): Promise<void> {
	if (!producer) return;
	try {
		await producer.disconnect();
	} catch (error) {
		captureError(error, { error_step: "kafka_producer_disconnect" });
	}
	producer = null;
	connected = false;
}
