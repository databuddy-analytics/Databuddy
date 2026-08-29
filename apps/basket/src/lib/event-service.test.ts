import { describe, expect, test } from "vitest";
import { longString } from "../test-helpers";
import { buildTrackEvent, type TrackEventContext } from "./event-service";

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
