import type { ClickHouseClient } from "@clickhouse/client";
import { Effect } from "effect";
import type { Producer } from "kafkajs";
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
	directFallbackTimeout: 1_000,
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
	kafka: Producer | null = null
) {
	return Effect.runPromise(
		createProducerEffects(
			{ ...baseConfig, ...config },
			kafka,
			{ insert } as unknown as ClickHouseClient,
			topicMap
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

		await Effect.runPromise(
			effects.sendMany(
				"analytics-events",
				[{ client_id: "ws_1", timestamp: 1 }],
				["stable-delivery-id"]
			)
		);
		await Effect.runPromise(
			effects.sendMany(
				"analytics-events",
				[{ client_id: "ws_1", timestamp: 2 }],
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

	test("uses direct fallback during reconnect cooldown after an ambiguous Kafka send", async () => {
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
