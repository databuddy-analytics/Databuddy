import { CompressionTypes, Kafka, type Producer } from "kafkajs";
import { captureError, mergeWideEvent } from "./tracing";

class UptimeProducer {
	private producer: Producer | null = null;
	private connected = false;

	private async connect(): Promise<boolean> {
		if (this.connected && this.producer) {
			return true;
		}

		const broker = process.env.REDPANDA_BROKER;
		if (!broker) {
			return false;
		}

		try {
			const username = process.env.REDPANDA_USER;
			const password = process.env.REDPANDA_PASSWORD;
			const kafka = new Kafka({
				brokers: [broker],
				clientId: "uptime-producer",
				...(username &&
					password && {
						sasl: {
							mechanism: "scram-sha-256",
							username,
							password,
						},
						ssl: false,
					}),
			});

			this.producer = kafka.producer({
				maxInFlightRequests: 1,
				idempotent: true,
				transactionTimeout: 30_000,
			});

			await this.producer.connect();
			this.connected = true;
			return true;
		} catch (error) {
			captureError(error, { error_step: "kafka_producer_connect" });
			this.connected = false;
			return false;
		}
	}

	async send(topic: string, event: unknown, key?: string): Promise<void> {
		try {
			if (!((await this.connect()) && this.producer)) {
				mergeWideEvent({ uptime_kafka_skipped: true });
				return;
			}

			await this.producer.send({
				topic,
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
			mergeWideEvent({ uptime_kafka_sent: true });
		} catch (error) {
			captureError(error, { error_step: "kafka_producer_send" });
		}
	}

	async disconnect(): Promise<void> {
		if (this.producer) {
			try {
				await this.producer.disconnect();
			} catch (error) {
				captureError(error, { error_step: "kafka_producer_disconnect" });
			}
			this.producer = null;
			this.connected = false;
		}
	}
}

let producer: UptimeProducer | null = null;

export const sendUptimeEvent = (
	event: unknown,
	key?: string
): Promise<void> => {
	producer ??= new UptimeProducer();
	return producer.send("analytics-uptime-checks", event, key);
};

export async function disconnectProducer(): Promise<void> {
	if (producer) {
		await producer.disconnect();
	}
}
