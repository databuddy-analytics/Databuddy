import type { ClickHouseClient } from "@clickhouse/client";
import { Effect } from "effect";
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

const { createProducerEffects } = await import("./producer");

const topicMap = { "analytics-events": "analytics.events" };

const baseConfig: ProducerConfig = {
	bufferHardMax: 2,
	bufferInterval: 60_000,
	bufferMax: 1,
	broker: undefined,
	chunkSize: 100,
	kafkaTimeout: 1_000,
	maxProducerRetries: 0,
	password: undefined,
	producerRetryDelay: 1,
	reconnectCooldown: 1,
	selfHost: true,
	shutdownDrainRetryDelay: 1,
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
	config: Partial<ProducerConfig> = {}
) {
	return Effect.runPromise(
		createProducerEffects(
			{ ...baseConfig, ...config },
			null,
			{ insert } as unknown as ClickHouseClient,
			topicMap
		)
	);
}

describe("producer delivery guarantees", () => {
	test("resolves a core send only after direct ClickHouse fallback succeeds", async () => {
		const insert = vi.fn(() => Promise.resolve());
		const effects = await makeEffects(insert);

		await Effect.runPromise(effects.sendOne("analytics-events", event("event_1")));

		expect(insert).toHaveBeenCalledWith(
			expect.objectContaining({
				format: "JSONEachRow",
				table: "analytics.events",
				values: [event("event_1")],
			})
		);
		const stats = await Effect.runPromise(effects.stats);
		expect(stats).toMatchObject({ bufferSize: 0, flushed: 1 });
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
		expect(stats).toMatchObject({ bufferSize: 0, errors: 1 });
	});

	test("rejects buffered delivery atomically when the in-memory buffer is full", async () => {
		const effects = await makeEffects(() => Promise.resolve());

		await Effect.runPromise(
			effects.sendManyBuffered("analytics-events", [event("event_1"), event("event_2")])
		);
		await expect(
			Effect.runPromise(
				effects.sendOneBuffered("analytics-events", event("event_3"))
			)
		).rejects.toMatchObject({
			_tag: "BufferOverflowError",
			bufferHardMax: 2,
			bufferLength: 2,
			eventCount: 1,
			retryable: true,
		});

		const stats = await Effect.runPromise(effects.stats);
		expect(stats).toMatchObject({ bufferSize: 2, dropped: 0 });
	});

	test("drains every buffered event before shutdown completes", async () => {
		const insert = vi.fn(() => Promise.resolve());
		const effects = await makeEffects(insert, { bufferHardMax: 3 });

		await Effect.runPromise(
			effects.sendManyBuffered("analytics-events", [
				event("event_1"),
				event("event_2"),
				event("event_3"),
			])
		);
		await Effect.runPromise(effects.shutDown);

		expect(insert).toHaveBeenCalledTimes(3);
		const stats = await Effect.runPromise(effects.stats);
		expect(stats).toMatchObject({ bufferSize: 0, flushed: 3 });
	});

	test("rejects new events with a retryable error once shutdown begins", async () => {
		let releaseInsert: (() => void) | undefined;
		const effects = await makeEffects(
			() =>
				new Promise<void>((resolve) => {
					releaseInsert = resolve;
				}),
			{ shutdownDrainTimeout: 500 }
		);

		await Effect.runPromise(
			effects.sendOneBuffered("analytics-events", event("event_1"))
		);
		const shutdown = Effect.runPromise(effects.shutDown);
		await vi.waitFor(() => expect(releaseInsert).toBeTypeOf("function"));

		await expect(
			Effect.runPromise(
				effects.sendOneBuffered("analytics-events", event("event_2"))
			)
		).rejects.toMatchObject({
			_tag: "ProducerShuttingDownError",
			eventCount: 1,
			retryable: true,
		});

		releaseInsert?.();
		await shutdown;
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

	test("reports retained residual events when shutdown cannot drain before its deadline", async () => {
		const effects = await makeEffects(
			() => Promise.reject(new Error("ClickHouse unavailable")),
			{ shutdownDrainTimeout: 20 }
		);

		await Effect.runPromise(
			effects.sendOneBuffered("analytics-events", event("event_1"))
		);
		await expect(Effect.runPromise(effects.shutDown)).rejects.toMatchObject({
			_tag: "ShutdownDrainError",
			inFlight: 0,
			residualCount: 1,
			retryable: true,
		});

		const stats = await Effect.runPromise(effects.stats);
		expect(stats.bufferSize).toBe(1);
	});
});
