import { readFile } from "node:fs/promises";
import type { ClickHouseClient } from "@clickhouse/client";
import { Effect } from "effect";
import type { Admin, Producer } from "kafkajs";
import { beforeEach, describe, expect, type Mock, test, vi } from "vitest";
import type { ProducerConfig } from "./producer";

const { mockCaptureError, mockLogWarn } = vi.hoisted(() => ({
	mockCaptureError: vi.fn(),
	mockLogWarn: vi.fn(),
}));

vi.mock("evlog", async () => {
	const actual = await vi.importActual<typeof import("evlog")>("evlog");
	return { ...actual, log: { ...actual.log, warn: mockLogWarn } };
});

vi.mock("@databuddy/db/clickhouse", () => ({
	clickHouse: {},
	TABLE_NAMES: {
		ai_traffic_spans: "analytics.ai_traffic_spans",
		blocked_traffic: "analytics.blocked_traffic",
		custom_events: "analytics.custom_events",
		engagement_spans: "analytics.engagement_spans",
		error_spans: "analytics.error_spans",
		events: "analytics.events",
		link_visits: "analytics.link_visits",
		outgoing_links: "analytics.outgoing_links",
		web_vitals_spans: "analytics.web_vitals_spans",
	},
}));

vi.mock("@lib/tracing", () => ({
	captureError: mockCaptureError,
	record: (_name: string, fn: () => Promise<unknown>) => fn(),
}));

const { createEventProducer, TOPIC_MAP } = await import("./producer");

const topicMap = {
	"analytics-custom-events": "analytics.custom_events",
	"analytics-events": "analytics.events",
};

const baseConfig: ProducerConfig = {
	broker: undefined,
	chunkSize: 100,
	connectTimeout: 100,
	directFallbackTimeout: 1000,
	healthProbeTimeout: 100,
	kafkaTimeout: 1000,
	maxProducerRetries: 0,
	password: undefined,
	producerRetryDelay: 1,
	reconnectCooldown: 1,
	selfHost: true,
	shutdownDrainTimeout: 50,
	username: undefined,
};

const withKafka: Partial<ProducerConfig> = {
	broker: "redpanda.test:9092",
	reconnectCooldown: 60_000,
	selfHost: false,
};

const run = Effect.runPromise;

const event = (id: string) => ({
	client_id: "ws_1",
	event_id: id,
	timestamp: 1,
});

function deferred<T = void>() {
	let resolve: (value: T) => void = () => undefined;
	let reject: (error: Error) => void = () => undefined;
	const promise = new Promise<T>((res, rej) => {
		resolve = res;
		reject = rej;
	});
	return { promise, reject, resolve };
}

function fakeKafka(overrides: Partial<Record<"connect" | "send", Mock>> = {}) {
	return {
		connect: vi.fn(() => Promise.resolve()),
		disconnect: vi.fn(() => Promise.resolve()),
		send: vi.fn(() => Promise.resolve([] as unknown[])),
		...overrides,
	};
}

function fakeAdmin(
	overrides: Partial<
		Record<"describeCluster" | "disconnect" | "listTopics", Mock>
	> = {}
) {
	return {
		connect: vi.fn(() => Promise.resolve()),
		describeCluster: vi.fn(() =>
			Promise.resolve({ brokers: [{ nodeId: 1 }], clusterId: "test" })
		),
		disconnect: vi.fn(() => Promise.resolve()),
		listTopics: vi.fn(() => Promise.resolve(Object.keys(topicMap))),
		...overrides,
	};
}

function createProducer({
	config = {},
	insert = vi.fn(() => Promise.resolve()),
	kafka,
	kafkaAdmin,
}: {
	config?: Partial<ProducerConfig>;
	insert?: Mock;
	kafka?: ReturnType<typeof fakeKafka>;
	kafkaAdmin?: ReturnType<typeof fakeAdmin>;
} = {}) {
	return createEventProducer({
		clickHouse: { insert } as unknown as ClickHouseClient,
		config: { ...baseConfig, ...config },
		kafka: kafka as unknown as Producer | undefined,
		kafkaAdmin: kafkaAdmin as unknown as Admin | undefined,
		topicMap,
	});
}

