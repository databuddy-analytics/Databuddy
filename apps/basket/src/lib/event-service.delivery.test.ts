import { beforeEach, describe, expect, test, vi } from "vitest";

const {
	mockApplyVisitorIdPrivacy,
	mockGetDailySalt,
	mockGetGeo,
	mockLoggerSet,
	mockMarkDuplicateReservationDelivered,
	mockParseUserAgent,
	mockReleaseDuplicateReservation,
	mockReserveDuplicate,
	mockRunPromise,
	mockSend,
	mockSendBatch,
	mockShouldAnonymizeVisitorIds,
} = vi.hoisted(() => ({
	mockApplyVisitorIdPrivacy: vi.fn((value: unknown) => String(value ?? "")),
	mockGetDailySalt: vi.fn(() => Promise.resolve("daily-salt")),
	mockGetGeo: vi.fn(() =>
		Promise.resolve({
			anonymizedIP: "anonymous-ip",
			city: "San Francisco",
			country: "US",
			region: "CA",
		})
	),
	mockLoggerSet: vi.fn(),
	mockMarkDuplicateReservationDelivered: vi.fn(() => Promise.resolve()),
	mockParseUserAgent: vi.fn(() => Promise.resolve({ browserName: "Chrome" })),
	mockReleaseDuplicateReservation: vi.fn(() => Promise.resolve()),
	mockReserveDuplicate: vi.fn(() =>
		Promise.resolve({
			duplicate: false,
			key: "dedup:track:evt_1",
			token: "reservation-token",
		})
	),
	mockRunPromise: vi.fn(() => Promise.resolve()),
	mockSend: vi.fn(() => ({ _tag: "MockEffect" })),
	mockSendBatch: vi.fn(() => ({ _tag: "MockEffect" })),
	mockShouldAnonymizeVisitorIds: vi.fn(() => false),
}));

vi.mock("@lib/producer", () => ({
	runPromise: mockRunPromise,
	send: mockSend,
	sendBatch: mockSendBatch,
}));

vi.mock("@lib/security", () => ({
	applyVisitorIdPrivacy: mockApplyVisitorIdPrivacy,
	getDailySalt: mockGetDailySalt,
	markDuplicateReservationDelivered: mockMarkDuplicateReservationDelivered,
	releaseDuplicateReservation: mockReleaseDuplicateReservation,
	reserveDuplicate: mockReserveDuplicate,
	shouldAnonymizeVisitorIds: mockShouldAnonymizeVisitorIds,
}));

vi.mock("@lib/tracing", () => ({
	record: (_name: string, operation: () => Promise<unknown>) => operation(),
}));

vi.mock("@utils/ip-geo", () => ({
	extractTrustedClientIp: vi.fn(() => undefined),
	getGeo: mockGetGeo,
}));

vi.mock("@utils/user-agent", () => ({
	parseUserAgent: mockParseUserAgent,
}));

vi.mock("evlog/elysia", () => ({
	useLogger: () => ({ set: mockLoggerSet }),
}));

const {
	buildTrackEvent,
	insertOutgoingLink,
	insertTrackEvent,
	insertTrackEventsBatch,
	stableAnalyticsEventId,
} = await import("./event-service");

const request = new Request("http://localhost/ingest");
const trackReservation = {
	duplicate: false,
	key: "dedup:track:evt_1",
	token: "pending:reservation-token",
	ttl: 86_400,
};

function trackBatchItem(eventId: string) {
	return {
		event: buildTrackEvent(
			{ anonymousId: "anon_1", eventId, name: "pageview" },
			{
				anonymousId: "anon_1",
				clientId: "ws_test",
				eventId,
				geo: { anonymizedIP: "anonymous-ip" },
				now: 1,
				ua: {},
			}
		),
		sourceEventId: eventId,
	};
}

