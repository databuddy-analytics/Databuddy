import { clickHouse, TABLE_NAMES } from "@databuddy/db/clickhouse";
import { CompressionTypes, Kafka, type Producer } from "kafkajs";
import { captureError, setAttributes } from "./logging";

const TOPIC = "analytics-link-visits";
const broker = process.env.REDPANDA_BROKER;
const username = process.env.REDPANDA_USER;
const password = process.env.REDPANDA_PASSWORD;
const reconnectCooldownMs = 60_000;
const kafkaConnectionTimeoutMs = 5000;
const kafkaRequestTimeoutMs = 10_000;
const fallbackTimeoutMs = 10_000;
const dependencyErrorLogIntervalMs = 300_000;

let producer: Producer | null = null;
let connectPromise: Promise<boolean> | null = null;
let nextReconnectAt = 0;
let lastConnectErrorLogAt = 0;
let lastFallbackErrorLogAt = 0;
let shuttingDown = false;

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

function captureDependencyError(
	error: unknown,
	context: Record<string, string | number | boolean>,
	kind: "connect" | "fallback"
): void {
	const now = Date.now();
	const lastLogAt =
		kind === "connect" ? lastConnectErrorLogAt : lastFallbackErrorLogAt;
	if (now - lastLogAt < dependencyErrorLogIntervalMs) {
		setAttributes({ [`${kind}_error_log_suppressed`]: true });
		return;
	}
	if (kind === "connect") {
		lastConnectErrorLogAt = now;
	} else {
		lastFallbackErrorLogAt = now;
	}
	captureError(error, context);
}

function connect(reportFailure = true): Promise<boolean> {
	if (shuttingDown) {
		return Promise.resolve(false);
	}
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
				connectionTimeout: kafkaConnectionTimeoutMs,
				authenticationTimeout: kafkaConnectionTimeoutMs,
				requestTimeout: kafkaRequestTimeoutMs,
				enforceRequestTimeout: true,
				retry: {
					initialRetryTime: 300,
					maxRetryTime: 1000,
					retries: 0,
				},
				...(username && password
					? { sasl: { mechanism: "scram-sha-256", username, password } }
					: {}),
				...(process.env.REDPANDA_SSL === "true" ? { ssl: true } : {}),
			});

			candidate = kafka.producer({
				maxInFlightRequests: 5,
				idempotent: true,
				transactionTimeout: 30_000,
				retry: {
					initialRetryTime: 300,
					maxRetryTime: 3000,
					retries: 1,
				},
			});

			await candidate.connect();
			if (shuttingDown) {
				await candidate.disconnect();
				return false;
			}
			producer = candidate;
			nextReconnectAt = 0;
			setAttributes({ kafka_connected: true });
			return true;
		} catch (error) {
			if (reportFailure) {
				captureDependencyError(
					error,
					{ operation: "kafka_connect" },
					"connect"
				);
			} else {
				setAttributes({ kafka_health_connect_failed: true });
			}
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

export type ProducerHealthState =
	| "connected"
	| "connecting"
	| "cooldown"
	| "disabled"
	| "idle";

export function getProducerHealthState(): ProducerHealthState {
	if (!broker) {
		return "disabled";
	}
	if (producer) {
		return "connected";
	}
	if (connectPromise) {
		return "connecting";
	}
	if (Date.now() < nextReconnectAt) {
		return "cooldown";
	}
	return "idle";
}

export async function warmProducerConnection(): Promise<void> {
	await connect();
}

export async function refreshProducerConnection(): Promise<void> {
	await connect(false);
}

export interface LinkVisitDeliveryOptions {
	allowDirectFallback?: boolean;
	beforeKafkaSend?: () => Promise<void>;
}

async function persistLinkVisitDirectly(
	event: LinkVisitEvent
): Promise<boolean> {
	const controller = new AbortController();
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			clickHouse.insert({
				table: TABLE_NAMES.link_visits,
				values: [event],
				format: "JSONEachRow",
				abort_signal: controller.signal,
				clickhouse_settings: {
					async_insert: 1,
					wait_for_async_insert: 1,
				},
			}),
			new Promise<never>((_resolve, reject) => {
				timeout = setTimeout(() => {
					const error = new Error(
						`ClickHouse link-visit fallback exceeded ${fallbackTimeoutMs}ms`
					);
					controller.abort(error);
					reject(error);
				}, fallbackTimeoutMs);
				timeout.unref?.();
			}),
		]);
		setAttributes({ clickhouse_fallback_success: true });
		return true;
	} catch (error) {
		captureDependencyError(
			error,
			{
				operation: "clickhouse_link_visit_fallback",
				clickhouse_table: TABLE_NAMES.link_visits,
			},
			"fallback"
		);
		setAttributes({ clickhouse_fallback_success: false });
		return false;
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
	}
}

export async function sendLinkVisit(
	event: LinkVisitEvent,
	key?: string,
	options: LinkVisitDeliveryOptions = {}
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
		if (options.allowDirectFallback === false) {
			setAttributes({ clickhouse_fallback_blocked_by_ambiguous_send: true });
			return false;
		}
		// No Kafka write was attempted, so direct persistence is not ambiguous.
		// The BullMQ job remains active until this insert is acknowledged.
		return persistLinkVisitDirectly(event);
	}

	setAttributes({ kafka_connected: true });
	if (options.beforeKafkaSend) {
		// Persist the BullMQ job's per-event ambiguity marker before Kafka sees
		// the record. A Redis failure here means no Kafka send was attempted.
		await options.beforeKafkaSend();
	}
	try {
		await activeProducer.send({
			topic: TOPIC,
			acks: -1,
			timeout: kafkaRequestTimeoutMs,
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
	shuttingDown = true;
	if (connectPromise) {
		await connectPromise;
	}
	const activeProducer = producer;
	producer = null;
	if (!activeProducer) {
		return;
	}
	await activeProducer.disconnect();
}