const insertedToken = (insert: Mock, call: number) =>
	(
		insert.mock.calls[call]?.[0] as {
			clickhouse_settings?: { insert_deduplication_token?: string };
		}
	).clickhouse_settings?.insert_deduplication_token;

beforeEach(() => {
	mockCaptureError.mockClear();
	mockLogWarn.mockClear();
});

describe("direct ClickHouse delivery", () => {
	test("acknowledges only after the insert succeeds, even with a broker configured for self-hosting", async () => {
		const insertDone = deferred();
		const insert = vi.fn(() => insertDone.promise);
		const kafka = fakeKafka();
		const producer = createProducer({
			config: { broker: "redpanda.test:9092" },
			insert,
			kafka,
		});

		let acknowledged = false;
		const delivery = run(
			producer.sendOne("analytics-events", event("e1"))
		).then(() => {
			acknowledged = true;
		});
		await vi.waitFor(() => expect(insert).toHaveBeenCalledOnce());
		expect(acknowledged).toBe(false);
		insertDone.resolve();
		await delivery;

		expect(insert).toHaveBeenCalledWith(
			expect.objectContaining({
				clickhouse_settings: {
					async_insert: 1,
					wait_for_async_insert: 1,
					async_insert_busy_timeout_ms: 50,
					insert_deduplication_token: expect.stringMatching(/^[\da-f]{64}$/),
				},
				format: "JSONEachRow",
				query_id: expect.stringMatching(/^basket-[\da-f]{64}$/),
				table: "analytics.events",
				values: [event("e1")],
			})
		);
		expect(kafka.connect).not.toHaveBeenCalled();
		expect(await run(producer.stats)).toMatchObject({
			inFlight: 0,
			kafkaEnabled: false,
			sent: 1,
		});
	});

	test("gives a retried event the same deduplication token by event id or delivery id", async () => {
		const insert = vi.fn(() => Promise.resolve());
		const producer = createProducer({ insert });
		const span = { client_id: "ws_1", delivery_id: "d1", timestamp: 1 };

		await run(producer.sendOne("analytics-events", event("e1")));
		await run(
			producer.sendOne("analytics-events", { ...event("e1"), timestamp: 2 })
		);
		await run(producer.sendMany("analytics-events", [span], ["d1"]));
		await run(
			producer.sendMany("analytics-events", [{ ...span, timestamp: 2 }], ["d1"])
		);

		expect(insertedToken(insert, 0)).toBeTruthy();
		expect(insertedToken(insert, 1)).toBe(insertedToken(insert, 0));
		expect(insertedToken(insert, 3)).toBe(insertedToken(insert, 2));
		expect(insert).toHaveBeenNthCalledWith(
			3,
			expect.objectContaining({ values: [span] })
		);
	});

	test("strips delivery ids from custom-event rows without mutating the event", async () => {
		const insert = vi.fn(() => Promise.resolve());
		const producer = createProducer({ insert });
		const customEvent = {
			delivery_id: "d1",
			event_name: "checkout_completed",
			owner_id: "org_1",
			timestamp: 1,
		};

		await run(
			producer.sendMany("analytics-custom-events", [customEvent], ["d1"])
		);
		await run(
			producer.sendMany(
				"analytics-custom-events",
				[{ ...customEvent, timestamp: 2 }],
				["d1"]
			)
		);

		expect(insert).toHaveBeenCalledWith(
			expect.objectContaining({
				table: "analytics.custom_events",
				values: [
					{ event_name: "checkout_completed", owner_id: "org_1", timestamp: 1 },
				],
			})
		);
		expect(customEvent).toHaveProperty("delivery_id", "d1");
		expect(insertedToken(insert, 1)).toBe(insertedToken(insert, 0));
	});

	test("rejects with a retryable error when the insert fails or exceeds its deadline", async () => {
		const failing = createProducer({
			insert: vi.fn(() => Promise.reject(new Error("offline"))),
		});
		await expect(
			run(failing.sendOne("analytics-events", event("e1")))
		).rejects.toMatchObject({
			_tag: "ClickHouseFallbackError",
			retryable: true,
			table: "analytics.events",
			topic: "analytics-events",
		});
		expect(await run(failing.stats)).toMatchObject({
			errors: 1,
			inFlight: 0,
			sent: 0,
		});

		const stalledInsert = vi.fn(() => new Promise<void>(() => undefined));
		const stalled = createProducer({
			config: { directFallbackTimeout: 20 },
			insert: stalledInsert,
		});
		await expect(
			run(stalled.sendOne("analytics-events", event("e2")))
		).rejects.toMatchObject({
			_tag: "ClickHouseFallbackError",
			retryable: true,
		});
		expect(
			(stalledInsert.mock.calls[0]?.[0] as { abort_signal?: AbortSignal })
				.abort_signal?.aborted
		).toBe(true);
	});

	test("rejects an unmapped topic as non-retryable", async () => {
		const producer = createProducer();

		await expect(
			run(producer.sendOne("analytics-unmapped", event("e1")))
		).rejects.toMatchObject({
			_tag: "UnknownKafkaTopicError",
			retryable: false,
			topic: "analytics-unmapped",
		});
		expect(mockCaptureError).toHaveBeenCalledWith(
			expect.objectContaining({ message: "Unknown Kafka topic" }),
			{ topic: "analytics-unmapped" }
		);
	});
});

