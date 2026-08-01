import { beforeEach, describe, expect, test, vi } from "vitest";
import type { EventsInsert } from "@databuddy/db/clickhouse/tables";

const {
	mockApplyVisitorIdPrivacy,
	mockGetDailySalt,
	mockGetGeo,
	mockMarkDuplicateReservationAmbiguous,
	mockMarkDuplicateReservationDelivered,
	mockParseUserAgent,
	mockReleaseDuplicateReservation,
	mockReserveDuplicate,
	mockReserveDuplicateBatch,
	mockRunPromise,
	mockSend,
	mockSendBatch,
	mockShouldAnonymizeVisitorIds,
	mockUseLogger,
} = vi.hoisted(() => ({
	mockApplyVisitorIdPrivacy: vi.fn((id: unknown) =>
		typeof id === "string" ? id : ""
	),
	mockGetDailySalt: vi.fn(() => Promise.resolve("daily-salt")),
	mockGetGeo: vi.fn(() =>
		Promise.resolve({
			anonymizedIP: "1.2.3.0",
			city: "San Francisco",
			country: "US",
			region: "CA",
		})
	),
	mockParseUserAgent: vi.fn(() =>
		Promise.resolve({
			browserName: "Chrome",
			browserVersion: "120",
			deviceType: "desktop",
			osName: "macOS",
			osVersion: "14",
		})
	),
	mockMarkDuplicateReservationDelivered: vi.fn(() => Promise.resolve()),
	mockMarkDuplicateReservationAmbiguous: vi.fn(() => Promise.resolve()),
	mockReleaseDuplicateReservation: vi.fn(() => Promise.resolve()),
	mockReserveDuplicate: vi.fn(() =>
		Promise.resolve({
			deliveredTtl: 86_400,
			duplicate: false,
			key: "dedup:track:stable-id",
			token: "pending:test",
		})
	),
	mockReserveDuplicateBatch: vi.fn(
		(inputs: Array<{ eventId: string; eventType: string }>) =>
			Promise.resolve(
				inputs.map(({ eventId, eventType }) => ({
					deliveredTtl: 86_400,
					duplicate: false,
					key: `dedup:${eventType}:${eventId}`,
					token: "pending:batch-test",
				}))
			)
	),
	mockRunPromise: vi.fn(() => Promise.resolve()),
	mockSend: vi.fn(() => ({ type: "producer-effect" })),
	mockSendBatch: vi.fn(() => ({ type: "batch-producer-effect" })),
	mockShouldAnonymizeVisitorIds: vi.fn(() => false),
	mockUseLogger: {
		set: vi.fn(),
	},
}));

vi.mock("@lib/producer", () => ({
	runPromise: mockRunPromise,
	send: mockSend,
	sendBatch: mockSendBatch,
}));

vi.mock("@lib/security", () => ({
	applyVisitorIdPrivacy: mockApplyVisitorIdPrivacy,
	getDailySalt: mockGetDailySalt,
	markDuplicateReservationAmbiguous: mockMarkDuplicateReservationAmbiguous,
	markDuplicateReservationDelivered: mockMarkDuplicateReservationDelivered,
	releaseDuplicateReservation: mockReleaseDuplicateReservation,
	reserveDuplicate: mockReserveDuplicate,
	reserveDuplicateBatch: mockReserveDuplicateBatch,
	shouldAnonymizeVisitorIds: mockShouldAnonymizeVisitorIds,
}));

vi.mock("@lib/tracing", () => ({
	record: (_name: string, fn: () => Promise<void>) => fn(),
}));

vi.mock("@utils/ip-geo", () => ({
	extractTrustedClientIp: vi.fn(() => "1.2.3.4"),
	getGeo: mockGetGeo,
}));

vi.mock("@utils/user-agent", () => ({
	parseUserAgent: mockParseUserAgent,
}));

vi.mock("evlog/elysia", () => ({
	useLogger: () => mockUseLogger,
}));

const {
	insertErrorSpans,
	insertOutgoingLink,
	insertTrackEvent,
	insertTrackEventsBatch,
	stableBatchDeliveryId,
	stableAnalyticsEventId,
} = await import("./event-service");

