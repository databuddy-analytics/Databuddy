import { CompressionTypes, Kafka, type Producer } from "kafkajs";
import { Context, Data, Effect, Layer } from "effect";
import { captureError } from "./tracing";

const TOPIC = "analytics-uptime-checks";

class KafkaSendError extends Data.TaggedError("KafkaSendError")<{
	cause: unknown;
}> {}

const KafkaProducer = Context.Service<Producer>("KafkaProducer");

const connectProducer = (): Promise<Producer> => {
	const broker = process.env.REDPANDA_BROKER;
	if (!broker) return Promise.reject(new Error("REDPANDA_BROKER not set"));

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

	const producer = kafka.producer({
		maxInFlightRequests: 1,
		idempotent: true,
		transactionTimeout: 30_000,
	});

	return producer.connect().then(() => producer);
};

const KafkaProducerLive = Layer.effect(
	KafkaProducer,
	Effect.acquireRelease(
		Effect.tryPromise({
			try: connectProducer,
			catch: (cause) => {
				captureError(cause, { error_step: "kafka_producer_connect" });
				return cause as Error;
			},
		}),
		(producer) =>
			Effect.tryPromise({
				try: () => producer.disconnect(),
				catch: (cause) => cause,
			}).pipe(
				Effect.catch((cause) => {
					captureError(cause, {
						error_step: "kafka_producer_disconnect",
					});
					return Effect.void;
				}),
			),
	),
);

const sendEvent = (event: unknown, key?: string) =>
	Effect.gen(function* () {
		const producer = yield* KafkaProducer;
		yield* Effect.tryPromise({
			try: () =>
				producer.send({
					topic: TOPIC,
					messages: [
						{
							value: JSON.stringify(event, (_k, v) =>
								v === undefined ? null : v,
							),
							key,
						},
					],
					compression: CompressionTypes.GZIP,
				}),
			catch: (cause) => new KafkaSendError({ cause }),
		});
	});

export { KafkaProducer, KafkaProducerLive, KafkaSendError, sendEvent };

let singletonProducer: Producer | null = null;
let singletonConnected = false;

async function ensureProducer(): Promise<Producer | null> {
	if (singletonConnected && singletonProducer) return singletonProducer;

	if (!process.env.REDPANDA_BROKER) return null;

	try {
		singletonProducer = await connectProducer();
		singletonConnected = true;
		return singletonProducer;
	} catch (error) {
		captureError(error, { error_step: "kafka_producer_connect" });
		singletonConnected = false;
		return null;
	}
}

export async function sendUptimeEvent(
	event: unknown,
	key?: string,
): Promise<void> {
	const p = await ensureProducer();
	if (!p) return;

	try {
		await p.send({
			topic: TOPIC,
			messages: [
				{
					value: JSON.stringify(event, (_k, v) =>
						v === undefined ? null : v,
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
	if (!singletonProducer) return;
	try {
		await singletonProducer.disconnect();
	} catch (error) {
		captureError(error, { error_step: "kafka_producer_disconnect" });
	}
	singletonProducer = null;
	singletonConnected = false;
}
