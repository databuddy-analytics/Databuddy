import { CompressionTypes, Kafka, type Producer } from "kafkajs";
import { captureError, mergeWideEvent } from "./tracing";

function stringifyEvent(event: unknown): string {
	return JSON.stringify(event, (_key, value) =>
		value === undefined ? null : value
	);
}

interface ProducerConfig {
	broker?: string;
	username?: string;
	password?: string;
}

class UptimeProducer {
	private producer: Producer | null = null;
	private connected = false;
	private readonly config: ProducerConfig;

	constructor(config: ProducerConfig) {
		this.config = config;
	}

	private async connect(): Promise<boolean> {
		if (this.connected && this.producer) {
			return true;
		}

		if (!this.config.broker) {
			return false;
		}

		try {
			const kafka = new Kafka({
				brokers: [this.config.broker],
				clientId: "uptime-producer",
				...(this.config.username &&
					this.config.password && {
						sasl: {
							mechanism: "scram-sha-256",
							username: this.config.username,
							password: this.config.password,
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
						value: stringifyEvent(event),
						key: key || (event as { site_id?: string }).site_id,
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

const defaultConfig: ProducerConfig = {
	broker: process.env.REDPANDA_BROKER,
	username: process.env.REDPANDA_USER,
	password: process.env.REDPANDA_PASSWORD,
};

let defaultProducer: UptimeProducer | null = null;

function getDefaultProducer(): UptimeProducer {
	if (!defaultProducer) {
		defaultProducer = new UptimeProducer(defaultConfig);
	}
	return defaultProducer;
}

export const sendUptimeEvent = (event: unknown, key?: string): Promise<void> =>
	getDefaultProducer().send("analytics-uptime-checks", event, key);

// Graceful shutdown
process.on("SIGTERM", async () => {
	if (defaultProducer) {
		await defaultProducer.disconnect();
	}
});

process.on("SIGINT", async () => {
	if (defaultProducer) {
		await defaultProducer.disconnect();
	}
});