describe("event-service producer handoff", () => {
	beforeEach(() => {
		mockApplyVisitorIdPrivacy.mockClear();
		mockGetDailySalt.mockClear();
		mockGetGeo.mockClear();
		mockMarkDuplicateReservationAmbiguous.mockClear();
		mockMarkDuplicateReservationDelivered.mockClear();
		mockParseUserAgent.mockClear();
		mockReleaseDuplicateReservation.mockClear();
		mockReserveDuplicate.mockReset();
		mockReserveDuplicate.mockResolvedValue({
			deliveredTtl: 86_400,
			duplicate: false,
			key: "dedup:track:stable-id",
			token: "pending:test",
		});
		mockReserveDuplicateBatch.mockReset();
		mockReserveDuplicateBatch.mockImplementation(
			(inputs: Array<{ eventId: string; eventType: string }>) =>
				Promise.resolve(
					inputs.map(({ eventId, eventType }) => ({
						deliveredTtl: 86_400,
						duplicate: false,
						key: `dedup:${eventType}:${eventId}`,
						token: "pending:batch-test",
					}))
				)
		);
		mockRunPromise.mockClear();
		mockSend.mockClear();
		mockSendBatch.mockClear();
		mockShouldAnonymizeVisitorIds.mockClear();
		mockUseLogger.set.mockClear();
	});

	test("awaits track event producer admission", async () => {
		const effect = { type: "track-effect" };
		mockSend.mockReturnValueOnce(effect);

		await insertTrackEvent(
			{
				anonymousId: "anon_1",
				eventId: "evt_1",
				name: "pageview",
				path: "https://example.com/page",
				sessionId: "session_1",
			},
			"ws_1",
			"Mozilla/5.0",
			"1.2.3.4",
			new Request("https://basket.example/px.jpg")
		);

		expect(mockSend).toHaveBeenCalledWith(
			"analytics-events",
			expect.objectContaining({
				anonymous_id: "anon_1",
				client_id: "ws_1",
				event_name: "pageview",
			}),
			undefined,
			{ allowDirectFallback: true }
		);
		expect(mockRunPromise).toHaveBeenCalledWith(effect);
		expect(mockMarkDuplicateReservationDelivered).toHaveBeenCalledOnce();
	});

	test("propagates outgoing-link producer admission failures", async () => {
		const error = new Error("buffer full");
		mockRunPromise.mockRejectedValueOnce(error);

		await expect(
			insertOutgoingLink(
				{
					anonymousId: "anon_1",
					eventId: "evt_link_1",
					href: "https://external.example",
					sessionId: "session_1",
				},
				"ws_1",
				new Request("https://basket.example/px.jpg")
			)
		).rejects.toThrow("Analytics delivery temporarily unavailable");
		expect(mockReleaseDuplicateReservation).toHaveBeenCalledOnce();
		expect(mockMarkDuplicateReservationDelivered).not.toHaveBeenCalled();
	});

	test("preserves an ambiguous Kafka reservation instead of releasing it", async () => {
		mockRunPromise.mockRejectedValueOnce({
			_tag: "KafkaSendError",
			message: "request timed out",
		});

		await expect(
			insertTrackEvent(
				{ eventId: "evt_1", name: "pageview", path: "/" },
				"ws_1",
				"Mozilla/5.0",
				"1.2.3.4",
				new Request("https://basket.example/px.jpg")
			)
		).rejects.toThrow("Analytics delivery temporarily unavailable");

		expect(mockMarkDuplicateReservationAmbiguous).toHaveBeenCalledOnce();
		expect(mockReleaseDuplicateReservation).not.toHaveBeenCalled();
	});

	test("returns a retryable failure while another request owns the event", async () => {
		mockReserveDuplicate.mockResolvedValueOnce({
			duplicate: false,
			retryable: true,
		});

		await expect(
			insertTrackEvent(
				{ eventId: "evt_1", name: "pageview", path: "/" },
				"ws_1",
				"Mozilla/5.0",
				"1.2.3.4",
				new Request("https://basket.example/px.jpg")
			)
		).rejects.toMatchObject({ status: 503 });
		expect(mockSend).not.toHaveBeenCalled();
	});

	test("atomically reserves a sorted batch and rejects a conflict", async () => {
		mockReserveDuplicateBatch.mockImplementationOnce(async (inputs) =>
			inputs.map(() => ({ duplicate: false, retryable: true as const }))
		);
		const batchItem = (id: string) => ({
			event: { id } as EventsInsert,
			sourceEventId: id,
		});

		await expect(
			insertTrackEventsBatch([
				batchItem("z"),
				batchItem("a"),
				batchItem("m"),
			])
		).rejects.toMatchObject({ status: 503 });

		expect(mockReserveDuplicateBatch).toHaveBeenCalledWith([
			{ eventId: "a", eventType: "track", sourceEventId: "a" },
			{ eventId: "m", eventType: "track", sourceEventId: "m" },
			{ eventId: "z", eventType: "track", sourceEventId: "z" },
		]);
		expect(mockReleaseDuplicateReservation).not.toHaveBeenCalled();
		expect(mockSendBatch).not.toHaveBeenCalled();
	});

	test("uses a stable UUID for a retried source event", () => {
		const first = stableAnalyticsEventId("ws_1", "track", "evt_1");
		const retry = stableAnalyticsEventId("ws_1", "track", "evt_1");

		expect(first).toBe(retry);
		expect(first).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
		);
	});

	test("uses stable side-channel identities for id-less span retries", async () => {
		const error = {
			anonymousId: "anon_1",
			errorType: "TypeError",
			message: "boom",
			path: "/checkout",
			timestamp: 1_780_000_000_000,
		};

		await insertErrorSpans([error], "ws_1", "US");

		const expectedDeliveryId = stableBatchDeliveryId(
			"ws_1",
			"error",
			error,
			0
		);
		expect(mockSendBatch).toHaveBeenCalledWith(
			"analytics-error-spans",
			[expect.objectContaining({ message: "boom", path: "/checkout" })],
			[expectedDeliveryId],
			{ allowDirectFallback: true }
		);
		expect(expectedDeliveryId).toMatch(/^[\da-f]{64}$/);
	});

	test("prefers a source event id over generated span fields", () => {
		const first = stableBatchDeliveryId(
			"ws_1",
			"error",
			{ eventId: "evt_error_1", message: "first", timestamp: 1 },
			0
		);
		const retry = stableBatchDeliveryId(
			"ws_1",
			"error",
			{ eventId: "evt_error_1", message: "changed", timestamp: 2 },
			0
		);

		expect(retry).toBe(first);
	});

	test("filters an already delivered item from a recomposed retry batch", async () => {
		const first = {
			eventId: "evt_error_a",
			errorType: "Error",
			message: "a",
			path: "/",
			timestamp: 1_780_000_000_000,
		};
		const second = {
			...first,
			eventId: "evt_error_b",
			message: "b",
		};
		const firstId = stableBatchDeliveryId("ws_1", "error", first, 0);
		mockReserveDuplicateBatch.mockImplementationOnce(async (inputs) =>
			inputs.map(({ eventId, eventType }) =>
				eventId === firstId
					? { duplicate: true }
					: {
							deliveredTtl: 86_400,
							duplicate: false,
							key: `dedup:${eventType}:${eventId}`,
							token: "pending:new-item",
						}
			)
		);

		await insertErrorSpans([first, second], "ws_1");

		expect(mockSendBatch).toHaveBeenCalledWith(
			"analytics-error-spans",
			[expect.objectContaining({ message: "b" })],
			[stableBatchDeliveryId("ws_1", "error", second, 1)],
			{ allowDirectFallback: true }
		);
	});

	test("preserves an ambiguous id-less batch reservation", async () => {
		mockRunPromise.mockRejectedValueOnce({ _tag: "KafkaSendError" });

		await expect(
			insertErrorSpans(
				[
					{
						errorType: "Error",
						message: "boom",
						path: "/",
						timestamp: 1_780_000_000_000,
					},
				],
				"ws_1"
			)
		).rejects.toThrow("Analytics delivery temporarily unavailable");

		expect(mockMarkDuplicateReservationAmbiguous).toHaveBeenCalledOnce();
		expect(mockReleaseDuplicateReservation).not.toHaveBeenCalled();
	});
});
