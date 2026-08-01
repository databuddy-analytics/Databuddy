import type { ClickHouseClient } from "@clickhouse/client";
import type { Producer } from "kafkajs";
import { describe, expect, test, vi } from "vitest";
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

const { createProducer } = await import("./producer");

const topicMap = { "analytics-events": "analytics.events" };

const baseConfig: ProducerConfig = {
	broker: undefined,
	chunkSize: 100,
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

function makeProducer(
	insert: (input: unknown) => Promise<unknown>,
	config: Partial<ProducerConfig> = {}
) {
	return createProducer(
		{ ...baseConfig, ...config },
		null,
		{ insert } as unknown as ClickHouseClient,
		topicMap
	);
}

describe("producer delivery guarantees", () => {
	test("resolves a core send only after direct ClickHouse fallback succeeds", async () => {
		const insert = vi.fn(() => Promise.resolve());
		const producer = makeProducer(insert);

		await producer.sendOne("analytics-events", event("event_1"));

		expect(insert).toHaveBeenCalledWith(
			expect.objectContaining({
				format: "JSONEachRow",
				table: "analytics.events",
				values: [event("event_1")],
			})
		);
	});

	test("returns a retryable error instead of acknowledging a failed direct fallback", async () => {
		const producer = makeProducer(() => Promise.reject(new Error("offline")));

		await expect(
			producer.sendOne("analytics-events", event("event_1"))
		).rejects.toMatchObject({
			_tag: "ClickHouseFallbackError",
			retryable: true,
			table: "analytics.events",
			topic: "analytics-events",
		});
	});

	test("does not admit a send after shutdown starts while delivery is active", async () => {
		let releaseInsert: (() => void) | undefined;
		const producer = makeProducer(
			() =>
				new Promise<void>((resolve) => {
					releaseInsert = resolve;
				}),
			{ shutdownDrainTimeout: 500 }
		);

		const activeDelivery = producer.sendOne("analytics-events", event("event_1"));
		await vi.waitFor(() => expect(releaseInsert).toBeTypeOf("function"));

		const shutdown = producer.shutDown();
		await expect(
			producer.sendOne("analytics-events", event("event_2"))
		).rejects.toMatchObject({
			_tag: "ProducerShuttingDownError",
			retryable: true,
		});

		releaseInsert?.();
		await activeDelivery;
		await shutdown;
	});

	test("reports an in-flight direct delivery when shutdown reaches its deadline", async () => {
		let releaseInsert: (() => void) | undefined;
		const producer = makeProducer(
			() =>
				new Promise<void>((resolve) => {
					releaseInsert = resolve;
				}),
			{ shutdownDrainTimeout: 20 }
		);

		const activeDelivery = producer.sendOne("analytics-events", event("event_1"));
		await vi.waitFor(() => expect(releaseInsert).toBeTypeOf("function"));
		await expect(producer.shutDown()).rejects.toMatchObject({
			_tag: "ShutdownDrainError",
			inFlight: 1,
			retryable: true,
		});

		releaseInsert?.();
		await activeDelivery;
	});

	test("shares a cold Kafka connection across concurrent sends", async () => {
		let resolveConnect: (() => void) | undefined;
		const connect = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveConnect = resolve;
				})
		);
		const send = vi.fn(() => Promise.resolve());
		const kafka = {
			connect,
			disconnect: vi.fn(() => Promise.resolve()),
			send,
		} as unknown as Producer;
		const producer = createProducer(
			{ ...baseConfig, broker: "redpanda.test:9092", selfHost: false },
			kafka,
			{ insert: vi.fn(() => Promise.resolve()) } as unknown as ClickHouseClient,
			topicMap
		);

		const first = producer.sendOne("analytics-events", event("event_1"));
		const second = producer.sendOne("analytics-events", event("event_2"));
		await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());
		resolveConnect?.();

		await Promise.all([first, second]);
		expect(send).toHaveBeenCalledTimes(2);
	});

	test("falls back when Kafka connect throws synchronously", async () => {
		const insert = vi.fn(() => Promise.resolve());
		const kafka = {
			connect: vi.fn(() => {
				throw new Error("Kafka client is not ready");
			}),
			disconnect: vi.fn(() => Promise.resolve()),
			send: vi.fn(() => Promise.resolve()),
		} as unknown as Producer;
		const producer = createProducer(
			{ ...baseConfig, broker: "redpanda.test:9092", selfHost: false },
			kafka,
			{ insert } as unknown as ClickHouseClient,
			topicMap
		);

		await producer.sendOne("analytics-events", event("event_1"));

		expect(insert).toHaveBeenCalledWith(
			expect.objectContaining({ values: [event("event_1")] })
		);
	});
});
