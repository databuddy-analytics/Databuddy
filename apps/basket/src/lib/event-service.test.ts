import type { EventsInsert } from "@databuddy/db/clickhouse/tables";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { longString } from "../test-helpers";
import type { TrackEventContext } from "./event-service";

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
	buildTrackEvent,
	insertCustomEvents,
	insertErrorSpans,
	insertIndividualVitals,
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

	test("reserves track events only after enrichment completes", async () => {
		let resolveGeo!: (value: {
			anonymizedIP: string;
			city: string;
			country: string;
			region: string;
		}) => void;
		mockGetGeo.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveGeo = resolve;
				})
		);

		const pending = insertTrackEvent(
			{ eventId: "evt_1", name: "pageview", path: "/" },
			"ws_1",
			"Mozilla/5.0",
			"1.2.3.4",
			new Request("https://basket.example/px.jpg")
		);

		expect(mockGetGeo).toHaveBeenCalledOnce();
		expect(mockReserveDuplicate).not.toHaveBeenCalled();
		resolveGeo({
			anonymizedIP: "1.2.3.0",
			city: "San Francisco",
			country: "US",
			region: "CA",
		});
		await pending;

		expect(mockReserveDuplicate.mock.invocationCallOrder[0]).toBeLessThan(
			mockSend.mock.invocationCallOrder[0] as number
		);
	});

	test("reserves outgoing links only after GeoIP enrichment completes", async () => {
		let resolveGeo!: (value: {
			anonymizedIP: string;
			city: string;
			country: string;
			region: string;
		}) => void;
		mockGetGeo.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveGeo = resolve;
				})
		);

		const pending = insertOutgoingLink(
			{
				anonymizeVisitorIds: "auto",
				eventId: "evt_link_1",
				href: "https://external.example",
			},
			"ws_1",
			new Request("https://basket.example/px.jpg")
		);

		expect(mockGetGeo).toHaveBeenCalledOnce();
		expect(mockReserveDuplicate).not.toHaveBeenCalled();
		resolveGeo({
			anonymizedIP: "1.2.3.0",
			city: "San Francisco",
			country: "US",
			region: "CA",
		});
		await pending;

		expect(mockReserveDuplicate.mock.invocationCallOrder[0]).toBeLessThan(
			mockSend.mock.invocationCallOrder[0] as number
		);
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

	test("keeps direct delivery IDs distinct before storage truncation", async () => {
		const prefix = "x".repeat(512);

		await insertOutgoingLink(
			{
				eventId: `${prefix}a`,
				href: "https://external.example/a",
			},
			"ws_1",
			new Request("https://basket.example/px.jpg")
		);
		await insertOutgoingLink(
			{
				eventId: `${prefix}b`,
				href: "https://external.example/b",
			},
			"ws_1",
			new Request("https://basket.example/px.jpg")
		);

		const firstDeliveryId = (
			mockSend.mock.calls[0]?.[1] as { id?: string } | undefined
		)?.id;
		const secondDeliveryId = (
			mockSend.mock.calls[1]?.[1] as { id?: string } | undefined
		)?.id;
		expect(firstDeliveryId).toBeTruthy();
		expect(secondDeliveryId).toBeTruthy();
		expect(firstDeliveryId).not.toBe(secondDeliveryId);
		expect(mockReserveDuplicate.mock.calls[0]?.[0]).toBe(firstDeliveryId);
		expect(mockReserveDuplicate.mock.calls[1]?.[0]).toBe(secondDeliveryId);
		expect(mockReserveDuplicate.mock.calls[0]?.[2]).toBe(prefix);
		expect(mockReserveDuplicate.mock.calls[1]?.[2]).toBe(prefix);
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
			[
				expect.objectContaining({
					delivery_id: expectedDeliveryId,
					message: "boom",
					path: "/checkout",
				}),
			],
			[expectedDeliveryId],
			{ allowDirectFallback: true }
		);
		expect(expectedDeliveryId).toMatch(/^[\da-f]{64}$/);
	});

	test("persists stable delivery identities on vital span rows", async () => {
		const vital = {
			eventId: "evt_vital_1",
			metricName: "LCP" as const,
			metricValue: 1234,
			path: "/checkout",
			timestamp: 1_780_000_000_000,
		};
		await insertIndividualVitals([vital], "ws_1", "US");
		const vitalDeliveryId = stableBatchDeliveryId(
			"ws_1",
			"vital",
			vital,
			0
		);
		expect(mockSendBatch).toHaveBeenLastCalledWith(
			"analytics-vitals-spans",
			[
				expect.objectContaining({
					delivery_id: vitalDeliveryId,
					metric_name: "LCP",
				}),
			],
			[vitalDeliveryId],
			{ allowDirectFallback: true }
		);
	});

	test("keeps custom event delivery identities out of payload rows", async () => {
		const customEvent = {
			event_id: "evt_custom_1",
			event_name: "checkout_completed",
			owner_id: "org_1",
			properties: { plan: "pro" },
			timestamp: 1_780_000_000_000,
			website_id: "ws_1",
		};
		await insertCustomEvents([customEvent], "US");
		const customDeliveryId = stableBatchDeliveryId(
			"org_1",
			"custom_event",
			customEvent,
			0
		);
		expect(mockSendBatch).toHaveBeenLastCalledWith(
			"analytics-custom-events",
			[
				expect.objectContaining({
					event_name: "checkout_completed",
				}),
			],
			[customDeliveryId],
			{ allowDirectFallback: true }
		);
		const customPayload = mockSendBatch.mock.calls[
			mockSendBatch.mock.calls.length - 1
		]?.[1] as Array<Record<string, unknown>>;
		expect(customPayload[0]).not.toHaveProperty("delivery_id");
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
			[
				expect.objectContaining({
					delivery_id: stableBatchDeliveryId("ws_1", "error", second, 1),
					message: "b",
				}),
			],
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

const NOW = 1_700_000_000_000;

const fullCtx: TrackEventContext = {
	clientId: "ws_test",
	eventId: "evt_123",
	anonymousId: "salted_anon_1",
	geo: {
		anonymizedIP: "abc123def456",
		country: "United States",
		region: "California",
		city: "San Francisco",
	},
	ua: {
		browserName: "Chrome",
		browserVersion: "120.0",
		osName: "Windows",
		osVersion: "10",
		deviceType: "desktop",
		deviceBrand: "Dell",
		deviceModel: "XPS",
	},
	now: NOW,
};

describe("buildTrackEvent — field mapping", () => {
	test("minimal input → defaults applied", () => {
		const result = buildTrackEvent({ name: "click" }, fullCtx);

		expect(result).toMatchObject({
			event_name: "click",
			timestamp: NOW,
			time: NOW,
			page_count: 1,
			properties: "{}",
			referrer: "",
			path: "",
			url: "",
			title: "",
			session_id: "",
		});
	});

	test("missing geo fields → empty strings", () => {
		const ctx = { ...fullCtx, geo: { anonymizedIP: "" } };
		const result = buildTrackEvent({ name: "x" }, ctx);
		expect(result.ip).toBe("");
		expect(result.country).toBe("");
		expect(result.region).toBe("");
		expect(result.city).toBe("");
	});

	test("missing UA fields → empty strings", () => {
		const ctx = { ...fullCtx, ua: {} };
		const result = buildTrackEvent({ name: "x" }, ctx);
		expect(result.browser_name).toBe("");
		expect(result.os_name).toBe("");
		expect(result.device_type).toBe("");
	});

	test("non-numeric timestamp → uses ctx.now", () => {
		const result = buildTrackEvent(
			{ name: "x", timestamp: "not-a-number", sessionStartTime: null },
			fullCtx
		);
		expect(result.timestamp).toBe(NOW);
	});

	test("performance metrics over the 300s cap → undefined", () => {
		const result = buildTrackEvent({ name: "x", ttfb: 999_999 }, fullCtx);
		expect(result.ttfb).toBeUndefined();
	});

	test("event_name sanitized (truncated to 255)", () => {
		const result = buildTrackEvent({ name: longString(300) }, fullCtx);
		expect(result.event_name.length).toBeLessThanOrEqual(255);
	});

	test("referrer/path/title sanitized (truncated to 2048)", () => {
		const result = buildTrackEvent(
			{
				name: "x",
				referrer: longString(3000),
				path: longString(3000),
				title: longString(3000),
			},
			fullCtx
		);
		expect(result.referrer.length).toBeLessThanOrEqual(2048);
		expect(result.path.length).toBeLessThanOrEqual(2048);
		expect(result.title.length).toBeLessThanOrEqual(2048);
	});
});

describe("buildTrackEvent — sanitization boundary", () => {
	test("properties are JSON-stringified verbatim, not HTML-sanitized", () => {
		const result = buildTrackEvent(
			{ name: "x", properties: { evil: "<script>alert(1)</script>" } },
			fullCtx
		);
		expect(JSON.parse(result.properties as string)).toEqual({
			evil: "<script>alert(1)</script>",
		});
	});

	test("passthrough fields (language, timezone, etc.) are NOT sanitized", () => {
		const result = buildTrackEvent(
			{
				name: "x",
				language: "<img onerror=alert(1)>",
				timezone: "America/New_York",
			},
			fullCtx
		);
		expect(result.language).toBe("<img onerror=alert(1)>");
		expect(result.timezone).toBe("America/New_York");
	});

	test("session_id with stripped tags still passes the session id charset", () => {
		const result = buildTrackEvent(
			{ name: "x", sessionId: "sess<script>123" },
			fullCtx
		);
		expect(result.session_id).toBe("sess123");
	});
});