describe("core event delivery", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetGeo.mockResolvedValue({
			anonymizedIP: "anonymous-ip",
			city: "San Francisco",
			country: "US",
			region: "CA",
		});
		mockParseUserAgent.mockResolvedValue({ browserName: "Chrome" });
		mockReserveDuplicate.mockResolvedValue(trackReservation);
		mockRunPromise.mockResolvedValue(undefined);
		mockSend.mockReturnValue({ _tag: "MockEffect" });
		mockSendBatch.mockReturnValue({ _tag: "MockEffect" });
		mockShouldAnonymizeVisitorIds.mockReturnValue(false);
	});

	test("awaits durable delivery for core track events", async () => {
		await insertTrackEvent(
			{ anonymousId: "anon_1", eventId: "evt_1", name: "pageview" },
			"ws_test",
			"Mozilla/5.0",
			"1.2.3.4",
			request
		);

		expect(mockSend).toHaveBeenCalledWith(
			"analytics-events",
			expect.objectContaining({ client_id: "ws_test", event_name: "pageview" })
		);
		expect(mockRunPromise).toHaveBeenCalledWith(mockSend.mock.results[0]?.value);
		expect(mockMarkDuplicateReservationDelivered).toHaveBeenCalledWith(
			trackReservation
		);
		expect(mockReleaseDuplicateReservation).not.toHaveBeenCalled();
	});

	test("releases a track reservation and returns retryable 503 when delivery fails", async () => {
		const deliveryFailure = new Error("ClickHouse unavailable");
		mockRunPromise.mockRejectedValueOnce(deliveryFailure);

		await expect(
			insertTrackEvent(
				{ anonymousId: "anon_1", eventId: "evt_1", name: "pageview" },
				"ws_test",
				"Mozilla/5.0",
				"1.2.3.4",
				request
			)
		).rejects.toMatchObject({
			message: "Analytics delivery temporarily unavailable",
			status: 503,
		});

		expect(mockReleaseDuplicateReservation).toHaveBeenCalledWith(
			trackReservation
		);
	});

	test("reuses the same ClickHouse UUID when a client retries a failed track event", async () => {
		const deliveredEvents: Array<{ id: string }> = [];
		mockSend.mockImplementation((_topic, event) => {
			deliveredEvents.push(event as { id: string });
			return { _tag: "MockEffect" };
		});
		mockRunPromise
			.mockRejectedValueOnce(new Error("ambiguous delivery"))
			.mockResolvedValueOnce(undefined);

		await expect(
			insertTrackEvent(
				{ anonymousId: "anon_1", eventId: "evt_retry", name: "pageview" },
				"ws_test",
				"Mozilla/5.0",
				"1.2.3.4",
				request
			)
		).rejects.toMatchObject({ status: 503 });

		await insertTrackEvent(
			{ anonymousId: "anon_1", eventId: "evt_retry", name: "pageview" },
			"ws_test",
			"Mozilla/5.0",
			"1.2.3.4",
			request
		);

		expect(deliveredEvents.map((event) => event.id)).toEqual([
			stableAnalyticsEventId("ws_test", "track", "evt_retry"),
			stableAnalyticsEventId("ws_test", "track", "evt_retry"),
		]);
		expect(mockReserveDuplicate).toHaveBeenCalledWith(
			stableAnalyticsEventId("ws_test", "track", "evt_retry"),
			"track",
			"evt_retry"
		);
	});

	test("awaits outgoing-link delivery and releases its reservation on failure", async () => {
		const reservation = {
			duplicate: false,
			key: "dedup:outgoing_link:evt_link_1",
			ttl: 86_400,
		};
		mockReserveDuplicate.mockResolvedValueOnce(reservation);
		mockRunPromise.mockRejectedValueOnce(new Error("ClickHouse unavailable"));

		await expect(
			insertOutgoingLink(
				{
					anonymousId: "anon_1",
					eventId: "evt_link_1",
					href: "https://example.com/pricing",
				},
				"ws_test",
				request
			)
		).rejects.toMatchObject({ status: 503 });

		expect(mockSend).toHaveBeenCalledWith(
			"analytics-outgoing-links",
			expect.objectContaining({ client_id: "ws_test" })
		);
		expect(mockRunPromise).toHaveBeenCalledWith(mockSend.mock.results[0]?.value);
		expect(mockReleaseDuplicateReservation).toHaveBeenCalledWith(reservation);
	});

	test("does not send a duplicate core event", async () => {
		mockReserveDuplicate.mockResolvedValueOnce({ duplicate: true });

		await insertTrackEvent(
			{ anonymousId: "anon_1", eventId: "evt_1", name: "pageview" },
			"ws_test",
			"Mozilla/5.0",
			"1.2.3.4",
			request
		);

		expect(mockSend).not.toHaveBeenCalled();
		expect(mockRunPromise).not.toHaveBeenCalled();
	});

	test("returns retryable 503 without publishing a track event owned by another request", async () => {
		mockReserveDuplicate.mockResolvedValueOnce({
			duplicate: false,
			retryable: true,
		});

		await expect(
			insertTrackEvent(
				{ anonymousId: "anon_1", eventId: "evt_1", name: "pageview" },
				"ws_test",
				"Mozilla/5.0",
				"1.2.3.4",
				request
			)
		).rejects.toMatchObject({ status: 503 });

		expect(mockSend).not.toHaveBeenCalled();
		expect(mockRunPromise).not.toHaveBeenCalled();
		expect(mockMarkDuplicateReservationDelivered).not.toHaveBeenCalled();
		expect(mockReleaseDuplicateReservation).not.toHaveBeenCalled();
	});

	test("returns retryable 503 without publishing an outgoing link owned by another request", async () => {
		mockReserveDuplicate.mockResolvedValueOnce({
			duplicate: false,
			retryable: true,
		});

		await expect(
			insertOutgoingLink(
				{
					anonymousId: "anon_1",
					eventId: "evt_link_1",
					href: "https://example.com/pricing",
				},
				"ws_test",
				request
			)
		).rejects.toMatchObject({ status: 503 });

		expect(mockSend).not.toHaveBeenCalled();
		expect(mockRunPromise).not.toHaveBeenCalled();
		expect(mockMarkDuplicateReservationDelivered).not.toHaveBeenCalled();
		expect(mockReleaseDuplicateReservation).not.toHaveBeenCalled();
	});

	test("continues delivery when Redis is unavailable and no reservation was acquired", async () => {
		const unavailableReservation = { duplicate: false };
		mockReserveDuplicate.mockResolvedValueOnce(unavailableReservation);

		await insertTrackEvent(
			{ anonymousId: "anon_1", eventId: "evt_1", name: "pageview" },
			"ws_test",
			"Mozilla/5.0",
			"1.2.3.4",
			request
		);

		expect(mockSend).toHaveBeenCalledOnce();
		expect(mockRunPromise).toHaveBeenCalledOnce();
		expect(mockMarkDuplicateReservationDelivered).toHaveBeenCalledWith(
			unavailableReservation
		);
		expect(mockReleaseDuplicateReservation).not.toHaveBeenCalled();
	});

	test("delivers one logical batch event and promotes its reservation after acknowledgement", async () => {
		const first = trackBatchItem("evt_1");
		const duplicate = trackBatchItem("evt_1");

		await insertTrackEventsBatch([first, duplicate]);

		expect(mockReserveDuplicate).toHaveBeenCalledOnce();
		expect(mockReserveDuplicate).toHaveBeenCalledWith(
			first.event.id,
			"track",
			"evt_1"
		);
		expect(mockSendBatch).toHaveBeenCalledWith("analytics-events", [first.event]);
		expect(mockMarkDuplicateReservationDelivered).toHaveBeenCalledWith(
			trackReservation
		);
	});

	test("releases acquired batch reservations when another request owns an item", async () => {
		mockReserveDuplicate
			.mockResolvedValueOnce(trackReservation)
			.mockResolvedValueOnce({ duplicate: false, retryable: true });

		await expect(
			insertTrackEventsBatch([trackBatchItem("evt_1"), trackBatchItem("evt_2")])
		).rejects.toMatchObject({ status: 503 });

		expect(mockSendBatch).not.toHaveBeenCalled();
		expect(mockReleaseDuplicateReservation).toHaveBeenCalledWith(
			trackReservation
		);
	});

	test("releases acquired batch reservations when reservation lookup fails", async () => {
		mockReserveDuplicate
			.mockResolvedValueOnce(trackReservation)
			.mockRejectedValueOnce(new Error("Redis lookup failed"));

		await expect(
			insertTrackEventsBatch([trackBatchItem("evt_1"), trackBatchItem("evt_2")])
		).rejects.toMatchObject({ status: 503 });

		expect(mockSendBatch).not.toHaveBeenCalled();
		expect(mockReleaseDuplicateReservation).toHaveBeenCalledWith(
			trackReservation
		);
	});

	test("releases batch reservations when durable delivery fails", async () => {
		mockRunPromise.mockRejectedValueOnce(new Error("ClickHouse unavailable"));

		await expect(insertTrackEventsBatch([trackBatchItem("evt_1")])).rejects.toMatchObject({
			status: 503,
		});

		expect(mockReleaseDuplicateReservation).toHaveBeenCalledWith(
			trackReservation
		);
	});
});
