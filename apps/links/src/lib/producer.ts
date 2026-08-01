import { clickHouse, TABLE_NAMES } from "@databuddy/db/clickhouse";
import { CompressionTypes, Kafka, type Producer } from "kafkajs";
import { captureError, setAttributes } from "./logging";

const TOPIC = "analytics-link-visits";
const broker = process.env.REDPANDA_BROKER;
const username = process.env.REDPANDA_USER;
const password = process.env.REDPANDA_PASSWORD;
const reconnectCooldownMs = 60_000;
const kafkaTimeoutMs = 10_000;

let producer: Producer | null = null;
let connectPromise: Promise<boolean> | null = null;
let nextReconnectAt = 0;

/**
 * Immutable wire payload for a short-link click. The generated ID stays with
 * the record through Kafka and consumer retries, letting downstream queries
 * collapse pipeline replays without relying on a relational outbox.
 */
export interface LinkVisitEvent {
	browser_name: string | null;
	city: string | null;
	country: string | null;
	device_type: string | null;
	id: string;
	ip_hash: string;
	link_id: string;
	referrer: string | null;
	region: string | null;
	timestamp: string;
	user_agent: string | null;
}

function discardProducer(
	candidate: Producer,
	operation: "kafka_connect_disconnect" | "kafka_send_disconnect"
): void {
	if (producer === candidate) {
		producer = null;
	}

	try {
		candidate.disconnect().catch((error) => {
			captureError(error, { operation });
		});
	} catch (error) {
		captureError(error, { operation });
	}
}

function connect(): Promise<boolean> {
	if (producer) {
		return Promise.resolve(true);
	}
	if (!broker) {
		setAttributes({ kafka_broker_configured: false });
		return Promise.resolve(false);
	}

	const now = Date.now();
	if (now < nextReconnectAt) {
		setAttributes({ kafka_reconnect_suppressed: true });
		return Promise.resolve(false);
	}

	if (connectPromise) {
		return connectPromise;
	}

	connectPromise = (async () => {
		let candidate: Producer | null = null;

		try {
			const kafka = new Kafka({
				brokers: [broker],
				clientId: "links-producer",
				connectionTimeout: kafkaTimeoutMs,
				authenticationTimeout: kafkaTimeoutMs,
				requestTimeout: kafkaTimeoutMs,
				enforceRequestTimeout: true,
				...(username && password
					? { sasl: { mechanism: "scram-sha-256", username, password } }
					: {}),
				...(process.env.REDPANDA_SSL === "true" ? { ssl: true } : {}),
			});

			candidate = kafka.producer({
				maxInFlightRequests: 5,
				idempotent: true,
				transactionTimeout: 30_000,
			});

			await candidate.connect();
			producer = candidate;
			nextReconnectAt = 0;
			setAttributes({ kafka_connected: true });
			return true;
		} catch (error) {
			captureError(error, { operation: "kafka_connect" });
			if (candidate) {
				discardProducer(candidate, "kafka_connect_disconnect");
			}
			producer = null;
			nextReconnectAt = Date.now() + reconnectCooldownMs;
			setAttributes({ kafka_connected: false });
			return false;
		} finally {
			connectPromise = null;
		}
	})();

	return connectPromise;
}

export async function checkProducerHealth(): Promise<void> {
	if (!(await connect())) {
		throw new Error("Redpanda producer is unavailable");
	}
}

async function persistLinkVisitDirectly(
	event: LinkVisitEvent
): Promise<boolean> {
	try {
		await clickHouse.insert({
			table: TABLE_NAMES.link_visits,
			values: [event],
			format: "JSONEachRow",
		});
		setAttributes({ clickhouse_fallback_success: true });
		return true;
	} catch (error) {
		captureError(error, {
			operation: "clickhouse_link_visit_fallback",
			clickhouse_table: TABLE_NAMES.link_visits,
		});
		setAttributes({ clickhouse_fallback_success: false });
		return false;
	}
}

export async function sendLinkVisit(
	event: LinkVisitEvent,
	key?: string
): Promise<boolean> {
	const eventKey = key ?? event.link_id;
	setAttributes({
		kafka_broker_configured: Boolean(broker),
		kafka_topic: TOPIC,
		kafka_message_key: eventKey ?? "unknown",
	});

	const kafkaReady = await connect();
	const activeProducer = producer;
	if (!(kafkaReady && activeProducer)) {
		setAttributes({
			kafka_connected: false,
			kafka_send_skipped: true,
		});
		// No Kafka write was attempted, so direct persistence is not ambiguous.
		// The BullMQ job remains active until this insert is acknowledged.
		return persistLinkVisitDirectly(event);
	}

	setAttributes({ kafka_connected: true });
	try {
		await activeProducer.send({
			topic: TOPIC,
			acks: -1,
			timeout: kafkaTimeoutMs,
			messages: [
				{
					value: JSON.stringify(event, (_k, v) => (v === undefined ? null : v)),
					key: eventKey,
				},
			],
			compression: CompressionTypes.GZIP,
		});
		setAttributes({ kafka_send_success: true });
		return true;
	} catch (error) {
		captureError(error, {
			operation: "kafka_send",
			kafka_topic: TOPIC,
		});
		discardProducer(activeProducer, "kafka_send_disconnect");
		nextReconnectAt = Date.now() + reconnectCooldownMs;
		setAttributes({
			kafka_connected: false,
			kafka_send_ambiguous: true,
			kafka_send_success: false,
		});
		return false;
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
}