describe("Kafka delivery", () => {
	test("keys custom events by delivery id and other events by their payload", async () => {
		const insert = vi.fn(() => Promise.resolve());
		const kafka = fakeKafka();
		const producer = createProducer({ config: withKafka, insert, kafka });
		const customEvent = { event_name: "checkout_completed", owner_id: "org_1" };

		await run(
			producer.sendMany("analytics-custom-events", [customEvent], ["d1"])
		);
		await run(producer.sendMany("analytics-events", [event("e1")], ["d2"]));

		expect(kafka.send).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				messages: [{ key: "d1", value: JSON.stringify(customEvent) }],
				topic: "analytics-custom-events",
			})
		);
		expect(kafka.send).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				messages: [{ key: "ws_1", value: JSON.stringify(event("e1")) }],
				topic: "analytics-events",
			})
		);
		expect(insert).not.toHaveBeenCalled();
	});

	test("shares one connection attempt across concurrent sends", async () => {
		const connection = deferred();
		const insert = vi.fn(() => Promise.resolve());
		const kafka = fakeKafka({ connect: vi.fn(() => connection.promise) });
		const producer = createProducer({ config: withKafka, insert, kafka });

		const deliveries = Array.from({ length: 50 }, (_, i) =>
			run(producer.sendOne("analytics-events", event(`e${i}`)))
		);
		await vi.waitFor(() => expect(kafka.connect).toHaveBeenCalledOnce());
		connection.resolve();
		await Promise.all(deliveries);

		expect(kafka.connect).toHaveBeenCalledOnce();
		expect(kafka.send).toHaveBeenCalledTimes(50);
		expect(insert).not.toHaveBeenCalled();
		expect(await run(producer.stats)).toMatchObject({
			connected: true,
			connecting: false,
			inFlight: 0,
			sent: 50,
		});
	});

	test("falls back to ClickHouse during the reconnect cooldown after a failed connection", async () => {
		const connection = deferred();
		const insert = vi.fn(() => Promise.resolve());
		const kafka = fakeKafka({ connect: vi.fn(() => connection.promise) });
		const producer = createProducer({ config: withKafka, insert, kafka });

		const deliveries = Array.from({ length: 50 }, (_, i) =>
			run(producer.sendOne("analytics-events", event(`e${i}`)))
		);
		await vi.waitFor(() => expect(kafka.connect).toHaveBeenCalledOnce());
		connection.reject(new Error("broker unavailable"));
		await Promise.all(deliveries);
		await run(producer.sendOne("analytics-events", event("during_cooldown")));

		expect(kafka.connect).toHaveBeenCalledOnce();
		expect(insert).toHaveBeenCalledTimes(51);
		expect(mockLogWarn).toHaveBeenCalledOnce();
		expect(await run(producer.stats)).toMatchObject({
			connected: false,
			errors: 1,
			failed: true,
			inFlight: 0,
			sent: 51,
		});
	});

	test("pins retries of an ambiguous send to Kafka while unrelated events fall back", async () => {
		const insert = vi.fn(() => Promise.resolve());
		const kafka = fakeKafka({
			send: vi.fn(() => Promise.reject(new Error("request timed out"))),
		});
		const producer = createProducer({ config: withKafka, insert, kafka });

		await expect(
			run(producer.sendOne("analytics-events", event("e1")))
		).rejects.toMatchObject({
			_tag: "KafkaSendError",
			topic: "analytics-events",
		});
		await expect(
			run(
				producer.sendOne("analytics-events", event("e1"), undefined, {
					allowDirectFallback: false,
				})
			)
		).rejects.toMatchObject({
			_tag: "ProducerUnavailableError",
			retryable: true,
		});
		expect(insert).not.toHaveBeenCalled();

		await run(producer.sendOne("analytics-events", event("unrelated")));
		expect(insert).toHaveBeenCalledOnce();
		expect(await run(producer.stats)).toMatchObject({
			connected: false,
			errors: 1,
			failed: true,
			failedCount: 1,
			inFlight: 0,
			sent: 1,
		});
	});

	test("delivers a broker-rejected topic directly without dropping the connection", async () => {
		const insert = vi.fn(() => Promise.resolve());
		const topicRejection = new Error("Not authorized to access topics", {
			cause: Object.assign(new Error("Topic authorization failed"), {
				retriable: false,
				type: "TOPIC_AUTHORIZATION_FAILED",
			}),
		});
		const kafka = fakeKafka({
			send: vi.fn().mockRejectedValueOnce(topicRejection).mockResolvedValue([]),
		});
		const producer = createProducer({ config: withKafka, insert, kafka });

		await run(producer.sendOne("analytics-events", event("rejected")));
		await run(producer.sendOne("analytics-events", event("next")));

		expect(insert).toHaveBeenCalledOnce();
		expect(kafka.send).toHaveBeenCalledTimes(2);
		expect(await run(producer.stats)).toMatchObject({
			connected: true,
			errors: 1,
			failed: false,
			failedCount: 0,
			sent: 2,
		});
	});

	test("counts a send acknowledged after its deadline as in flight until it settles", async () => {
		const acknowledgement = deferred<unknown[]>();
		const kafka = fakeKafka({ send: vi.fn(() => acknowledgement.promise) });
		const producer = createProducer({
			config: { ...withKafka, connectTimeout: 20, kafkaTimeout: 20 },
			kafka,
		});

		await expect(
			run(producer.sendOne("analytics-events", event("e1")))
		).rejects.toMatchObject({
			_tag: "KafkaSendError",
			cause: expect.objectContaining({
				message: "Redpanda send acknowledgement exceeded 20ms",
			}),
		});
		expect((await run(producer.stats)).inFlight).toBe(1);

		acknowledgement.resolve([]);
		await vi.waitFor(async () =>
			expect((await run(producer.stats)).inFlight).toBe(0)
		);
	});

	test("disconnects a connection that completes after its deadline", async () => {
		const connection = deferred();
		const kafka = fakeKafka({ connect: vi.fn(() => connection.promise) });
		const kafkaAdmin = fakeAdmin();
		const producer = createProducer({
			config: { ...withKafka, connectTimeout: 20 },
			kafka,
			kafkaAdmin,
		});

		await expect(run(producer.checkConnection)).rejects.toMatchObject({
			_tag: "ProducerUnavailableError",
		});
		expect(await run(producer.stats)).toMatchObject({
			connecting: false,
			inFlight: 0,
		});

		connection.resolve();
		await vi.waitFor(() => expect(kafka.disconnect).toHaveBeenCalledOnce());
		expect(kafkaAdmin.connect).not.toHaveBeenCalled();
	});
});

