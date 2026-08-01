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
		expect(stats).toMatchObject({ inFlight: 0, sent: 1 });
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
});
