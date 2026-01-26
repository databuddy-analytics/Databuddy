import { CompressionTypes, Kafka, type Producer } from "kafkajs";
import { captureError, record, setAttributes } from "./tracing";

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

class LinksProducer {
	private producer: Producer | null = null;
	private connected = false;
	private readonly config: ProducerConfig;

	constructor(config: ProducerConfig) {
		this.config = config;
	}

	private connect(): Promise<boolean> {
		if (this.connected && this.producer) {
			return Promise.resolve(true);
		}

		if (!this.config.broker) {
			setAttributes({ kafka_broker_configured: false });
			return Promise.resolve(false);
		}

		return record("links-kafka_connect", async () => {
			try {
				const kafka = new Kafka({
					brokers: [this.config.broker as string],
					clientId: "links-producer",
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

				setAttributes({ kafka_connected: true });
				return true;
			} catch (error) {
				captureError(error, { operation: "kafka_connect" });
				this.connected = false;
				setAttributes({ kafka_connected: false });
				return false;
			}
		});
	}

	send(topic: string, event: unknown, key?: string): Promise<void> {
		return record("links-kafka_send", async () => {
			const eventKey = key ?? (event as { link_id?: string }).link_id;

			setAttributes({
				kafka_topic: topic,
				kafka_message_key: eventKey ?? "unknown",
			});

			try {
				if (!((await this.connect()) && this.producer)) {
					setAttributes({ kafka_send_skipped: true });
					return;
				}

				await this.producer.send({
					topic,
					messages: [
						{
							value: stringifyEvent(event),
							key: eventKey,
						},
					],
					compression: CompressionTypes.GZIP,
				});

				setAttributes({ kafka_send_success: true });
			} catch (error) {
				captureError(error, { operation: "kafka_send", kafka_topic: topic });
				setAttributes({ kafka_send_success: false });
			}
		});
	}

	async disconnect(): Promise<void> {
		if (this.producer) {
			try {
				await this.producer.disconnect();
				setAttributes({ kafka_disconnected: true });
			} catch (error) {
				captureError(error, { operation: "kafka_disconnect" });
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

let defaultProducer: LinksProducer | null = null;

function getDefaultProducer(): LinksProducer {
	if (!defaultProducer) {
		defaultProducer = new LinksProducer(defaultConfig);
	}
	return defaultProducer;
}

export const sendLinkVisit = (event: unknown, key?: string): Promise<void> =>
	getDefaultProducer().send("analytics-link-visits", event, key);

export const disconnectProducer = async (): Promise<void> => {
	if (defaultProducer) {
		await defaultProducer.disconnect();
	}
};