describe("health check", () => {
	test("probes live broker metadata on every check", async () => {
		const kafka = fakeKafka();
		const kafkaAdmin = fakeAdmin({
			describeCluster: vi
				.fn()
				.mockResolvedValueOnce({ brokers: [{ nodeId: 1 }], clusterId: "test" })
				.mockRejectedValueOnce(new Error("metadata unavailable")),
		});
		const producer = createProducer({ config: withKafka, kafka, kafkaAdmin });

		await run(producer.checkConnection);
		await expect(run(producer.checkConnection)).rejects.toMatchObject({
			_tag: "ProducerUnavailableError",
			cause: expect.objectContaining({ message: "metadata unavailable" }),
		});

		expect(kafka.connect).toHaveBeenCalledOnce();
		expect(kafkaAdmin.describeCluster).toHaveBeenCalledTimes(2);
		expect(kafkaAdmin.disconnect).toHaveBeenCalledOnce();
	});

	test("names the topics missing from Redpanda", async () => {
		const producer = createProducer({
			config: withKafka,
			kafka: fakeKafka(),
			kafkaAdmin: fakeAdmin({
				listTopics: vi.fn(() => Promise.resolve(["analytics-events"])),
			}),
		});

		await expect(run(producer.checkConnection)).rejects.toMatchObject({
			cause: expect.objectContaining({
				message: "Redpanda is missing topics: analytics-custom-events",
			}),
		});
	});

	test("fails without probing metadata when the producer cannot connect", async () => {
		const kafkaAdmin = fakeAdmin();
		const producer = createProducer({
			config: withKafka,
			kafka: fakeKafka({
				connect: vi.fn(() => Promise.reject(new Error("broker unavailable"))),
			}),
			kafkaAdmin,
		});

		await expect(run(producer.checkConnection)).rejects.toMatchObject({
			_tag: "ProducerUnavailableError",
			cause: expect.objectContaining({
				message: "Redpanda producer is not connected",
			}),
		});
		expect(kafkaAdmin.connect).not.toHaveBeenCalled();
	});

	test("bounds a stalled metadata probe", async () => {
		const metadata = deferred<never>();
		const kafkaAdmin = fakeAdmin({
			describeCluster: vi.fn(() => metadata.promise),
			disconnect: vi.fn(() => {
				metadata.reject(new Error("metadata connection closed"));
				return Promise.resolve();
			}),
		});
		const producer = createProducer({
			config: { ...withKafka, healthProbeTimeout: 20 },
			kafka: fakeKafka(),
			kafkaAdmin,
		});

		const startedAt = performance.now();
		await expect(run(producer.checkConnection)).rejects.toMatchObject({
			cause: expect.objectContaining({
				message: "Redpanda health probe exceeded 20ms",
			}),
		});
		expect(performance.now() - startedAt).toBeLessThan(500);
		await vi.waitFor(() =>
			expect(kafkaAdmin.disconnect).toHaveBeenCalledOnce()
		);
		expect((await run(producer.stats)).inFlight).toBe(0);
	});
});

