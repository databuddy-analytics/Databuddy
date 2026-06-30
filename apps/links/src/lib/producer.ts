import { clickHouse, TABLE_NAMES } from "@databuddy/db/clickhouse";
import { CompressionTypes, Kafka, type Producer } from "kafkajs";
import { captureError, setAttributes } from "./logging";

const TOPIC = "analytics-link-visits";
const broker = process.env.REDPANDA_BROKER;
const username = process.env.REDPANDA_USER;
const password = process.env.REDPANDA_PASSWORD;
const reconnectCooldownMs = 60_000;
const sendTimeoutMs = 3000;

let producer: Producer | null = null;
let connected = false;
let connectPromise: Promise<boolean> | null = null;
let nextReconnectAt = 0;

export interface LinkVisitEvent {
	browser_name: string | null;
	city: string | null;
	country: string | null;
	device_type: string | null;
	ip_hash: string;
	link_id: string;
	referrer: string | null;
	region: string | null;
	timestamp: string;
	user_agent: string | null;
}

export interface LinkVisitSendResult {
	clickhouse_fallback_success: boolean;
	kafka_broker_configured: boolean;
	kafka_connected: boolean;
	kafka_send_ambiguous: boolean;
	kafka_send_skipped: boolean;
	kafka_send_success: boolean;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	return Promise.race([
		promise,
		new Promise<never>((_, reject) =>
			setTimeout(
				() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)),
				timeoutMs
			)
		),
	]);
}

function connect(): Promise<boolean> {
	if (connected && producer) {
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
		try {
			const kafka = new Kafka({
				brokers: [broker],
				clientId: "links-producer",
				requestTimeout: sendTimeoutMs,
				...(username &&
					password && {
						sasl: { mechanism: "scram-sha-256", username, password },
						ssl: process.env.REDPANDA_SSL === "true",
					}),
			});

			producer = kafka.producer({
				maxInFlightRequests: 5,
				idempotent: true,
				transactionTimeout: 30_000,
			});

			await withTimeout(producer.connect(), sendTimeoutMs);
			connected = true;
			nextReconnectAt = 0;
			setAttributes({ kafka_connected: true });
			return true;
		} catch (error) {
			captureError(error, { operation: "kafka_connect" });
			connected = false;
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

async function insertClickHouseFallback(
	event: LinkVisitEvent
): Promise<boolean> {
	if (!process.env.CLICKHOUSE_URL) {
		setAttributes({ clickhouse_fallback_configured: false });
		return false;
	}

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
): Promise<LinkVisitSendResult> {
	const eventKey = key ?? event.link_id;
	setAttributes({
		kafka_topic: TOPIC,
		kafka_message_key: eventKey ?? "unknown",
	});

	let kafkaSent = false;
	let kafkaSkipped = false;
	let kafkaAmbiguous = false;

	if ((await connect()) && producer) {
		try {
			await withTimeout(
				producer.send({
					topic: TOPIC,
					messages: [
						{
							value: JSON.stringify(event, (_k, v) =>
								v === undefined ? null : v
							),
							key: eventKey,
						},
					],
					compression: CompressionTypes.GZIP,
				}),
				sendTimeoutMs
			);
			kafkaSent = true;
			setAttributes({ kafka_send_success: true });
		} catch (error) {
			kafkaAmbiguous = true;
			captureError(error, {
				operation: "kafka_send",
				kafka_topic: TOPIC,
			});
			connected = false;
			nextReconnectAt = Date.now() + reconnectCooldownMs;
			setAttributes({
				kafka_send_success: false,
				kafka_send_ambiguous: true,
			});
		}
	} else {
		kafkaSkipped = true;
		setAttributes({ kafka_send_skipped: true });
	}

	const shouldFallback = !(kafkaSent || kafkaAmbiguous);
	const fallbackSuccess = shouldFallback
		? await insertClickHouseFallback(event)
		: false;

	return {
		clickhouse_fallback_success: fallbackSuccess,
		kafka_broker_configured: Boolean(broker),
		kafka_connected: connected,
		kafka_send_ambiguous: kafkaAmbiguous,
		kafka_send_skipped: kafkaSkipped,
		kafka_send_success: kafkaSent,
	};
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
