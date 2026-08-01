import type { ClickHouseClient } from "@clickhouse/client";
import { Effect } from "effect";
import type { Admin, Producer } from "kafkajs";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { ProducerConfig } from "./producer";

const { mockCaptureError } = vi.hoisted(() => ({
	mockCaptureError: vi.fn(),
}));

vi.mock("@databuddy/db/clickhouse", () => ({
	clickHouse: {},
	TABLE_NAMES: {
		ai_traffic_spans: "analytics.ai_traffic_spans",
		blocked_traffic: "analytics.blocked_traffic",
		custom_events: "analytics.custom_events",
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

const { createProducerEffects } = await import("./producer");

const topicMap = { "analytics-events": "analytics.events" };

const baseConfig: ProducerConfig = {
	broker: undefined,
	chunkSize: 100,
	connectTimeout: 100,
	directFallbackTimeout: 1_000,
	healthProbeTimeout: 100,
	kafkaTimeout: 1_000,
	maxProducerRetries: 0,
	password: undefined,
	producerRetryDelay: 1,
	reconnectCooldown: 1,
	selfHost: true,
	shutdownDrainTimeout: 50,
	username: undefined,
};

const event = (id: string) => ({
	client_id: "ws_1",
	event_id: id,
	timestamp: 1,
});

async function makeEffects(
	insert: (input: unknown) => Promise<unknown>,
	config: Partial<ProducerConfig> = {},
	kafka: Producer | null = null,
	kafkaAdmin: Admin | null = null
) {
	return Effect.runPromise(
		createProducerEffects(
			{ ...baseConfig, ...config },
			kafka,
			{ insert } as unknown as ClickHouseClient,
			topicMap,
			kafkaAdmin
		)
	);
}

describe("producer delivery guarantees", () => {
	beforeEach(() => {
		mockCaptureError.mockClear();
	});

	test("resolves a core send only after direct ClickHouse fallback succeeds", async () => {
		const insert = vi.fn(() => Promise.resolve());
		const effects = await makeEffects(insert);

		await Effect.runPromise(effects.sendOne("analytics-events", event("event_1")));

		expect(insert).toHaveBeenCalledWith(
			expect.objectContaining({
				clickhouse_settings: {
					insert_deduplication_token: expect.stringMatching(/^[\da-f]{64}$/),
				},
				format: "JSONEachRow",
				query_id: expect.stringMatching(/^basket-[\da-f]{64}$/),
				table: "analytics.events",
				values: [event("event_1")],
			})
		);
		const stats = await Effect.runPromise(effects.stats);
		expect(stats).toMatchObject({ inFlight: 0, sent: 1 });
	});

	test("keeps the ClickHouse deduplication token stable across an event retry", async () => {
		const insert = vi.fn(() => Promise.resolve());
		const effects = await makeEffects(insert);

		await Effect.runPromise(effects.sendOne("analytics-events", event("event_1")));
		await Effect.runPromise(
			effects.sendOne("analytics-events", {
				...event("event_1"),
				timestamp: 2,
			})
		);

		const tokenAt = (call: number) =>
			(
				insert.mock.calls[call]?.[0] as {
					clickhouse_settings?: { insert_deduplication_token?: string };
				}
			).clickhouse_settings?.insert_deduplication_token;
		expect(tokenAt(0)).toBeTruthy();
		expect(tokenAt(1)).toBe(tokenAt(0));
	});

	test("uses side-channel identities for id-less ClickHouse retries", async () => {
		const insert = vi.fn(() => Promise.resolve());
		const effects = await makeEffects(insert);
		const firstSpan = {
			client_id: "ws_1",
			delivery_id: "stable-delivery-id",
			timestamp: 1,
		};
		const retriedSpan = { ...firstSpan, timestamp: 2 };

		await Effect.runPromise(
			effects.sendMany(
				"analytics-events",
				[firstSpan],
				["stable-delivery-id"]
			)
		);
		await Effect.runPromise(
			effects.sendMany(
				"analytics-events",
				[retriedSpan],
				["stable-delivery-id"]
			)
		);

		const tokenAt = (call: number) =>
			(
				insert.mock.calls[call]?.[0] as {
					clickhouse_settings?: { insert_deduplication_token?: string };
				}
			).clickhouse_settings?.insert_deduplication_token;
		expect(tokenAt(0)).toBeTruthy();
		expect(tokenAt(1)).toBe(tokenAt(0));
		expect(insert).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({ values: [firstSpan] })
		);
		expect(insert).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({ values: [retriedSpan] })
		);
	});

	test("partitions span retries by their persisted delivery identity", async () => {
		const insert = vi.fn(() => Promise.resolve());
		const kafka = {
			connect: vi.fn(() => Promise.resolve()),
			disconnect: vi.fn(() => Promise.resolve()),
			send: vi.fn(() => Promise.resolve([])),
		} as unknown as Producer;
		const effects = await makeEffects(
			insert,
			{
				broker: "redpanda.test:9092",
				selfHost: false,
			},
			kafka
		);
		const span = {
			client_id: "ws_1",
			delivery_id: "stable-delivery-id",
			timestamp: 1,
		};

		await Effect.runPromise(
			effects.sendMany("analytics-events", [span], ["stable-delivery-id"])
		);

		expect(kafka.send).toHaveBeenCalledWith(
			expect.objectContaining({
				messages: [
					{
						key: "stable-delivery-id",
						value: JSON.stringify(span),
					},
				],
				topic: "analytics-events",
			})
		);
		expect(insert).not.toHaveBeenCalled();
	});

	test("returns a retryable error instead of acknowledging a failed direct fallback", async () => {
		const effects = await makeEffects(() => Promise.reject(new Error("offline")));

		await expect(
			Effect.runPromise(effects.sendOne("analytics-events", event("event_1")))
		).rejects.toMatchObject({
			_tag: "ClickHouseFallbackError",
			retryable: true,
			table: "analytics.events",
			topic: "analytics-events",
		});

		const stats = await Effect.runPromise(effects.stats);
		expect(stats).toMatchObject({ errors: 1, inFlight: 0, sent: 0 });
	});

	test("bounds direct fallback admission and aborts the ClickHouse request", async () => {
		const insert = vi.fn(() => new Promise<void>(() => undefined));
		const effects = await makeEffects(insert, {
			directFallbackTimeout: 20,
		});

		await expect(
			Effect.runPromise(effects.sendOne("analytics-events", event("event_1")))
		).rejects.toMatchObject({
			_tag: "ClickHouseFallbackError",
			retryable: true,
		});

		expect(insert).toHaveBeenCalledOnce();
		expect(
			(insert.mock.calls[0]?.[0] as { abort_signal?: AbortSignal })
				.abort_signal?.aborted
		).toBe(true);
	});

	test("keeps an active direct delivery counted when shutdown rejects another send", async () => {
		let releaseInsert: (() => void) | undefined;
		const effects = await makeEffects(
			() =>
				new Promise<void>((resolve) => {
					releaseInsert = resolve;
				}),
			{ shutdownDrainTimeout: 500 }
		);

		const activeDelivery = Effect.runPromise(
			effects.sendOne("analytics-events", event("event_1"))
		);
		await vi.waitFor(() => expect(releaseInsert).toBeTypeOf("function"));

		const shutdown = Effect.runPromise(effects.shutDown);
		await expect(
			Effect.runPromise(effects.sendOne("analytics-events", event("event_2")))
		).rejects.toMatchObject({
			_tag: "ProducerShuttingDownError",
			retryable: true,
		});

		const stats = await Effect.runPromise(effects.stats);
		expect(stats.inFlight).toBe(1);

		releaseInsert?.();
		await activeDelivery;
		await shutdown;
	});

	test("reports an in-flight direct delivery when shutdown reaches its deadline", async () => {
		let releaseInsert: (() => void) | undefined;
		const effects = await makeEffects(
			() =>
				new Promise<void>((resolve) => {
					releaseInsert = resolve;
				}),
			{ shutdownDrainTimeout: 20 }
		);

		const activeDelivery = Effect.runPromise(
			effects.sendOne("analytics-events", event("event_1"))
		);
		await vi.waitFor(() => expect(releaseInsert).toBeTypeOf("function"));
		await expect(Effect.runPromise(effects.shutDown)).rejects.toMatchObject({
			_tag: "ShutdownDrainError",
			inFlight: 1,
			retryable: true,
		});

		releaseInsert?.();
		await activeDelivery;
	});

	test("shares one successful connection across all concurrent callers", async () => {
		let releaseConnect: (() => void) | undefined;
		const insert = vi.fn(() => Promise.resolve());
		const kafka = {
			connect: vi.fn(
				() =>
					new Promise<void>((resolve) => {
						releaseConnect = resolve;
					})
			),
			disconnect: vi.fn(() => Promise.resolve()),
			send: vi.fn(() => Promise.resolve([])),
		} as unknown as Producer;
		const effects = await makeEffects(
			insert,
			{
				broker: "redpanda.test:9092",
				reconnectCooldown: 60_000,
				selfHost: false,
			},
			kafka
		);

		const deliveries = Array.from({ length: 50 }, (_, index) =>
			Effect.runPromise(
				effects.sendOne("analytics-events", event(`event_${index}`))
			)
		);
		await vi.waitFor(() => expect(kafka.connect).toHaveBeenCalledTimes(1));

		releaseConnect?.();
		await Promise.all(deliveries);

		expect(kafka.connect).toHaveBeenCalledTimes(1);
		expect(kafka.send).toHaveBeenCalledTimes(50);
		expect(insert).not.toHaveBeenCalled();
		expect(await Effect.runPromise(effects.stats)).toMatchObject({
			connected: true,
			connecting: false,
			inFlight: 0,
			sent: 50,
		});
	});

	test("uses live broker metadata for every health check", async () => {
		const insert = vi.fn(() => Promise.resolve());
		const kafka = {
			connect: vi.fn(() => Promise.resolve()),
			disconnect: vi.fn(() => Promise.resolve()),
			send: vi.fn(() => Promise.resolve([])),
		} as unknown as Producer;
		const kafkaAdmin = {
			connect: vi.fn(() => Promise.resolve()),
			describeCluster: vi.fn(() =>
				Promise.resolve({ brokers: [{ nodeId: 1 }], clusterId: "test" })
			),
			disconnect: vi.fn(() => Promise.resolve()),
		} as unknown as Admin;
		const effects = await makeEffects(
			insert,
			{
				broker: "redpanda.test:9092",
				selfHost: false,
			},
			kafka,
			kafkaAdmin
		);

		await Effect.runPromise(effects.checkConnection);
		await Effect.runPromise(effects.checkConnection);
		await Effect.runPromise(effects.sendOne("analytics-events", event("event_1")));

		expect(kafka.connect).toHaveBeenCalledTimes(1);
		expect(kafkaAdmin.connect).toHaveBeenCalledTimes(1);
		expect(kafkaAdmin.describeCluster).toHaveBeenCalledTimes(2);
		expect(kafka.send).toHaveBeenCalledOnce();
		expect(insert).not.toHaveBeenCalled();
	});

	test("fails a cached producer health check when live metadata fails", async () => {
		const kafka = {
			connect: vi.fn(() => Promise.resolve()),
			disconnect: vi.fn(() => Promise.resolve()),
			send: vi.fn(() => Promise.resolve([])),
		} as unknown as Producer;
		const kafkaAdmin = {
			connect: vi.fn(() => Promise.resolve()),
			describeCluster: vi
				.fn()
				.mockResolvedValueOnce({ brokers: [{ nodeId: 1 }], clusterId: "test" })
				.mockRejectedValueOnce(new Error("metadata unavailable")),
			disconnect: vi.fn(() => Promise.resolve()),
		} as unknown as Admin;
		const effects = await makeEffects(
			vi.fn(() => Promise.resolve()),
			{ broker: "redpanda.test:9092", selfHost: false },
			kafka,
			kafkaAdmin
		);

		await Effect.runPromise(effects.checkConnection);
		await expect(Effect.runPromise(effects.checkConnection)).rejects.toMatchObject({
			_tag: "ProducerUnavailableError",
			cause: expect.objectContaining({ message: "metadata unavailable" }),
			retryable: true,
		});

		expect(kafka.connect).toHaveBeenCalledTimes(1);
		expect(kafkaAdmin.describeCluster).toHaveBeenCalledTimes(2);
		expect(kafkaAdmin.disconnect).toHaveBeenCalledOnce();
	});

	test("bounds a stalled live metadata probe", async () => {
		let rejectMetadata: ((error: Error) => void) | undefined;
		const kafka = {
			connect: vi.fn(() => Promise.resolve()),
			disconnect: vi.fn(() => Promise.resolve()),
			send: vi.fn(() => Promise.resolve([])),
		} as unknown as Producer;
		const kafkaAdmin = {
			connect: vi.fn(() => Promise.resolve()),
			describeCluster: vi.fn(
				() =>
					new Promise((_resolve, reject) => {
						rejectMetadata = reject;
					})
			),
			disconnect: vi.fn(() => {
				rejectMetadata?.(new Error("metadata connection closed"));
				return Promise.resolve();
			}),
		} as unknown as Admin;
		const effects = await makeEffects(
			vi.fn(() => Promise.resolve()),
			{
				broker: "redpanda.test:9092",
				healthProbeTimeout: 20,
				selfHost: false,
			},
			kafka,
			kafkaAdmin
		);

		const startedAt = performance.now();
		await expect(Effect.runPromise(effects.checkConnection)).rejects.toMatchObject({
			_tag: "ProducerUnavailableError",
			cause: expect.objectContaining({
				message: "Redpanda health probe exceeded 20ms",
			}),
			retryable: true,
		});
		expect(performance.now() - startedAt).toBeLessThan(500);
		await vi.waitFor(() => expect(kafkaAdmin.disconnect).toHaveBeenCalledOnce());
		expect((await Effect.runPromise(effects.stats)).inFlight).toBe(0);
	});

	test("fails the producer health check when its connection cannot be established", async () => {
		const kafka = {
			connect: vi.fn(() => Promise.reject(new Error("broker unavailable"))),
			disconnect: vi.fn(() => Promise.resolve()),
			send: vi.fn(() => Promise.resolve([])),
		} as unknown as Producer;
		const kafkaAdmin = {
			connect: vi.fn(() => Promise.resolve()),
			describeCluster: vi.fn(() =>
				Promise.resolve({ brokers: [{ nodeId: 1 }], clusterId: "test" })
			),
			disconnect: vi.fn(() => Promise.resolve()),
		} as unknown as Admin;
		const effects = await makeEffects(
			vi.fn(() => Promise.resolve()),
			{
				broker: "redpanda.test:9092",
				selfHost: false,
			},
			kafka,
			kafkaAdmin
		);

		await expect(Effect.runPromise(effects.checkConnection)).rejects.toMatchObject({
			_tag: "ProducerUnavailableError",
			retryable: true,
		});
		expect(kafkaAdmin.connect).not.toHaveBeenCalled();
	});

	test("does not publish a producer connection that loses a shutdown race", async () => {
		let releaseConnect: (() => void) | undefined;
		const kafka = {
			connect: vi.fn(
				() =>
					new Promise<void>((resolve) => {
						releaseConnect = resolve;
					})
			),
			disconnect: vi.fn(() => Promise.resolve()),
			send: vi.fn(() => Promise.resolve([])),
		} as unknown as Producer;
		const kafkaAdmin = {
			connect: vi.fn(() => Promise.resolve()),
			describeCluster: vi.fn(() =>
				Promise.resolve({ brokers: [{ nodeId: 1 }], clusterId: "test" })
			),
			disconnect: vi.fn(() => Promise.resolve()),
		} as unknown as Admin;
		const effects = await makeEffects(
			vi.fn(() => Promise.resolve()),
			{
				broker: "redpanda.test:9092",
				selfHost: false,
				shutdownDrainTimeout: 500,
			},
			kafka,
			kafkaAdmin
		);

		const health = Effect.runPromise(effects.checkConnection);
		const healthResult = expect(health).rejects.toMatchObject({
			_tag: "ProducerUnavailableError",
			retryable: true,
		});
		await vi.waitFor(() => expect(kafka.connect).toHaveBeenCalledOnce());
		const shutdown = Effect.runPromise(effects.shutDown);
		await new Promise((resolve) => setTimeout(resolve, 0));

		await expect(Effect.runPromise(effects.checkConnection)).rejects.toMatchObject({
			_tag: "ProducerUnavailableError",
			retryable: true,
		});
		releaseConnect?.();
		await healthResult;
		await shutdown;

		expect(kafka.connect).toHaveBeenCalledOnce();
		expect(kafka.disconnect).toHaveBeenCalledOnce();
		expect(kafkaAdmin.connect).not.toHaveBeenCalled();
		expect(await Effect.runPromise(effects.stats)).toMatchObject({
			connected: false,
			connecting: false,
			inFlight: 0,
		});
	});

	test("waits for an active metadata probe before shutdown disconnects", async () => {
		let releaseMetadata: (() => void) | undefined;
		const kafka = {
			connect: vi.fn(() => Promise.resolve()),
			disconnect: vi.fn(() => Promise.resolve()),
			send: vi.fn(() => Promise.resolve([])),
		} as unknown as Producer;
		const kafkaAdmin = {
			connect: vi.fn(() => Promise.resolve()),
			describeCluster: vi.fn(
				() =>
					new Promise<{ brokers: Array<{ nodeId: number }>; clusterId: string }>(
						(resolve) => {
							releaseMetadata = () =>
								resolve({ brokers: [{ nodeId: 1 }], clusterId: "test" });
						}
					)
			),
			disconnect: vi.fn(() => Promise.resolve()),
		} as unknown as Admin;
		const effects = await makeEffects(
			vi.fn(() => Promise.resolve()),
			{
				broker: "redpanda.test:9092",
				healthProbeTimeout: 500,
				selfHost: false,
				shutdownDrainTimeout: 500,
			},
			kafka,
			kafkaAdmin
		);

		const health = Effect.runPromise(effects.checkConnection);
		const healthResult = expect(health).rejects.toMatchObject({
			_tag: "ProducerUnavailableError",
			retryable: true,
		});
		await vi.waitFor(() =>
			expect(kafkaAdmin.describeCluster).toHaveBeenCalledOnce()
		);
		let shutdownSettled = false;
		const shutdown = Effect.runPromise(effects.shutDown).finally(() => {
			shutdownSettled = true;
		});
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(shutdownSettled).toBe(false);

		releaseMetadata?.();
		await healthResult;
		await shutdown;

		expect(kafkaAdmin.disconnect).toHaveBeenCalledOnce();
		expect(kafka.disconnect).toHaveBeenCalledOnce();
		expect(await Effect.runPromise(effects.stats)).toMatchObject({
			connected: false,
			connecting: false,
			inFlight: 0,
		});
	});

	test("logs one failed connection and uses direct persistence during cooldown", async () => {
		let rejectConnect: ((error: Error) => void) | undefined;
		const insert = vi.fn(() => Promise.resolve());
		const kafka = {
			connect: vi.fn(
				() =>
					new Promise<void>((_resolve, reject) => {
						rejectConnect = reject;
					})
			),
			disconnect: vi.fn(() => Promise.resolve()),
			send: vi.fn(() => Promise.resolve([])),
		} as unknown as Producer;
		const effects = await makeEffects(
			insert,
			{
				broker: "redpanda.test:9092",
				reconnectCooldown: 60_000,
				selfHost: false,
			},
			kafka
		);

		const deliveries = Array.from({ length: 50 }, (_, index) =>
			Effect.runPromise(
				effects.sendOne("analytics-events", event(`event_${index}`))
			)
		);
		await vi.waitFor(() => expect(kafka.connect).toHaveBeenCalledTimes(1));
		rejectConnect?.(new Error("broker unavailable"));
		await Promise.all(deliveries);

		expect(insert).toHaveBeenCalledTimes(50);
		expect(mockCaptureError).toHaveBeenCalledTimes(1);
		expect(await Effect.runPromise(effects.stats)).toMatchObject({
			connected: false,
			connecting: false,
			errors: 1,
			failed: true,
			inFlight: 0,
			sent: 50,
		});

		await Effect.runPromise(
			effects.sendOne("analytics-events", event("during_cooldown"))
		);
		expect(kafka.connect).toHaveBeenCalledTimes(1);
		expect(insert).toHaveBeenCalledTimes(51);
	});

	test("keeps an ambiguous retry on Kafka while unrelated events may fall back", async () => {
		const insert = vi.fn(() => Promise.resolve());
		const kafka = {
			connect: vi.fn(() => Promise.resolve()),
			disconnect: vi.fn(() => Promise.resolve()),
			send: vi.fn(() => Promise.reject(new Error("request timed out"))),
		} as unknown as Producer;
		const effects = await makeEffects(
			insert,
			{
				broker: "redpanda.test:9092",
				reconnectCooldown: 60_000,
				selfHost: false,
			},
			kafka
		);

		await expect(
			Effect.runPromise(effects.sendOne("analytics-events", event("event_1")))
		).rejects.toMatchObject({
			_tag: "KafkaSendError",
			topic: "analytics-events",
		});

		await expect(
			Effect.runPromise(
				effects.sendOne("analytics-events", event("event_1"), undefined, {
					allowDirectFallback: false,
				})
			)
		).rejects.toMatchObject({
			_tag: "ProducerUnavailableError",
			retryable: true,
		});
		expect(insert).not.toHaveBeenCalled();

		await Effect.runPromise(
			effects.sendOne("analytics-events", event("unrelated_event"))
		);
		expect(insert).toHaveBeenCalledTimes(1);
		expect(await Effect.runPromise(effects.stats)).toMatchObject({
			connected: false,
			errors: 1,
			failed: true,
			failedCount: 1,
			inFlight: 0,
			sent: 1,
		});
	});
});