describe("shutdown", () => {
	test("rejects new sends while waiting for in-flight deliveries", async () => {
		const insertDone = deferred();
		const insert = vi.fn(() => insertDone.promise);
		const producer = createProducer({
			config: { shutdownDrainTimeout: 500 },
			insert,
		});

		const inFlight = run(producer.sendOne("analytics-events", event("e1")));
		await vi.waitFor(() => expect(insert).toHaveBeenCalledOnce());
		const shutdown = run(producer.shutDown);

		await expect(
			run(producer.sendOne("analytics-events", event("e2")))
		).rejects.toMatchObject({
			_tag: "ProducerShuttingDownError",
			retryable: true,
		});
		expect((await run(producer.stats)).inFlight).toBe(1);

		insertDone.resolve();
		await inFlight;
		await shutdown;
	});

	test("reports undelivered events when the drain deadline passes", async () => {
		const insertDone = deferred();
		const insert = vi.fn(() => insertDone.promise);
		const producer = createProducer({
			config: { shutdownDrainTimeout: 20 },
			insert,
		});

		const inFlight = run(producer.sendOne("analytics-events", event("e1")));
		await vi.waitFor(() => expect(insert).toHaveBeenCalledOnce());
		await expect(run(producer.shutDown)).rejects.toMatchObject({
			_tag: "ShutdownDrainError",
			inFlight: 1,
			retryable: true,
		});

		insertDone.resolve();
		await inFlight;
	});

	test("bounds a stalled admin disconnect", async () => {
		const kafka = fakeKafka();
		const kafkaAdmin = fakeAdmin({
			disconnect: vi.fn(() => new Promise<void>(() => undefined)),
		});
		const producer = createProducer({
			config: { ...withKafka, shutdownDrainTimeout: 20 },
			kafka,
			kafkaAdmin,
		});
		await run(producer.checkConnection);

		await expect(run(producer.shutDown)).rejects.toMatchObject({
			_tag: "ShutdownDrainError",
			deadlineMs: 20,
			phase: "disconnect",
		});
		expect(kafka.disconnect).toHaveBeenCalledOnce();
		expect(kafkaAdmin.disconnect).toHaveBeenCalledOnce();
	});

	test("does not publish a connection that completes after shutdown starts", async () => {
		const connection = deferred();
		const kafka = fakeKafka({ connect: vi.fn(() => connection.promise) });
		const kafkaAdmin = fakeAdmin();
		const producer = createProducer({
			config: { ...withKafka, shutdownDrainTimeout: 500 },
			kafka,
			kafkaAdmin,
		});

		const firstCheck = expect(
			run(producer.checkConnection)
		).rejects.toMatchObject({ _tag: "ProducerUnavailableError" });
		await vi.waitFor(() => expect(kafka.connect).toHaveBeenCalledOnce());
		const shutdown = run(producer.shutDown);
		await new Promise((resolve) => setTimeout(resolve, 0));
		await expect(run(producer.checkConnection)).rejects.toMatchObject({
			_tag: "ProducerUnavailableError",
		});
		connection.resolve();
		await firstCheck;
		await shutdown;

		expect(kafka.connect).toHaveBeenCalledOnce();
		expect(kafka.disconnect).toHaveBeenCalledOnce();
		expect(kafkaAdmin.connect).not.toHaveBeenCalled();
		expect(await run(producer.stats)).toMatchObject({
			connected: false,
			connecting: false,
			inFlight: 0,
		});
	});

	test("waits for an active health probe before disconnecting", async () => {
		const metadata = deferred<{
			brokers: Array<{ nodeId: number }>;
			clusterId: string;
		}>();
		const kafka = fakeKafka();
		const kafkaAdmin = fakeAdmin({
			describeCluster: vi.fn(() => metadata.promise),
		});
		const producer = createProducer({
			config: {
				...withKafka,
				healthProbeTimeout: 500,
				shutdownDrainTimeout: 500,
			},
			kafka,
			kafkaAdmin,
		});

		const check = expect(run(producer.checkConnection)).rejects.toMatchObject({
			_tag: "ProducerUnavailableError",
		});
		await vi.waitFor(() =>
			expect(kafkaAdmin.describeCluster).toHaveBeenCalledOnce()
		);
		let shutdownSettled = false;
		const shutdown = run(producer.shutDown).finally(() => {
			shutdownSettled = true;
		});
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(shutdownSettled).toBe(false);

		metadata.resolve({ brokers: [{ nodeId: 1 }], clusterId: "test" });
		await check;
		await shutdown;

		expect(kafkaAdmin.disconnect).toHaveBeenCalledOnce();
		expect(kafka.disconnect).toHaveBeenCalledOnce();
		expect(await run(producer.stats)).toMatchObject({
			connected: false,
			connecting: false,
			inFlight: 0,
		});
	});
});

test("every produced topic is consumed and routed by Vector", async () => {
	const vectorConfig = await readFile(
		new URL("../../../../infra/ingest/vector.yaml", import.meta.url),
		"utf8"
	);
	for (const topic of Object.keys(TOPIC_MAP)) {
		expect(vectorConfig).toContain(`- ${topic}\n`);
		expect(vectorConfig).toContain(`.topic == "${topic}"`);
	}
});
