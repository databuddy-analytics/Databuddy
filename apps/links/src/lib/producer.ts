import { CompressionTypes, Kafka, type Producer } from "kafkajs";
import { captureError, setAttributes } from "./logging";

const broker = process.env.REDPANDA_BROKER;
const username = process.env.REDPANDA_USER;
const password = process.env.REDPANDA_PASSWORD;

let producer: Producer | null = null;
let connected = false;

async function connect(): Promise<boolean> {
	if (connected && producer) {
		return true;
	}
	if (!broker) {
		setAttributes({ kafka_broker_configured: false });
		return false;
	}

	try {
		const kafka = new Kafka({
			brokers: [broker],
			clientId: "links-producer",
			...(username &&
				password && {
					sasl: { mechanism: "scram-sha-256", username, password },
					ssl: false,
				}),
		});

		producer = kafka.producer({
			maxInFlightRequests: 5,
			idempotent: true,
			transactionTimeout: 30_000,
		});

		await producer.connect();
		connected = true;
		setAttributes({ kafka_connected: true });
		return true;
	} catch (error) {
		captureError(error, { operation: "kafka_connect" });
		connected = false;
		setAttributes({ kafka_connected: false });
		return false;
	}
}

export async function sendLinkVisit(
	event: unknown,
	key?: string
): Promise<void> {
	const eventKey = key ?? (event as { link_id?: string }).link_id;
	setAttributes({
		kafka_topic: "analytics-link-visits",
		kafka_message_key: eventKey ?? "unknown",
	});

	try {
		if (!((await connect()) && producer)) {
			setAttributes({ kafka_send_skipped: true });
			return;
		}

		await producer.send({
			topic: "analytics-link-visits",
			messages: [
				{
					value: JSON.stringify(event, (_k, v) => (v === undefined ? null : v)),
					key: eventKey,
				},
			],
			compression: CompressionTypes.GZIP,
		});

		setAttributes({ kafka_send_success: true });
	} catch (error) {
		captureError(error, {
			operation: "kafka_send",
			kafka_topic: "analytics-link-visits",
		});
		setAttributes({ kafka_send_success: false });
	}
}

export async function disconnectProducer(): Promise<void> {
	if (!producer) {
		return;
	}
	try {
		await producer.disconnect();
	} catch (error) {
		captureError(error, { operation: "kafka_disconnect" });
	}
	producer = null;
	connected = false;
}
